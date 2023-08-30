/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import { validate, isStyleSheet } from './util';
import { nextItemHTML, prevItemHTML } from './selectItemHTML';
import { nextItemStylesheet, prevItemStylesheet } from './selectItemStylesheet';
import { HtmlNode, CssNode } from 'EmmetFlatNode';
import { getRootNode } from './parseDocument';

export function fetchSelectItem(direction: string): void {
	if (!validate() || !zycode.window.activeTextEditor) {
		return;
	}
	const editor = zycode.window.activeTextEditor;
	const document = editor.document;
	const rootNode = getRootNode(document, true);
	if (!rootNode) {
		return;
	}

	const newSelections: zycode.Selection[] = [];
	editor.selections.forEach(selection => {
		const selectionStart = selection.isReversed ? selection.active : selection.anchor;
		const selectionEnd = selection.isReversed ? selection.anchor : selection.active;

		let updatedSelection;
		if (isStyleSheet(editor.document.languageId)) {
			updatedSelection = direction === 'next' ?
				nextItemStylesheet(document, selectionStart, selectionEnd, <CssNode>rootNode) :
				prevItemStylesheet(document, selectionStart, selectionEnd, <CssNode>rootNode);
		} else {
			updatedSelection = direction === 'next' ?
				nextItemHTML(document, selectionStart, selectionEnd, <HtmlNode>rootNode) :
				prevItemHTML(document, selectionStart, selectionEnd, <HtmlNode>rootNode);
		}
		newSelections.push(updatedSelection ? updatedSelection : selection);
	});
	editor.selections = newSelections;
	editor.revealRange(editor.selections[editor.selections.length - 1]);
}
