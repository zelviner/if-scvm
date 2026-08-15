const indentText = '    ';

type BlockKind = 'normal' | 'case';

interface Block {
	kind: BlockKind;
	closers: number;
}

interface Token {
	text: string;
	kind: 'word' | 'string' | 'operator' | 'punctuation';
}

interface LineParts {
	code: string;
	comment: string;
	continuesBlockComment: boolean;
}

interface GroupEvent {
	group: '{' | '}' | '[' | ']';
	index: number;
}

const operators = [
	'<<=', '>>=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '->', '++', '--',
	'<<', '>>', '<=', '>=', '==', '!=', '&&', '||', '+', '-', '*', '/', '%', '~',
	'&', '|', '^', '<', '>', '=', '!', '?'
];

const punctuation = new Set(['(', ')', '[', ']', '{', '}', '.', ',', ';', ':']);
const controlKeywords = new Set(['if', 'while', 'for', 'switch']);

export function formatCardScript(source: string, eol = '\n'): string {
	const hasFinalNewline = /\r?\n$/.test(source);
	const sourceLines = source.split(/\r?\n/);
	if (hasFinalNewline) {
		sourceLines.pop();
	}
	const lines = collapseArrowExpressionLines(sourceLines);

	const result: string[] = [];
	const blocks: Block[] = [];
	let indent = 0;
	let inBlockComment = false;
	let previousWasBlank = false;

	function closeGroup(): BlockKind | undefined {
		const block = blocks.at(-1);
		if (!block) {
			return undefined;
		}
		block.closers -= 1;
		if (block.closers > 0) {
			return undefined;
		}
		blocks.pop();
		return block.kind;
	}

	for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
		const line = lines[lineIndex];
		const parts = splitLine(line, inBlockComment);
		inBlockComment = parts.continuesBlockComment;
		const code = parts.code.trim();
		const comment = parts.comment.trim();

		if (!code && !comment) {
			if (!previousWasBlank && result.length > 0) {
				result.push('');
			}
			previousWasBlank = true;
			continue;
		}

		previousWasBlank = false;
		const groupEvents = groupsIn(code);
		let eventIndex = 0;
		let lineIndent = indent;
		if (!code && comment.startsWith('//') && lineCommentPrecedesCase(lines, lineIndex)) {
			lineIndent = Math.max(indent - 1, 0);
		}

		while (eventIndex < groupEvents.length && isLeadingCloseGroup(code, groupEvents[eventIndex])) {
			const block = blocks.at(-1);
			if (block?.kind === 'case' && block.closers === 1) {
				lineIndent = Math.min(lineIndent, Math.max(indent - 1, 0));
			}
			const closed = closeGroup();
			if (closed === 'normal') {
				indent = Math.max(indent - 1, 0);
				lineIndent = indent;
			}
			eventIndex += 1;
		}

		const isCaseLabel = /^(case\b|default\s*:)/.test(code);
		const caseBlockBraceIndex = isCaseLabel && groupEvents.at(-1)?.group === '{'
			? groupEvents.length - 1
			: -1;
		if (isCaseLabel) {
			lineIndent = Math.max(indent - 1, 0);
		}

		for (; eventIndex < groupEvents.length; eventIndex += 1) {
			const group = groupEvents[eventIndex].group;
			if (group === '{' || group === '[') {
				const closers = adjacentOpeningGroupCount(code, groupEvents, eventIndex);
				if (group === '{' && eventIndex === caseBlockBraceIndex) {
					blocks.push({ kind: 'case', closers });
				} else {
					blocks.push({ kind: 'normal', closers });
					indent += 1;
				}
				eventIndex += closers - 1;
			} else {
				const closed = closeGroup();
				if (closed === 'normal') {
					indent = Math.max(indent - 1, 0);
				}
			}
		}

		const formattedCode = formatCode(code);
		const formattedLine = comment
			? formattedCode ? `${formattedCode} ${comment}` : comment
			: formattedCode;
		result.push(`${indentText.repeat(lineIndent)}${formattedLine}`.trimEnd());
	}

	while (result.at(-1) === '') {
		result.pop();
	}

	const formatted = alignTrailingLineComments(result).join(eol);
	return hasFinalNewline ? `${formatted}${eol}` : formatted;
}

function alignTrailingLineComments(lines: string[]): string[] {
	const result = [...lines];
	let group: Array<{ line: number; comment: number }> = [];

	function align(): void {
		if (group.length < 2) {
			return;
		}
		const column = Math.max(...group.map(item => result[item.line].slice(0, item.comment).trimEnd().length));
		for (const item of group) {
			const code = result[item.line].slice(0, item.comment).trimEnd();
			const comment = result[item.line].slice(item.comment);
			result[item.line] = `${code}${' '.repeat(column - code.length + 1)}${comment}`;
		}
	}

	for (let line = 0; line < result.length; line += 1) {
		const comment = lineCommentIndex(result[line]);
		if (comment > 0 && result[line].slice(0, comment).trim()) {
			group.push({ line, comment });
			continue;
		}
		align();
		group = [];
	}
	align();
	return result;
}

function collapseArrowExpressionLines(lines: string[]): string[] {
	const result: string[] = [];
	for (let index = 0; index < lines.length; index += 1) {
		let line = lines[index];
		if (/^\s*->/.test(line) && result.length > 0 && arrowIndex(result.at(-1) ?? '') === -1) {
			line = `${result.pop()?.trimEnd()} ${line.trimStart()}`;
		}

		while (arrowNeedsContinuation(line) && index + 1 < lines.length && isArrowContinuation(lines[index + 1])) {
			line = `${line.trimEnd()} ${lines[index + 1].trim()}`;
			index += 1;
		}
		result.push(line);
	}
	return result;
}

function arrowNeedsContinuation(line: string): boolean {
	const start = arrowIndex(line);
	if (start === -1) {
		return false;
	}

	const response = line.slice(start + 2).trim();
	if (!response) {
		return true;
	}

	let depth = 0;
	let quote = '';
	for (let index = 0; index < response.length; index += 1) {
		const char = response[index];
		if (quote) {
			if (char === quote && response[index - 1] !== '\\') {
				quote = '';
			}
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
		} else if (char === '(' || char === '[' || char === '{') {
			depth += 1;
		} else if (char === ')' || char === ']' || char === '}') {
			depth -= 1;
		}
	}
	return depth > 0;
}

function isArrowContinuation(line: string): boolean {
	const trimmed = line.trim();
	return trimmed.length > 0 && !trimmed.startsWith('//') && !trimmed.startsWith('/*');
}

function arrowIndex(line: string): number {
	let quote = '';
	for (let index = 0; index < line.length - 1; index += 1) {
		const char = line[index];
		if (quote) {
			if (char === quote && line[index - 1] !== '\\') {
				quote = '';
			}
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			continue;
		}
		if (char === '/' && (line[index + 1] === '/' || line[index + 1] === '*')) {
			return -1;
		}
		if (char === '-' && line[index + 1] === '>') {
			return index;
		}
	}
	return -1;
}

function splitLine(line: string, startedInBlockComment: boolean): LineParts {
	if (startedInBlockComment) {
		const end = line.indexOf('*/');
		if (end === -1) {
			return { code: '', comment: line, continuesBlockComment: true };
		}
		return { code: '', comment: line, continuesBlockComment: false };
	}

	let quote = '';
	for (let index = 0; index < line.length; index += 1) {
		const char = line[index];
		if (quote) {
			if (char === quote && line[index - 1] !== '\\') {
				quote = '';
			}
			continue;
		}

		if (char === '"' || char === "'") {
			quote = char;
			continue;
		}

		const next = line[index + 1];
		if (char === '/' && next === '/') {
			return { code: line.slice(0, index), comment: line.slice(index), continuesBlockComment: false };
		}
		if (char === '/' && next === '*') {
			return {
				code: line.slice(0, index),
				comment: line.slice(index),
				continuesBlockComment: line.indexOf('*/', index + 2) === -1
			};
		}
	}

	return { code: line, comment: '', continuesBlockComment: false };
}

function groupsIn(code: string): GroupEvent[] {
	const groups: GroupEvent[] = [];
	let quote = '';
	for (let index = 0; index < code.length; index += 1) {
		const char = code[index];
		if (quote) {
			if (char === quote && code[index - 1] !== '\\') {
				quote = '';
			}
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
		} else if (char === '{' || char === '}' || char === '[' || char === ']') {
			groups.push({ group: char, index });
		}
	}
	return groups;
}

function isLeadingCloseGroup(code: string, group: GroupEvent): boolean {
	return (group.group === '}' || group.group === ']') && /^[\s}\]]*$/.test(code.slice(0, group.index));
}

function adjacentOpeningGroupCount(code: string, groups: GroupEvent[], start: number): number {
	let count = 1;
	for (let index = start + 1; index < groups.length; index += 1) {
		const previous = groups[index - 1];
		const current = groups[index];
		if ((current.group !== '{' && current.group !== '[') || code.slice(previous.index + 1, current.index).trim()) {
			break;
		}
		count += 1;
	}
	return count;
}

function lineCommentIndex(line: string): number {
	let quote = '';
	for (let index = 0; index < line.length - 1; index += 1) {
		const char = line[index];
		if (quote) {
			if (char === quote && line[index - 1] !== '\\') {
				quote = '';
			}
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
		} else if (char === '/' && line[index + 1] === '/') {
			return index;
		}
	}
	return -1;
}

function lineCommentPrecedesCase(lines: string[], start: number): boolean {
	for (let index = start + 1; index < lines.length; index += 1) {
		const line = lines[index].trim();
		if (!line || line.startsWith('//')) {
			continue;
		}
		return /^(case\b|default\s*:)/.test(line);
	}
	return false;
}

function formatCode(code: string): string {
	const tokens = tokenize(code);
	let result = '';
	let pendingSpace = false;
	let previous: Token | undefined;

	function append(text: string, spaceBefore = false): void {
		if (result && (pendingSpace || spaceBefore) && !result.endsWith(' ')) {
			result += ' ';
		}
		result += text;
		pendingSpace = false;
	}

	for (const token of tokens) {
		if (token.kind === 'punctuation') {
			switch (token.text) {
				case '(':
					append('(', previous?.kind === 'word' && controlKeywords.has(previous.text));
					break;
				case '[':
				case '.':
					append(token.text);
					break;
				case ')':
				case ']':
				case '}':
					result = result.trimEnd();
					append(token.text);
					break;
				case '{':
					append('{', previous !== undefined && !['(', '[', '{', '.'].includes(previous.text));
					break;
				case ',':
				case ';':
					result = result.trimEnd();
					append(token.text);
					pendingSpace = true;
					break;
				case ':':
					result = result.trimEnd();
					append(':');
					pendingSpace = true;
					break;
			}
		} else if (token.kind === 'operator') {
			const unary = (token.text === '+' || token.text === '-' || token.text === '!' || token.text === '~')
				&& (!previous || previous.kind === 'operator' || ['(', '[', '{', ',', ':', ';', '?'].includes(previous.text));
			if (token.text === '++' || token.text === '--' || unary) {
				append(token.text);
			} else {
				append(token.text, true);
				pendingSpace = true;
			}
		} else {
			const needsSpace = previous !== undefined
				&& (previous.kind === 'word' || previous.kind === 'string' || [')', ']', '}'].includes(previous.text));
			append(token.text, needsSpace);
		}
		previous = token;
	}

	return result.trimEnd();
}

function tokenize(code: string): Token[] {
	const tokens: Token[] = [];
	for (let index = 0; index < code.length;) {
		const char = code[index];
		if (/\s/.test(char)) {
			index += 1;
			continue;
		}
		if (char === '"' || char === "'") {
			const quote = char;
			let end = index + 1;
			while (end < code.length && (code[end] !== quote || code[end - 1] === '\\')) {
				end += 1;
			}
			tokens.push({ text: code.slice(index, Math.min(end + 1, code.length)), kind: 'string' });
			index = Math.min(end + 1, code.length);
			continue;
		}
		const operator = operators.find(candidate => code.startsWith(candidate, index));
		if (operator) {
			tokens.push({ text: operator, kind: 'operator' });
			index += operator.length;
			continue;
		}
		if (punctuation.has(char)) {
			tokens.push({ text: char, kind: 'punctuation' });
			index += 1;
			continue;
		}

		let end = index + 1;
		while (end < code.length && !/\s/.test(code[end]) && !punctuation.has(code[end]) && !operators.some(candidate => code.startsWith(candidate, end))) {
			end += 1;
		}
		tokens.push({ text: code.slice(index, end), kind: 'word' });
		index = end;
	}
	return tokens;
}
