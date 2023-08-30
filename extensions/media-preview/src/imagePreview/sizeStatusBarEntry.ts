/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import { PreviewStatusBarEntry } from '../ownedStatusBarEntry';


export class SizeStatusBarEntry extends PreviewStatusBarEntry {

	constructor() {
		super('status.imagePreview.size', zycode.l10n.t("Image Size"), zycode.StatusBarAlignment.Right, 101 /* to the left of editor status (100) */);
	}

	public show(owner: unknown, text: string) {
		this.showItem(owner, text);
	}
}
