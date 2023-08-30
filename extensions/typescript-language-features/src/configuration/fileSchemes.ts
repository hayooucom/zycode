/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import { isWeb } from '../utils/platform';

export const file = 'file';
export const untitled = 'untitled';
export const git = 'git';
export const github = 'github';
export const azurerepos = 'azurerepos';

/** Live share scheme */
export const vsls = 'vsls';
export const walkThroughSnippet = 'walkThroughSnippet';
export const vscodeNotebookCell = 'zycode-notebook-cell';
export const memFs = 'memfs';
export const vscodeVfs = 'zycode-vfs';
export const officeScript = 'office-script';

export function getSemanticSupportedSchemes() {
	if (isWeb() && zycode.workspace.workspaceFolders) {
		return zycode.workspace.workspaceFolders.map(folder => folder.uri.scheme);
	}

	return [
		file,
		untitled,
		walkThroughSnippet,
		vscodeNotebookCell,
	];
}

/**
 * File scheme for which JS/TS language feature should be disabled
 */
export const disabledSchemes = new Set([
	git,
	vsls,
	github,
	azurerepos,
]);
