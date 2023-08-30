/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as zycode from 'zycode';

/**
 * Change the top-most visible line of `editor` to be at `line`
 */
export function scrollEditorToLine(
	line: number,
	editor: zycode.TextEditor
) {
	const revealRange = toRevealRange(line, editor);
	editor.revealRange(revealRange, zycode.TextEditorRevealType.AtTop);
}

function toRevealRange(line: number, editor: zycode.TextEditor): zycode.Range {
	line = Math.max(0, line);
	const sourceLine = Math.floor(line);
	if (sourceLine >= editor.document.lineCount) {
		return new zycode.Range(editor.document.lineCount - 1, 0, editor.document.lineCount - 1, 0);
	}

	const fraction = line - sourceLine;
	const text = editor.document.lineAt(sourceLine).text;
	const start = Math.floor(fraction * text.length);
	return new zycode.Range(sourceLine, start, sourceLine + 1, 0);
}

export class StartingScrollFragment {
	public readonly type = 'fragment';

	constructor(
		public readonly fragment: string,
	) { }
}

export class StartingScrollLine {
	public readonly type = 'line';

	constructor(
		public readonly line: number,
	) { }
}

export type StartingScrollLocation = StartingScrollLine | StartingScrollFragment;
