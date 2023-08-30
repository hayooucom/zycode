/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';

/**
 * Minimal version of {@link zycode.TextDocument}.
 */
export interface ITextDocument {
	readonly uri: zycode.Uri;
	readonly version: number;

	getText(): string;
}

