/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import { PreviewStatusBarEntry } from './ownedStatusBarEntry';


class BinarySize {
	static readonly KB = 1024;
	static readonly MB = BinarySize.KB * BinarySize.KB;
	static readonly GB = BinarySize.MB * BinarySize.KB;
	static readonly TB = BinarySize.GB * BinarySize.KB;

	static formatSize(size: number): string {
		if (size < BinarySize.KB) {
			return zycode.l10n.t("{0}B", size);
		}

		if (size < BinarySize.MB) {
			return zycode.l10n.t("{0}KB", (size / BinarySize.KB).toFixed(2));
		}

		if (size < BinarySize.GB) {
			return zycode.l10n.t("{0}MB", (size / BinarySize.MB).toFixed(2));
		}

		if (size < BinarySize.TB) {
			return zycode.l10n.t("{0}GB", (size / BinarySize.GB).toFixed(2));
		}

		return zycode.l10n.t("{0}TB", (size / BinarySize.TB).toFixed(2));
	}
}

export class BinarySizeStatusBarEntry extends PreviewStatusBarEntry {

	constructor() {
		super('status.imagePreview.binarySize', zycode.l10n.t("Image Binary Size"), zycode.StatusBarAlignment.Right, 100);
	}

	public show(owner: unknown, size: number | undefined) {
		if (typeof size === 'number') {
			super.showItem(owner, BinarySize.formatSize(size));
		} else {
			this.hide(owner);
		}
	}
}
