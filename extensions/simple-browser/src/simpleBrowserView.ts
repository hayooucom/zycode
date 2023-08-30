/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import { Disposable } from './dispose';


export interface ShowOptions {
	readonly preserveFocus?: boolean;
	readonly viewColumn?: zycode.ViewColumn;
}

export class SimpleBrowserView extends Disposable {

	public static readonly viewType = 'simpleBrowser.view';
	private static readonly title = zycode.l10n.t("Simple Browser");

	private static getWebviewLocalResourceRoots(extensionUri: zycode.Uri): readonly zycode.Uri[] {
		return [
			zycode.Uri.joinPath(extensionUri, 'media')
		];
	}

	private static getWebviewOptions(extensionUri: zycode.Uri): zycode.WebviewOptions {
		return {
			enableScripts: true,
			enableForms: true,
			localResourceRoots: SimpleBrowserView.getWebviewLocalResourceRoots(extensionUri),
		};
	}

	private readonly _webviewPanel: zycode.WebviewPanel;

	private readonly _onDidDispose = this._register(new zycode.EventEmitter<void>());
	public readonly onDispose = this._onDidDispose.event;

	public static create(
		extensionUri: zycode.Uri,
		url: string,
		showOptions?: ShowOptions
	): SimpleBrowserView {
		const webview = zycode.window.createWebviewPanel(SimpleBrowserView.viewType, SimpleBrowserView.title, {
			viewColumn: showOptions?.viewColumn ?? zycode.ViewColumn.Active,
			preserveFocus: showOptions?.preserveFocus
		}, {
			retainContextWhenHidden: true,
			...SimpleBrowserView.getWebviewOptions(extensionUri)
		});
		return new SimpleBrowserView(extensionUri, url, webview);
	}

	public static restore(
		extensionUri: zycode.Uri,
		url: string,
		webviewPanel: zycode.WebviewPanel,
	): SimpleBrowserView {
		return new SimpleBrowserView(extensionUri, url, webviewPanel);
	}

	private constructor(
		private readonly extensionUri: zycode.Uri,
		url: string,
		webviewPanel: zycode.WebviewPanel,
	) {
		super();

		this._webviewPanel = this._register(webviewPanel);
		this._webviewPanel.webview.options = SimpleBrowserView.getWebviewOptions(extensionUri);

		this._register(this._webviewPanel.webview.onDidReceiveMessage(e => {
			switch (e.type) {
				case 'openExternal':
					try {
						const url = zycode.Uri.parse(e.url);
						zycode.env.openExternal(url);
					} catch {
						// Noop
					}
					break;
			}
		}));

		this._register(this._webviewPanel.onDidDispose(() => {
			this.dispose();
		}));

		this._register(zycode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('simpleBrowser.focusLockIndicator.enabled')) {
				const configuration = zycode.workspace.getConfiguration('simpleBrowser');
				this._webviewPanel.webview.postMessage({
					type: 'didChangeFocusLockIndicatorEnabled',
					focusLockEnabled: configuration.get<boolean>('focusLockIndicator.enabled', true)
				});
			}
		}));

		this.show(url);
	}

	public override dispose() {
		this._onDidDispose.fire();
		super.dispose();
	}

	public show(url: string, options?: ShowOptions) {
		this._webviewPanel.webview.html = this.getHtml(url);
		this._webviewPanel.reveal(options?.viewColumn, options?.preserveFocus);
	}

	private getHtml(url: string) {
		const configuration = zycode.workspace.getConfiguration('simpleBrowser');

		const nonce = getNonce();

		const mainJs = this.extensionResourceUrl('media', 'index.js');
		const mainCss = this.extensionResourceUrl('media', 'main.css');
		const codiconsUri = this.extensionResourceUrl('media', 'codicon.css');

		return /* html */ `<!DOCTYPE html>
			<html>
			<head>
				<meta http-equiv="Content-type" content="text/html;charset=UTF-8">

				<meta http-equiv="Content-Security-Policy" content="
					default-src 'none';
					font-src data:;
					style-src ${this._webviewPanel.webview.cspSource};
					script-src 'nonce-${nonce}';
					frame-src *;
					">

				<meta id="simple-browser-settings" data-settings="${escapeAttribute(JSON.stringify({
			url: url,
			focusLockEnabled: configuration.get<boolean>('focusLockIndicator.enabled', true)
		}))}">

				<link rel="stylesheet" type="text/css" href="${mainCss}">
				<link rel="stylesheet" type="text/css" href="${codiconsUri}">
			</head>
			<body>
				<header class="header">
					<nav class="controls">
						<button
							title="${zycode.l10n.t("Back")}"
							class="back-button icon"><i class="codicon codicon-arrow-left"></i></button>

						<button
							title="${zycode.l10n.t("Forward")}"
							class="forward-button icon"><i class="codicon codicon-arrow-right"></i></button>

						<button
							title="${zycode.l10n.t("Reload")}"
							class="reload-button icon"><i class="codicon codicon-refresh"></i></button>
					</nav>

					<input class="url-input" type="text">

					<nav class="controls">
						<button
							title="${zycode.l10n.t("Open in browser")}"
							class="open-external-button icon"><i class="codicon codicon-link-external"></i></button>
					</nav>
				</header>
				<div class="content">
					<div class="iframe-focused-alert">${zycode.l10n.t("Focus Lock")}</div>
					<iframe sandbox="allow-scripts allow-forms allow-same-origin allow-downloads"></iframe>
				</div>

				<script src="${mainJs}" nonce="${nonce}"></script>
			</body>
			</html>`;
	}

	private extensionResourceUrl(...parts: string[]): zycode.Uri {
		return this._webviewPanel.webview.asWebviewUri(zycode.Uri.joinPath(this.extensionUri, ...parts));
	}
}

function escapeAttribute(value: string | zycode.Uri): string {
	return value.toString().replace(/"/g, '&quot;');
}

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 64; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
