/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const Schemes = Object.freeze({
	file: 'file',
	untitled: 'untitled',
	mailto: 'mailto',
	zycode: 'zycode',
	'zycode-insiders': 'zycode-insiders',
	notebookCell: 'zycode-notebook-cell',
});

export function isOfScheme(scheme: string, link: string): boolean {
	return link.toLowerCase().startsWith(scheme + ':');
}
