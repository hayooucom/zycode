/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import { Schemes } from './schemes';
import { Utils } from 'zycode-uri';

export function getDocumentDir(uri: zycode.Uri): zycode.Uri | undefined {
	const docUri = getParentDocumentUri(uri);
	if (docUri.scheme === Schemes.untitled) {
		return zycode.workspace.workspaceFolders?.[0]?.uri;
	}
	return Utils.dirname(docUri);
}

export function getParentDocumentUri(uri: zycode.Uri): zycode.Uri {
	if (uri.scheme === Schemes.notebookCell) {
		for (const notebook of zycode.workspace.notebookDocuments) {
			for (const cell of notebook.getCells()) {
				if (cell.document.uri.toString() === uri.toString()) {
					return notebook.uri;
				}
			}
		}
	}

	return uri;
}
