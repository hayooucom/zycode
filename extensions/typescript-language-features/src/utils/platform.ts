/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';

export function isWeb(): boolean {
	return 'navigator' in globalThis && zycode.env.uiKind === zycode.UIKind.Web;
}

export function isWebAndHasSharedArrayBuffers(): boolean {
	return isWeb() && (globalThis as any)['crossOriginIsolated'];
}
