import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import * as vscode from 'vscode';

interface DiagnosticData {
	filepath: string;
	line: number;
	column: number;
	message: string;
	severity: vscode.DiagnosticSeverity;
}

const locationPattern = /^(.+):(\d+):(\d+):\s*(?:(syntax error|runtime error|error|warning):\s*)?(.+?)(?:,\s*elapsed:\s*[\d.]+s)?$/i;

export class DiagnosticManager implements vscode.Disposable {
	private readonly collection = vscode.languages.createDiagnosticCollection('if-scvm');
	private readonly compilations = new Map<string, ChildProcessWithoutNullStreams>();

	constructor(private readonly exePath: string, private readonly output: vscode.OutputChannel) {}

	dispose(): void {
		for (const child of this.compilations.values()) {
			child.kill();
		}
		this.collection.dispose();
	}

	clear(): void {
		this.collection.clear();
	}

	addJson(value: unknown): boolean {
		if (!value || typeof value !== 'object') {
			return false;
		}

		const record = value as Record<string, unknown>;
		const message = typeof record.message === 'string' ? record.message : undefined;
		const filepath = typeof record.filepath === 'string'
			? record.filepath
			: typeof record.file === 'string' ? record.file : undefined;
		const line = typeof record.line === 'number' ? record.line : undefined;
		const column = typeof record.column === 'number' ? record.column : undefined;

		if (filepath && line !== undefined && column !== undefined && message) {
			this.add({
				filepath,
				line,
				column,
				message,
				severity: severityFrom(record.severity ?? record.type)
			});
			return true;
		}

		return message ? this.addMessage(message) : false;
	}

	addMessage(message: string): boolean {
		const match = message.match(locationPattern);
		if (!match) {
			return false;
		}

		const [, filepath, line, column, category, detail] = match;
		this.add({
			filepath,
			line: Number(line),
			column: Number(column),
			message: category ? `${category}: ${detail}` : detail,
			severity: category?.toLowerCase() === 'warning' ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error
		});
		return true;
	}

	async supportsCompile(): Promise<boolean> {
		return new Promise(resolve => {
			const child = spawn(this.exePath, ['--help']);
			let output = '';
			child.stdout.on('data', buffer => { output += buffer.toString(); });
			child.stderr.on('data', buffer => { output += buffer.toString(); });
			child.on('error', () => { resolve(false); });
			child.on('close', () => { resolve(output.includes('--compile')); });
		});
	}

	compile(document: vscode.TextDocument): void {
		if (document.languageId !== 'if' || document.isUntitled) {
			return;
		}

		const key = document.uri.toString();
		this.compilations.get(key)?.kill();
		this.collection.clear();

		const config = vscode.workspace.getConfiguration('if-scvm');
		const args = [
			'--compile',
			'--json',
			'--script',
			document.uri.fsPath,
			'--convert',
			String(config.get<boolean>('convert', false))
		];
		const dataFile = config.get<string>('dataFile', '');
		if (dataFile) {
			args.push('--data', dataFile);
		}

		const child = spawn(this.exePath, args);
		this.compilations.set(key, child);
		let buffer = '';
		const consume = (chunk: string) => {
			buffer += chunk;
			const lines = buffer.split(/\r?\n/);
			buffer = lines.pop() ?? '';
			for (const line of lines) {
				this.consumeLine(line);
			}
		};

		child.stdout.on('data', value => { consume(value.toString()); });
		child.stderr.on('data', value => { consume(value.toString()); });
		child.on('error', error => { this.output.appendLine(`[CHECK] ${error.message}`); });
		child.on('close', () => {
			if (buffer.trim()) {
				this.consumeLine(buffer);
			}
			this.compilations.delete(key);
		});
	}

	private consumeLine(line: string): void {
		if (!line.trim()) {
			return;
		}
		try {
			this.addJson(JSON.parse(line));
		} catch {
			this.addMessage(line);
		}
	}

	private add(data: DiagnosticData): void {
		const uri = vscode.Uri.file(data.filepath);
		const line = Math.max(data.line - 1, 0);
		const column = Math.max(data.column - 1, 0);
		const range = new vscode.Range(line, column, line, column + 1);
		const diagnostic = new vscode.Diagnostic(range, data.message, data.severity);
		diagnostic.source = 'card-script';
		this.collection.set(uri, [...(this.collection.get(uri) ?? []), diagnostic]);
	}
}

function severityFrom(value: unknown): vscode.DiagnosticSeverity {
	return typeof value === 'string' && value.toLowerCase() === 'warning'
		? vscode.DiagnosticSeverity.Warning
		: vscode.DiagnosticSeverity.Error;
}
