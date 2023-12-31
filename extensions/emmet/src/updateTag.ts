/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import { getHtmlFlatNode, validate } from './util';
import { HtmlNode as HtmlFlatNode } from 'EmmetFlatNode';
import { getRootNode } from './parseDocument';

interface TagRange {
	name: string;
	range: zycode.Range;
}

export async function updateTag(tagName: string | undefined): Promise<boolean | undefined> {
	if (!validate(false) || !zycode.window.activeTextEditor) {
		return;
	}

	const editor = zycode.window.activeTextEditor;
	const document = editor.document;
	const rootNode = <HtmlFlatNode>getRootNode(document, true);
	if (!rootNode) {
		return;
	}

	const rangesToUpdate = Array.from(editor.selections).reverse()
		.reduce<TagRange[]>((prev, selection) =>
			prev.concat(getRangesToUpdate(document, selection, rootNode)), []);
	if (!rangesToUpdate.length) {
		return;
	}
	const firstTagName = rangesToUpdate[0].name;
	const tagNamesAreEqual = rangesToUpdate.every(range => range.name === firstTagName);

	if (tagName === undefined) {
		tagName = await zycode.window.showInputBox({
			prompt: 'Enter Tag',
			value: tagNamesAreEqual ? firstTagName : undefined
		});

		// TODO: Accept fragments for JSX and TSX
		if (!tagName) {
			return false;
		}
	}

	return editor.edit(editBuilder => {
		rangesToUpdate.forEach(tagRange => {
			editBuilder.replace(tagRange.range, tagName!);
		});
	});
}

function getRangesFromNode(node: HtmlFlatNode, document: zycode.TextDocument): TagRange[] {
	const ranges: TagRange[] = [];
	if (node.open) {
		const start = document.positionAt(node.open.start);
		ranges.push({
			name: node.name,
			range: new zycode.Range(start.translate(0, 1), start.translate(0, 1).translate(0, node.name.length))
		});
	}
	if (node.close) {
		const endTagStart = document.positionAt(node.close.start);
		const end = document.positionAt(node.close.end);
		ranges.push({
			name: node.name,
			range: new zycode.Range(endTagStart.translate(0, 2), end.translate(0, -1))
		});
	}
	return ranges;
}

function getRangesToUpdate(document: zycode.TextDocument, selection: zycode.Selection, rootNode: HtmlFlatNode): TagRange[] {
	const documentText = document.getText();
	const offset = document.offsetAt(selection.start);
	const nodeToUpdate = getHtmlFlatNode(documentText, rootNode, offset, true);
	if (!nodeToUpdate) {
		return [];
	}
	return getRangesFromNode(nodeToUpdate, document);
}
