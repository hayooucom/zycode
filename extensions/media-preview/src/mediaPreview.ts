/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import { Utils } from 'zycode-uri';
import { BinarySizeStatusBarEntry } from './binarySizeStatusBarEntry';
import { Disposable } from './util/dispose';

export function reopenAsText(resource: zycode.Uri, viewColumn: zycode.ViewColumn | undefined) {
	zycode.commands.executeCommand('zycode.openWith', resource, 'default', viewColumn);
}

export const enum PreviewState {
	Disposed,
	Visible,
	Active,
}

export abstract class MediaPreview extends Disposable {

	protected previewState = PreviewState.Visible;
	private _binarySize: number | undefined;

	constructor(
		extensionRoot: zycode.Uri,
		protected readonly resource: zycode.Uri,
		protected readonly webviewEditor: zycode.WebviewPanel,
		private readonly binarySizeStatusBarEntry: BinarySizeStatusBarEntry,
	) {
		super();

		webviewEditor.webview.options = {
			enableScripts: true,
			enableForms: false,
			localResourceRoots: [
				Utils.dirname(resource),
				extensionRoot,
			]
		};

		this._register(webviewEditor.onDidChangeViewState(() => {
			this.updateState();
		}));

		this._register(webviewEditor.onDidDispose(() => {
			this.previewState = PreviewState.Disposed;
			this.dispose();
		}));

		const watcher = this._register(zycode.workspace.createFileSystemWatcher(new zycode.RelativePattern(resource, '*')));
		this._register(watcher.onDidChange(e => {
			if (e.toString() === this.resource.toString()) {
				this.updateBinarySize();
				this.render();
			}
		}));

		this._register(watcher.onDidDelete(e => {
			if (e.toString() === this.resource.toString()) {
				this.webviewEditor.dispose();
			}
		}));
	}

	public override dispose() {
		super.dispose();
		this.binarySizeStatusBarEntry.hide(this);
	}

	protected updateBinarySize() {
		zycode.workspace.fs.stat(this.resource).then(({ size }) => {
			this._binarySize = size;
			this.updateState();
		});
	}

	protected async render() {
		if (this.previewState === PreviewState.Disposed) {
			return;
		}

		const content = await this.getWebviewContents();
		if (this.previewState as PreviewState === PreviewState.Disposed) {
			return;
		}

		this.webviewEditor.webview.html = content;
	}

	protected abstract getWebviewContents(): Promise<string>;

	protected updateState() {
		if (this.previewState === PreviewState.Disposed) {
			return;
		}

		if (this.webviewEditor.active) {
			this.previewState = PreviewState.Active;
			this.binarySizeStatusBarEntry.show(this, this._binarySize);
		} else {
			this.binarySizeStatusBarEntry.hide(this);
			this.previewState = PreviewState.Visible;
		}
	}
}
