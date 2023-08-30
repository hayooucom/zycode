/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ExtHostTextEditor } from 'vs/workbench/api/common/extHostTextEditor';
import { ExtHostEditors } from 'vs/workbench/api/common/extHostTextEditors';
import { asWebviewUri, webviewGenericCspSource, WebviewRemoteInfo } from 'vs/workbench/contrib/webview/common/webview';
import type * as zycode from 'zycode';
import { ExtHostEditorInsetsShape, MainThreadEditorInsetsShape } from './extHost.protocol';

export class ExtHostEditorInsets implements ExtHostEditorInsetsShape {

	private _handlePool = 0;
	private _disposables = new DisposableStore();
	private _insets = new Map<number, { editor: zycode.TextEditor; inset: zycode.WebviewEditorInset; onDidReceiveMessage: Emitter<any> }>();

	constructor(
		private readonly _proxy: MainThreadEditorInsetsShape,
		private readonly _editors: ExtHostEditors,
		private readonly _remoteInfo: WebviewRemoteInfo
	) {

		// dispose editor inset whenever the hosting editor goes away
		this._disposables.add(_editors.onDidChangeVisibleTextEditors(() => {
			const visibleEditor = _editors.getVisibleTextEditors();
			for (const value of this._insets.values()) {
				if (visibleEditor.indexOf(value.editor) < 0) {
					value.inset.dispose(); // will remove from `this._insets`
				}
			}
		}));
	}

	dispose(): void {
		this._insets.forEach(value => value.inset.dispose());
		this._disposables.dispose();
	}

	createWebviewEditorInset(editor: zycode.TextEditor, line: number, height: number, options: zycode.WebviewOptions | undefined, extension: IExtensionDescription): zycode.WebviewEditorInset {

		let apiEditor: ExtHostTextEditor | undefined;
		for (const candidate of this._editors.getVisibleTextEditors(true)) {
			if (candidate.value === editor) {
				apiEditor = <ExtHostTextEditor>candidate;
				break;
			}
		}
		if (!apiEditor) {
			throw new Error('not a visible editor');
		}

		const that = this;
		const handle = this._handlePool++;
		const onDidReceiveMessage = new Emitter<any>();
		const onDidDispose = new Emitter<void>();

		const webview = new class implements zycode.Webview {

			private _html: string = '';
			private _options: zycode.WebviewOptions = Object.create(null);

			asWebviewUri(resource: zycode.Uri): zycode.Uri {
				return asWebviewUri(resource, that._remoteInfo);
			}

			get cspSource(): string {
				return webviewGenericCspSource;
			}

			set options(value: zycode.WebviewOptions) {
				this._options = value;
				that._proxy.$setOptions(handle, value);
			}

			get options(): zycode.WebviewOptions {
				return this._options;
			}

			set html(value: string) {
				this._html = value;
				that._proxy.$setHtml(handle, value);
			}

			get html(): string {
				return this._html;
			}

			get onDidReceiveMessage(): zycode.Event<any> {
				return onDidReceiveMessage.event;
			}

			postMessage(message: any): Thenable<boolean> {
				return that._proxy.$postMessage(handle, message);
			}
		};

		const inset = new class implements zycode.WebviewEditorInset {

			readonly editor: zycode.TextEditor = editor;
			readonly line: number = line;
			readonly height: number = height;
			readonly webview: zycode.Webview = webview;
			readonly onDidDispose: zycode.Event<void> = onDidDispose.event;

			dispose(): void {
				if (that._insets.has(handle)) {
					that._insets.delete(handle);
					that._proxy.$disposeEditorInset(handle);
					onDidDispose.fire();

					// final cleanup
					onDidDispose.dispose();
					onDidReceiveMessage.dispose();
				}
			}
		};

		this._proxy.$createEditorInset(handle, apiEditor.id, apiEditor.value.document.uri, line + 1, height, options || {}, extension.identifier, extension.extensionLocation);
		this._insets.set(handle, { editor, inset, onDidReceiveMessage });

		return inset;
	}

	$onDidDispose(handle: number): void {
		const value = this._insets.get(handle);
		if (value) {
			value.inset.dispose();
		}
	}

	$onDidReceiveMessage(handle: number, message: any): void {
		const value = this._insets.get(handle);
		value?.onDidReceiveMessage.fire(message);
	}
}
