import * as vscode from 'vscode';

interface LanguageEntry {
	label: string;
	detail: string;
	documentation: string;
	kind: vscode.CompletionItemKind;
	insertText?: string | vscode.SnippetString;
	signature?: string;
	parameters?: string[];
}

const keywordEntries: LanguageEntry[] = [
	{ label: 'if', detail: 'if statement', documentation: 'Run a block when the condition is true.', kind: vscode.CompletionItemKind.Keyword, insertText: new vscode.SnippetString('if ${1:condition} {\n\t$0\n}') },
	{ label: 'else', detail: 'else statement', documentation: 'Run a fallback block.', kind: vscode.CompletionItemKind.Keyword },
	{ label: 'while', detail: 'while loop', documentation: 'Repeat a block while the condition is true.', kind: vscode.CompletionItemKind.Keyword, insertText: new vscode.SnippetString('while ${1:condition} {\n\t$0\n}') },
	{ label: 'for', detail: 'for loop', documentation: 'Iterate over a value or run a traditional for loop.', kind: vscode.CompletionItemKind.Keyword, insertText: new vscode.SnippetString('for ${1:value} in ${2:values} {\n\t$0\n}') },
	{ label: 'switch', detail: 'switch statement', documentation: 'Select a block by matching an expression.', kind: vscode.CompletionItemKind.Keyword, insertText: new vscode.SnippetString('switch ${1:value} {\ncase ${2:match}: {\n\t$0\n}\ndefault: {\n}\n}') },
	{ label: 'func', detail: 'function expression', documentation: 'Create a function closure.', kind: vscode.CompletionItemKind.Keyword, insertText: new vscode.SnippetString('func(${1:args}) {\n\t$0\n}') },
	{ label: 'import', detail: 'import statement', documentation: 'Expand another script into the current global scope.', kind: vscode.CompletionItemKind.Keyword, insertText: new vscode.SnippetString('import "${1:path}"') },
	...['in', 'case', 'default', 'break', 'continue', 'return'].map(label => ({
		label,
		detail: `${label} keyword`,
		documentation: `Card Script ${label} keyword.`,
		kind: vscode.CompletionItemKind.Keyword
	}))
];

const valueEntries: LanguageEntry[] = [
	...['true', 'false', 'null'].map(label => ({
		label,
		detail: 'literal',
		documentation: `The ${label} literal.`,
		kind: vscode.CompletionItemKind.Value
	})),
	{ label: 'RST', detail: 'card reset operation', documentation: 'Reset the card and return its ATR.', kind: vscode.CompletionItemKind.Constant },
	{ label: 'PPS', detail: 'PPS operation', documentation: 'Perform protocol and parameter selection.', kind: vscode.CompletionItemKind.Constant },
	{ label: 'crypto', detail: 'cryptography built-in object', documentation: 'Cryptography helper methods.', kind: vscode.CompletionItemKind.Module },
	{ label: 'tlv', detail: 'BER-TLV built-in object', documentation: 'BER-TLV parsing and lookup helpers.', kind: vscode.CompletionItemKind.Module }
];

const functionEntries: LanguageEntry[] = [
	entry('print', 'print(...values)', 'Write values to the script output.', ['...values']),
	entry('type', 'type(value)', 'Return the runtime type name.', ['value']),
	entry('len', 'len(value)', 'Return the length of a string, list, or hash.', ['value']),
	entry('int', 'int(value, base = 10)', 'Convert a value to an integer.', ['value', 'base']),
	entry('float', 'float(value)', 'Convert a value to a floating-point number.', ['value']),
	entry('str', 'str(value)', 'Convert a value to a string.', ['value']),
	entry('sleep', 'sleep(milliseconds)', 'Block script execution for the given duration.', ['milliseconds']),
	entry('panic', 'panic(message)', 'Stop the script with a runtime error.', ['message']),
	entry('exit', 'exit(code)', 'Terminate the host process with an exit code.', ['code'])
];

const objectEntries: Record<string, LanguageEntry[]> = {
	crypto: [
		entry('randomHex', 'crypto.randomHex(length)', 'Generate random bytes as an uppercase hexadecimal string.', ['length']),
		entry('cipher', 'crypto.cipher(type, data, key, iv, op)', 'Run a supported 3DES or AES cipher operation.', ['type', 'data', 'key', 'iv', 'op']),
		entry('TDesMac', 'crypto.TDesMac(data, key, ivec)', 'Calculate a PBOC 3DES MAC.', ['data', 'key', 'ivec']),
		entry('aesCbcMac', 'crypto.aesCbcMac(data, key)', 'Calculate an AES CBC-MAC.', ['data', 'key']),
		entry('aesCmac', 'crypto.aesCmac(data, key)', 'Calculate an AES-CMAC.', ['data', 'key']),
		entry('milenage', 'crypto.milenage(ki, opc, rand, sqn, amf)', 'Run the Milenage authentication algorithms.', ['ki', 'opc', 'rand', 'sqn', 'amf'])
	],
	tlv: [
		entry('parse', 'tlv.parse(hex)', 'Parse BER-TLV hexadecimal data.', ['hex']),
		entry('find', 'tlv.find(nodes, tag)', 'Find the first matching tag recursively.', ['nodes', 'tag'])
	]
};

const methodEntries: LanguageEntry[] = [
	entry('len', 'value.len()', 'Return the value length.', []),
	entry('upper', 'string.upper()', 'Return an uppercase string.', []),
	entry('lower', 'string.lower()', 'Return a lowercase string.', []),
	entry('split', 'string.split(separator)', 'Split a string into a list.', ['separator']),
	entry('find', 'string.find(text)', 'Test whether a string contains text.', ['text']),
	entry('index', 'value.index(value)', 'Return the first matching index, or -1.', ['value']),
	entry('prefix', 'string.prefix(text)', 'Test whether a string starts with text.', ['text']),
	entry('suffix', 'string.suffix(text)', 'Test whether a string ends with text.', ['text']),
	entry('trim', 'string.trim(characters)', 'Remove matching characters from both ends.', ['characters']),
	entry('repeat', 'string.repeat(count)', 'Repeat a string.', ['count']),
	entry('replace', 'string.replace(old, new)', 'Replace all matching substrings.', ['old', 'new']),
	entry('mid', 'string.mid(start, length)', 'Return a substring.', ['start', 'length']),
	entry('xor', 'string.xor(hex)', 'XOR two hexadecimal strings.', ['hex']),
	entry('toHexString', 'value.toHexString()', 'Convert an integer or string to hexadecimal text.', []),
	entry('toAsciiString', 'string.toAsciiString()', 'Convert hexadecimal text to byte text.', []),
	entry('append', 'list.append(...values)', 'Append values to a list.', ['...values']),
	entry('pop', 'list.pop()', 'Remove and return the last list item.', []),
	entry('shift', 'list.shift()', 'Remove and return the first list item.', []),
	entry('insert', 'list.insert(index, ...values)', 'Insert values at a list index.', ['index', '...values']),
	entry('remove', 'value.remove(key)', 'Remove a list index or hash key.', ['key']),
	entry('clear', 'value.clear()', 'Remove all list items or hash pairs.', []),
	entry('extend', 'list.extend(other)', 'Append all items from another list.', ['other']),
	entry('join', 'list.join(separator)', 'Join list items into a string.', ['separator']),
	entry('json', 'value.json()', 'Return a JSON-style string representation.', []),
	entry('copy', 'value.copy()', 'Return a deep copy.', []),
	entry('has', 'hash.has(key)', 'Test whether a hash contains a key.', ['key']),
	entry('get', 'hash.get(key, default = null)', 'Read a hash value with an optional default.', ['key', 'default']),
	entry('set', 'hash.set(key, value)', 'Set a hash value.', ['key', 'value']),
	entry('keys', 'hash.keys()', 'Return all hash keys.', []),
	entry('values', 'hash.values()', 'Return all hash values.', []),
	entry('update', 'hash.update(other)', 'Merge another hash into this hash.', ['other'])
];

const allEntries = [...keywordEntries, ...valueEntries, ...functionEntries];
const entryByLabel = new Map(allEntries.map(item => [item.label, item]));
const methodByLabel = new Map(methodEntries.map(item => [item.label, item]));

function entry(label: string, signature: string, documentation: string, parameters: string[]): LanguageEntry {
	return {
		label,
		detail: signature,
		documentation,
		kind: vscode.CompletionItemKind.Function,
		insertText: new vscode.SnippetString(`${label}(${parameters.map((parameter, index) => `\${${index + 1}:${parameter}}`).join(', ')})`),
		signature,
		parameters
	};
}

function completionItem(item: LanguageEntry): vscode.CompletionItem {
	const completion = new vscode.CompletionItem(item.label, item.kind);
	completion.detail = item.detail;
	completion.documentation = new vscode.MarkdownString(item.documentation);
	completion.insertText = item.insertText;
	return completion;
}

function entryAt(document: vscode.TextDocument, position: vscode.Position): LanguageEntry | undefined {
	const range = document.getWordRangeAtPosition(position);
	if (!range) {
		return undefined;
	}

	const word = document.getText(range);
	const prefix = document.getText(new vscode.Range(range.start.line, 0, range.start.line, range.start.character));
	const qualifier = prefix.match(/([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*$/)?.[1];
	if (qualifier && objectEntries[qualifier]) {
		return objectEntries[qualifier].find(item => item.label === word);
	}

	if (qualifier) {
		return methodByLabel.get(word);
	}

	return entryByLabel.get(word);
}

function callAt(document: vscode.TextDocument, position: vscode.Position): { entry: LanguageEntry; activeParameter: number } | undefined {
	const source = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
	let parenthesisDepth = 0;
	let collectionDepth = 0;
	let activeParameter = 0;
	let quote = '';

	for (let index = source.length - 1; index >= 0; index -= 1) {
		const char = source[index];
		if (quote) {
			if (char === quote && source[index - 1] !== '\\') {
				quote = '';
			}
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			continue;
		}
		if (char === ')') {
			parenthesisDepth += 1;
		} else if (char === '(') {
			if (parenthesisDepth > 0) {
				parenthesisDepth -= 1;
				continue;
			}

			const name = source.slice(0, index).match(/([A-Za-z_][A-Za-z0-9_]*(?:\s*\.\s*[A-Za-z_][A-Za-z0-9_]*)?)\s*$/)?.[1]?.replace(/\s/g, '');
			if (!name) {
				return undefined;
			}
			const [qualifier, label] = name.includes('.') ? name.split('.') : ['', name];
			const item = qualifier
				? objectEntries[qualifier]?.find(candidate => candidate.label === label) ?? methodByLabel.get(label)
				: entryByLabel.get(label);
			return item?.signature ? { entry: item, activeParameter } : undefined;
		} else if (char === ']' || char === '}') {
			collectionDepth += 1;
		} else if (char === '[' || char === '{') {
			collectionDepth = Math.max(collectionDepth - 1, 0);
		} else if (char === ',' && parenthesisDepth === 0 && collectionDepth === 0) {
			activeParameter += 1;
		}
	}

	return undefined;
}

export function registerLanguageFeatures(context: vscode.ExtensionContext): void {
	const selector: vscode.DocumentSelector = { language: 'if', scheme: 'file' };

	context.subscriptions.push(vscode.languages.registerCompletionItemProvider(selector, {
		provideCompletionItems(document, position) {
			const prefix = document.lineAt(position).text.slice(0, position.character);
			const qualifier = prefix.match(/([A-Za-z_][A-Za-z0-9_]*)\.\w*$/)?.[1];
			const entries = qualifier ? objectEntries[qualifier] ?? methodEntries : allEntries;
			return entries.map(completionItem);
		}
	}, '.'));

	context.subscriptions.push(vscode.languages.registerHoverProvider(selector, {
		provideHover(document, position) {
			const item = entryAt(document, position);
			if (!item) {
				return undefined;
			}
			const contents = new vscode.MarkdownString();
			contents.appendCodeblock(item.signature ?? item.detail, 'card-script');
			contents.appendMarkdown(item.documentation);
			return new vscode.Hover(contents);
		}
	}));

	context.subscriptions.push(vscode.languages.registerSignatureHelpProvider(selector, {
		provideSignatureHelp(document, position) {
			const call = callAt(document, position);
			if (!call || !call.entry.signature) {
				return undefined;
			}
			const signature = new vscode.SignatureInformation(call.entry.signature, new vscode.MarkdownString(call.entry.documentation));
			signature.parameters = (call.entry.parameters ?? []).map(parameter => new vscode.ParameterInformation(parameter));
			const help = new vscode.SignatureHelp();
			help.signatures = [signature];
			help.activeSignature = 0;
			help.activeParameter = Math.min(call.activeParameter, Math.max(signature.parameters.length - 1, 0));
			return help;
		}
	}, '(', ','));
}
