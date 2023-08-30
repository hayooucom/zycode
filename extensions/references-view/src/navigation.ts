/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import { SymbolItemNavigation } from './references-view';
import { ContextKey } from './utils';

export class Navigation {

	private readonly _disposables: zycode.Disposable[] = [];
	private readonly _ctxCanNavigate = new ContextKey<boolean>('references-view.canNavigate');

	private _delegate?: SymbolItemNavigation<unknown>;

	constructor(private readonly _view: zycode.TreeView<unknown>) {
		this._disposables.push(
			zycode.commands.registerCommand('references-view.next', () => this.next(false)),
			zycode.commands.registerCommand('references-view.prev', () => this.previous(false)),
		);
	}

	dispose(): void {
		zycode.Disposable.from(...this._disposables).dispose();
	}

	update(delegate: SymbolItemNavigation<unknown> | undefined) {
		this._delegate = delegate;
		this._ctxCanNavigate.set(Boolean(this._delegate));
	}

	private _anchor(): undefined | unknown {
		if (!this._delegate) {
			return undefined;
		}
		const [sel] = this._view.selection;
		if (sel) {
			return sel;
		}
		if (!zycode.window.activeTextEditor) {
			return undefined;
		}
		return this._delegate.nearest(zycode.window.activeTextEditor.document.uri, zycode.window.activeTextEditor.selection.active);
	}

	private _open(loc: zycode.Location, preserveFocus: boolean) {
		zycode.commands.executeCommand('zycode.open', loc.uri, {
			selection: new zycode.Selection(loc.range.start, loc.range.start),
			preserveFocus
		});
	}

	previous(preserveFocus: boolean): void {
		if (!this._delegate) {
			return;
		}
		const item = this._anchor();
		if (!item) {
			return;
		}
		const newItem = this._delegate.previous(item);
		const newLocation = this._delegate.location(newItem);
		if (newLocation) {
			this._view.reveal(newItem, { select: true, focus: true });
			this._open(newLocation, preserveFocus);
		}
	}

	next(preserveFocus: boolean): void {
		if (!this._delegate) {
			return;
		}
		const item = this._anchor();
		if (!item) {
			return;
		}
		const newItem = this._delegate.next(item);
		const newLocation = this._delegate.location(newItem);
		if (newLocation) {
			this._view.reveal(newItem, { select: true, focus: true });
			this._open(newLocation, preserveFocus);
		}
	}
}
