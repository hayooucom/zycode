/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import { getHtmlFlatNode, offsetRangeToSelection, validate } from './util';
import { getRootNode } from './parseDocument';
import { HtmlNode as HtmlFlatNode } from 'EmmetFlatNode';

let balanceOutStack: Array<readonly zycode.Selection[]> = [];
let lastBalancedSelections: readonly zycode.Selection[] = [];

export function balanceOut() {
	balance(true);
}

export function balanceIn() {
	balance(false);
}

function balance(out: boolean) {
	if (!validate(false) || !zycode.window.activeTextEditor) {
		return;
	}
	const editor = zycode.window.activeTextEditor;
	const document = editor.document;
	const rootNode = <HtmlFlatNode>getRootNode(document, true);
	if (!rootNode) {
		return;
	}

	const rangeFn = out ? getRangeToBalanceOut : getRangeToBalanceIn;
	let newSelections: readonly zycode.Selection[] = editor.selections.map(selection => {
		return rangeFn(document, rootNode, selection);
	});

	// check whether we are starting a balance elsewhere
	if (areSameSelections(lastBalancedSelections, editor.selections)) {
		// we are not starting elsewhere, so use the stack as-is
		if (out) {
			// make sure we are able to expand outwards
			if (!areSameSelections(editor.selections, newSelections)) {
				balanceOutStack.push(editor.selections);
			}
		} else if (balanceOutStack.length) {
			newSelections = balanceOutStack.pop()!;
		}
	} else {
		// we are starting elsewhere, so reset the stack
		balanceOutStack = out ? [editor.selections] : [];
	}

	editor.selections = newSelections;
	lastBalancedSelections = editor.selections;
}

function getRangeToBalanceOut(document: zycode.TextDocument, rootNode: HtmlFlatNode, selection: zycode.Selection): zycode.Selection {
	const offset = document.offsetAt(selection.start);
	const nodeToBalance = getHtmlFlatNode(document.getText(), rootNode, offset, false);
	if (!nodeToBalance) {
		return selection;
	}
	if (!nodeToBalance.open || !nodeToBalance.close) {
		return offsetRangeToSelection(document, nodeToBalance.start, nodeToBalance.end);
	}

	// Set reverse direction if we were in the end tag
	let innerSelection: zycode.Selection;
	let outerSelection: zycode.Selection;
	if (nodeToBalance.close.start <= offset && nodeToBalance.close.end > offset) {
		innerSelection = offsetRangeToSelection(document, nodeToBalance.close.start, nodeToBalance.open.end);
		outerSelection = offsetRangeToSelection(document, nodeToBalance.close.end, nodeToBalance.open.start);
	}
	else {
		innerSelection = offsetRangeToSelection(document, nodeToBalance.open.end, nodeToBalance.close.start);
		outerSelection = offsetRangeToSelection(document, nodeToBalance.open.start, nodeToBalance.close.end);
	}

	if (innerSelection.contains(selection) && !innerSelection.isEqual(selection)) {
		return innerSelection;
	}
	if (outerSelection.contains(selection) && !outerSelection.isEqual(selection)) {
		return outerSelection;
	}
	return selection;
}

function getRangeToBalanceIn(document: zycode.TextDocument, rootNode: HtmlFlatNode, selection: zycode.Selection): zycode.Selection {
	const offset = document.offsetAt(selection.start);
	const nodeToBalance = getHtmlFlatNode(document.getText(), rootNode, offset, true);
	if (!nodeToBalance) {
		return selection;
	}

	const selectionStart = document.offsetAt(selection.start);
	const selectionEnd = document.offsetAt(selection.end);
	if (nodeToBalance.open && nodeToBalance.close) {
		const entireNodeSelected = selectionStart === nodeToBalance.start && selectionEnd === nodeToBalance.end;
		const startInOpenTag = selectionStart > nodeToBalance.open.start && selectionStart < nodeToBalance.open.end;
		const startInCloseTag = selectionStart > nodeToBalance.close.start && selectionStart < nodeToBalance.close.end;

		if (entireNodeSelected || startInOpenTag || startInCloseTag) {
			return offsetRangeToSelection(document, nodeToBalance.open.end, nodeToBalance.close.start);
		}
	}

	if (!nodeToBalance.firstChild) {
		return selection;
	}

	const firstChild = nodeToBalance.firstChild;
	if (selectionStart === firstChild.start
		&& selectionEnd === firstChild.end
		&& firstChild.open
		&& firstChild.close) {
		return offsetRangeToSelection(document, firstChild.open.end, firstChild.close.start);
	}

	return offsetRangeToSelection(document, firstChild.start, firstChild.end);
}

function areSameSelections(a: readonly zycode.Selection[], b: readonly zycode.Selection[]): boolean {
	if (a.length !== b.length) {
		return false;
	}
	for (let i = 0; i < a.length; i++) {
		if (!a[i].isEqual(b[i])) {
			return false;
		}
	}
	return true;
}
