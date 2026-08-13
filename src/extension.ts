import * as vscode from 'vscode';
import * as path from 'path';
import { spawn } from 'child_process';
import { getReaders } from './reader';
import { DiagnosticManager } from './diagnostics';
import { registerLanguageFeatures } from './language';

export function activate(context: vscode.ExtensionContext) {
	let currentReader: any = undefined;
	let currentDataFile: vscode.Uri | undefined;
	let currentDataFileHasDs = true;
	const readerTypes = [
		{ value: 0, label: 'PC/SC' },
		{ value: 1, label: 'Q/SC' },
		{ value: 2, label: 'SC/SC' },
		{ value: 3, label: 'PT/SC' }
	];

	const exePath = path.join(context.extensionPath, 'bin', 'card-device-server.exe');
	const output = vscode.window.createOutputChannel('IF SCVM');
	const diagnostics = new DiagnosticManager(exePath, output);
	registerLanguageFeatures(context);
	const readerTypeStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
	const readerStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
	const dataFileStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);

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

	dataFileStatusBar.command = 'if-scvm.selectDataFile';
	updateDataFileStatusBar();
	dataFileStatusBar.show();

	const checkOnSave = vscode.workspace.getConfiguration('if-scvm').get<boolean>('checkOnSave', true);
	void diagnostics.supportsCompile().then(supported => {
		if (!supported) {
			output.appendLine('[INFO] save diagnostics require card_device_server --compile support');
			return;
		}
		if (checkOnSave) {
			context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(document => { diagnostics.compile(document, currentDataFile?.fsPath, currentDataFileHasDs); }));
		}
	});

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

	function updateDataFileStatusBar() {
		if (currentDataFile) {
			dataFileStatusBar.text = `$(database) ${path.basename(currentDataFile.fsPath)}`;
			dataFileStatusBar.tooltip = `Current perso data: ${currentDataFile.fsPath}\nClick to select another data file`;
			return;
		}

		dataFileStatusBar.text = '$(database) No Data';
		dataFileStatusBar.tooltip = 'Click to select a perso data file';
	}

	async function selectDataFile(uri?: vscode.Uri) {
		if (!uri) {
			const selected = await vscode.window.showOpenDialog({
				canSelectFiles: true,
				canSelectFolders: false,
				canSelectMany: false,
				filters: { 'Perso Data': ['prd', 'xh'] },
				title: 'Select perso data file'
			});
			uri = selected?.[0];
		}

		if (!uri) {
			return;
		}

		if (!['.prd', '.xh'].includes(path.extname(uri.fsPath).toLowerCase())) {
			vscode.window.showErrorMessage('Perso data file must use the .prd or .xh extension');
			return;
		}

		const ds = await vscode.window.showQuickPick([
			{ label: 'Yes', description: 'Expose data through ds', value: true },
			{ label: 'No', description: 'Expose data as top-level variables', value: false }
		], { placeHolder: 'Does this perso data file have DS?' });
		if (!ds) {
			return;
		}

		currentDataFile = uri;
		currentDataFileHasDs = ds.value;
		updateDataFileStatusBar();
		output.appendLine(`[INFO] perso data: ${uri.fsPath}, has DS: ${currentDataFileHasDs}`);
	}

	function clearDataFile() {
		currentDataFile = undefined;
		currentDataFileHasDs = true;
		updateDataFileStatusBar();
		output.appendLine('[INFO] perso data cleared');
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

	const selectDataFileCmd = vscode.commands.registerCommand(
		'if-scvm.selectDataFile',
		async (uri?: vscode.Uri) => {
			await selectDataFile(uri);
		}
	);

	const clearDataFileCmd = vscode.commands.registerCommand(
		'if-scvm.clearDataFile',
		() => { clearDataFile(); }
	);

	async function convertScript(uri: vscode.Uri | undefined, flag: '--convert-telecom' | '--convert-finance', label: string) {
		uri ??= vscode.window.activeTextEditor?.document.uri;
		if (!uri) {
			vscode.window.showErrorMessage('No script file selected');
			return;
		}

		const document = vscode.workspace.textDocuments.find(item => item.uri.toString() === uri.toString());
		if (document?.isDirty && !await document.save()) {
			vscode.window.showErrorMessage('Save the script before converting it');
			return;
		}

		output.clear();
		output.show(true);
		output.appendLine(`[INFO] convert ${label.toLowerCase()} script`);
		output.appendLine(`[INFO] script: ${uri.fsPath}`);

		const args = ['--json', '--script', uri.fsPath, flag, 'true'];
		output.appendLine('[INFO] args: ' + JSON.stringify(args));
		const child = spawn(exePath, args);
		let stdout = '';

		child.stdout.on('data', buffer => { stdout += buffer.toString(); });
		child.stderr.on('data', buffer => { output.appendLine('[STDERR] ' + buffer.toString()); });
		child.on('error', error => {
			output.appendLine(`[ERROR] ${error.message}`);
			vscode.window.showErrorMessage(`${label} script conversion failed`);
		});
		child.on('close', code => {
			for (const line of stdout.split(/\r?\n/)) {
				if (!line.trim()) {
					continue;
				}

				try {
					const result = JSON.parse(line) as { type?: string; message?: string };
					output.appendLine(`[${(result.type ?? 'info').toUpperCase()}] ${result.message ?? line}`);
				} catch {
					output.appendLine(line);
				}
			}

			output.appendLine(`[INFO] process exit: ${code}`);
			if (code === 0) {
				vscode.window.showInformationMessage(`${label} script converted`);
			} else {
				vscode.window.showErrorMessage(`${label} script conversion failed`);
			}
		});
	}

	const convertTelecomCmd = vscode.commands.registerCommand(
		'if-scvm.convertTelecom',
		async (uri?: vscode.Uri) => { await convertScript(uri, '--convert-telecom', 'Telecom'); }
	);

	const convertFinanceCmd = vscode.commands.registerCommand(
		'if-scvm.convertFinance',
		async (uri?: vscode.Uri) => { await convertScript(uri, '--convert-finance', 'Finance'); }
	);

	// 运行脚本
	const runCmd = vscode.commands.registerCommand(
		'if-scvm.run',
		async (uri?: vscode.Uri) => {
			uri ??= vscode.window.activeTextEditor?.document.uri;
			if (!uri) {
				vscode.window.showErrorMessage('No script file selected');
				return;
			}

			output.clear();
			output.show(true);
			diagnostics.clear();

			output.appendLine('[INFO] start script');
			output.appendLine(`[INFO] exe: ${exePath}`);
			output.appendLine(`[INFO] script: ${uri.fsPath}`);

			const config = vscode.workspace.getConfiguration('if-scvm');
			const readerType = config.get<number>('readerType', 0);
			const protocol = config.get<number>('protocol', 1);
			const showCardLogs = config.get<boolean>('showCardLogs', true);

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
				String(protocol)
			];
			args.push('--show-card-logs', String(showCardLogs));

			if (currentDataFile) {
				args.push('--data', currentDataFile.fsPath, '--has-ds', String(currentDataFileHasDs));
			}

			output.appendLine('[INFO] args: ' + JSON.stringify(args));
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
							diagnostics.addJson(obj);

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
					output.appendLine(`[INFO] process exit: ${code}`);
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
	context.subscriptions.push(convertTelecomCmd);
	context.subscriptions.push(convertFinanceCmd);
	context.subscriptions.push(selectReaderCmd);
	context.subscriptions.push(selectDataFileCmd);
	context.subscriptions.push(clearDataFileCmd);
	context.subscriptions.push(readerTypeStatusBar);
	context.subscriptions.push(selectReaderTypeCmd);
	context.subscriptions.push(readerStatusBar);
	context.subscriptions.push(dataFileStatusBar);
	context.subscriptions.push(output);
	context.subscriptions.push(diagnostics);
}

export function deactivate() { }
