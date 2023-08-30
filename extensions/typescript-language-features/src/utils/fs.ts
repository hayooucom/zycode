/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';

export async function exists(resource: zycode.Uri): Promise<boolean> {
	try {
		const stat = await zycode.workspace.fs.stat(resource);
		// stat.type is an enum flag
		return !!(stat.type & zycode.FileType.File);
	} catch {
		return false;
	}
}

export function looksLikeAbsoluteWindowsPath(path: string): boolean {
	return /^[a-zA-Z]:[\/\\]/.test(path);
}
