/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import { Disposable } from './util/dispose';

export abstract class PreviewStatusBarEntry extends Disposable {
	private _showOwner: unknown | undefined;

	protected readonly entry: zycode.StatusBarItem;

	constructor(id: string, name: string, alignment: zycode.StatusBarAlignment, priority: number) {
		super();
		this.entry = this._register(zycode.window.createStatusBarItem(id, alignment, priority));
		this.entry.name = name;
	}

	protected showItem(owner: unknown, text: string) {
		this._showOwner = owner;
		this.entry.text = text;
		this.entry.show();
	}

	public hide(owner: unknown) {
		if (owner === this._showOwner) {
			this.entry.hide();
			this._showOwner = undefined;
		}
	}
}
