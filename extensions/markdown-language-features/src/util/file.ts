/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import * as URI from 'zycode-uri';
import { Schemes } from './schemes';

export const markdownFileExtensions = Object.freeze<string[]>([
	'md',
	'mkd',
	'mdwn',
	'mdown',
	'markdown',
	'markdn',
	'mdtxt',
	'mdtext',
	'workbook',
]);

export function isMarkdownFile(document: zycode.TextDocument) {
	return document.languageId === 'markdown';
}

export function looksLikeMarkdownPath(resolvedHrefPath: zycode.Uri): boolean {
	const doc = zycode.workspace.textDocuments.find(doc => doc.uri.toString() === resolvedHrefPath.toString());
	if (doc) {
		return isMarkdownFile(doc);
	}

	if (resolvedHrefPath.scheme === Schemes.notebookCell) {
		for (const notebook of zycode.workspace.notebookDocuments) {
			for (const cell of notebook.getCells()) {
				if (cell.kind === zycode.NotebookCellKind.Markup && isMarkdownFile(cell.document)) {
					return true;
				}
			}
		}
		return false;
	}

	return markdownFileExtensions.includes(URI.Utils.extname(resolvedHrefPath).toLowerCase().replace('.', ''));
}
