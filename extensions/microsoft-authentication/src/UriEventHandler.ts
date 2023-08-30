/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';

export class UriEventHandler extends zycode.EventEmitter<zycode.Uri> implements zycode.UriHandler {
	public handleUri(uri: zycode.Uri) {
		this.fire(uri);
	}
}
