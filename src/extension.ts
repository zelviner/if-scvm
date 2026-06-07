import * as vscode from 'vscode';
import * as path from 'path';
import { spawn } from 'child_process';
import { getReaders } from './reader';

export function activate(context: vscode.ExtensionContext) {
	let currentReader: any = undefined;
	const readerTypes = [
		{ value: 0, label: 'PC/SC' },
		{ value: 1, label: 'Q/SC' },
		{ value: 2, label: 'SC/SC' },
		{ value: 3, label: 'PT/SC' }
	];

	const output = vscode.window.createOutputChannel('IF SCVM');
	const readerTypeStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
	const readerStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);

	const config = vscode.workspace.getConfiguration('if-scvm');
	const currentReaderType = config.get<number>('readerType', 0);
	readerTypeStatusBar.command = 'if-scvm.selectReaderType';
	const currentType = readerTypes.find(t => t.value === currentReaderType) ?? readerTypes[0];
	readerTypeStatusBar.text = `$(server) ${currentType.label}`;
	readerTypeStatusBar.tooltip = 'Current Reader Type';

	readerTypeStatusBar.show();

	readerStatusBar.command = 'if-scvm.selectReader';
	readerStatusBar.text = '$(credit-card) No Reader';
	readerStatusBar.tooltip = 'Current Card Reader';
	readerStatusBar.show();

	const exePath = path.join(context.extensionPath, 'bin', 'card_device_server.exe');

	// 选择读卡器类型
	async function selectReaderType() {
		const selected = await vscode.window.showQuickPick(
			readerTypes.map(t => ({
				label: t.label,
				value: t.value
			})),

			{ placeHolder: 'Select reader type' }
		);

		if (!selected) {
			return;
		}

		const config = vscode.workspace.getConfiguration('if-scvm');
		await config.update('readerType', selected.value, vscode.ConfigurationTarget.Global);
		readerTypeStatusBar.text = `$(server) ${selected.label}`;

		// 类型变了，当前读卡器失效
		currentReader = undefined;
		readerStatusBar.text = '$(credit-card) No Reader';
		readerStatusBar.tooltip = 'Current Card Reader';
	}

	// 选择读卡器
	async function selectReader() {
		const config = vscode.workspace.getConfiguration('if-scvm');
		const readerType = config.get<number>('readerType', 0);
		const readers = await getReaders(exePath, readerType);

		if (readers.length === 0) {
			vscode.window.showErrorMessage(
				'No card reader found'
			);
			return undefined;
		}

		const selected = await vscode.window.showQuickPick(
			readers.map(r => ({
				label: r.name,
				description: `index: ${r.index}`,
				reader: r
			})),

			{
				placeHolder: 'Select card reader'
			}
		);

		if (!selected) {
			return undefined;
		}

		currentReader = selected.reader;
		readerStatusBar.text = `$(credit-card) ${selected.reader.name}`;
		readerStatusBar.tooltip = `Reader Index: ${selected.reader.index}`;

		return selected.reader;
	}

	// 状态栏点击
	const selectReaderTypeCmd = vscode.commands.registerCommand(
		'if-scvm.selectReaderType',
		async () => {
			await selectReaderType();
		}
	);


	const selectReaderCmd = vscode.commands.registerCommand(
		'if-scvm.selectReader',
		async () => {
			await selectReader();
		}
	);

	// 运行脚本
	const runCmd = vscode.commands.registerCommand(
		'if-scvm.run',
		async (uri: vscode.Uri) => {
			if (!uri) {
				vscode.window.showErrorMessage('No script file selected');
				return;
			}

			output.clear();
			output.show(true);

			output.appendLine('[INFO] start script');
			output.appendLine(`[INFO] exe: ${exePath}`);
			output.appendLine(`[INFO] script: ${uri.fsPath}`);

			const config = vscode.workspace.getConfiguration('if-scvm');
			const readerType = config.get<number>('readerType', 0);
			const protocol = config.get<number>('protocol', 1);
			const convert = config.get<boolean>('convert', false);
			const dataFile = config.get<string>('dataFile', '');

			// 如果还没选择读卡器
			if (!currentReader) {
				const reader = await selectReader();

				if (!reader) {
					return;
				}
			}

			const args = [
				'--json',

				'--script',
				uri.fsPath,

				'--reader-type',
				String(readerType),

				'--reader-index',
				String(currentReader.index),

				'--protocol',
				String(protocol),

				'--convert',
				String(convert)
			];

			if (dataFile) {
				args.push('--data', dataFile);
			}

			output.appendLine('[INFO] args: ' + JSON.stringify(args));
			const startTime = Date.now();
			const child = spawn(exePath, args);
			let stdoutBuffer = '';

			// stdout
			child.stdout.on(
				'data',
				buf => {
					stdoutBuffer += buf.toString();

					const lines = stdoutBuffer.split('\n');
					stdoutBuffer = lines.pop() || '';

					for (const line of lines) {
						if (!line.trim()) {
							continue;
						}

						try {
							const obj = JSON.parse(line);

							switch (obj.type) {
								case 'info':
									output.appendLine(`[INFO] ${obj.message}`);
									break;

								case 'error':
									output.appendLine(`[ERROR] ${obj.message}`);
									break;

								case 'log':
									output.appendLine(obj.message);
									break;

								case 'apdu':
									output.appendLine(`${obj.cmd} -> ${obj.rsp}`);
									break;

								case 'reader':
									output.appendLine(`[READER] ${obj.name}`);
									break;

								default:
									output.appendLine(line);
									break;
							}

						} catch {
							output.appendLine(line);
						}
					}
				}
			);

			// stderr
			child.stderr.on(
				'data',
				buf => { output.appendLine('[STDERR] ' + buf.toString()); }
			);

			// exit
			child.on(
				'close',
				code => {
					const elapsed = Date.now() - startTime;
					const sec = (elapsed / 1000).toFixed(3);
					output.appendLine(`[INFO] process exit: ${code}`);
					output.appendLine(`[INFO] elapsed: ${sec}s`);
				}
			);

			// error
			child.on(
				'error',
				err => { output.appendLine(`[ERROR] ${err.message}`); }
			);
		}
	);

	context.subscriptions.push(runCmd);
	context.subscriptions.push(selectReaderCmd);
	context.subscriptions.push(readerTypeStatusBar);
	context.subscriptions.push(selectReaderTypeCmd);
	context.subscriptions.push(readerStatusBar);
}

export function deactivate() { }