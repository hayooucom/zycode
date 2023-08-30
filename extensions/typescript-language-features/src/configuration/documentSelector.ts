/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';

export interface DocumentSelector {
	/**
	 * Selector for files which only require a basic syntax server.
	 */
	readonly syntax: readonly zycode.DocumentFilter[];

	/**
	 * Selector for files which require semantic server support.
	 */
	readonly semantic: readonly zycode.DocumentFilter[];
}
