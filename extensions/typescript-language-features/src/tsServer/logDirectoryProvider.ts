/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';

export interface ILogDirectoryProvider {
	getNewLogDirectory(): zycode.Uri | undefined;
}

export const noopLogDirectoryProvider = new class implements ILogDirectoryProvider {
	public getNewLogDirectory(): undefined {
		return undefined;
	}
};
