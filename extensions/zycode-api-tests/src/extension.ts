/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';

export function activate(_context: zycode.ExtensionContext) {
	// Set context as a global as some tests depend on it
	(global as any).testExtensionContext = _context;
}
