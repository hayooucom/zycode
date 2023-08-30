/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';

const noopDisposable = zycode.Disposable.from();

export const nulToken: zycode.CancellationToken = {
	isCancellationRequested: false,
	onCancellationRequested: () => noopDisposable
};
