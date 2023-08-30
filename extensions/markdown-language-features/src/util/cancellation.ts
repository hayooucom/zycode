/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';

export const noopToken: zycode.CancellationToken = new class implements zycode.CancellationToken {
	private readonly _onCancellationRequestedEmitter = new zycode.EventEmitter<void>();
	onCancellationRequested = this._onCancellationRequestedEmitter.event;

	get isCancellationRequested() { return false; }
};
