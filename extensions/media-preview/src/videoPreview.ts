/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import { BinarySizeStatusBarEntry } from './binarySizeStatusBarEntry';
import { MediaPreview, reopenAsText } from './mediaPreview';
import { escapeAttribute, getNonce } from './util/dom';


class VideoPreviewProvider implements zycode.CustomReadonlyEditorProvider {

	public static readonly viewType = 'zycode.videoPreview';

	constructor(
		private readonly extensionRoot: zycode.Uri,
		private readonly binarySizeStatusBarEntry: BinarySizeStatusBarEntry,
	) { }

	public async openCustomDocument(uri: zycode.Uri) {
		return { uri, dispose: () => { } };
	}

	public async resolveCustomEditor(document: zycode.CustomDocument, webviewEditor: zycode.WebviewPanel): Promise<void> {
		new VideoPreview(this.extensionRoot, document.uri, webviewEditor, this.binarySizeStatusBarEntry);
	}
}


class VideoPreview extends MediaPreview {

	constructor(
		private readonly extensionRoot: zycode.Uri,
		resource: zycode.Uri,
		webviewEditor: zycode.WebviewPanel,
		binarySizeStatusBarEntry: BinarySizeStatusBarEntry,
	) {
		super(extensionRoot, resource, webviewEditor, binarySizeStatusBarEntry);

		this._register(webviewEditor.webview.onDidReceiveMessage(message => {
			switch (message.type) {
				case 'reopen-as-text': {
					reopenAsText(resource, webviewEditor.viewColumn);
					break;
				}
			}
		}));

		this.updateBinarySize();
		this.render();
		this.updateState();
	}

	protected async getWebviewContents(): Promise<string> {
		const version = Date.now().toString();
		const configurations = zycode.workspace.getConfiguration('mediaPreview.video');
		const settings = {
			src: await this.getResourcePath(this.webviewEditor, this.resource, version),
			autoplay: configurations.get('autoPlay'),
			loop: configurations.get('loop'),
		};

		const nonce = getNonce();

		const cspSource = this.webviewEditor.webview.cspSource;
		return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">

	<!-- Disable pinch zooming -->
	<meta name="viewport"
		content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no">

	<title>Video Preview</title>

	<link rel="stylesheet" href="${escapeAttribute(this.extensionResource('media', 'videoPreview.css'))}" type="text/css" media="screen" nonce="${nonce}">

	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: ${cspSource}; media-src ${cspSource}; script-src 'nonce-${nonce}'; style-src ${cspSource} 'nonce-${nonce}';">
	<meta id="settings" data-settings="${escapeAttribute(JSON.stringify(settings))}">
</head>
<body class="loading" data-zycode-context='{ "preventDefaultContextMenuItems": true }'>
	<div class="loading-indicator"></div>
	<div class="loading-error">
		<p>${zycode.l10n.t("An error occurred while loading the video file.")}</p>
		<a href="#" class="open-file-link">${zycode.l10n.t("Open file using VS Code's standard text/binary editor?")}</a>
	</div>
	<script src="${escapeAttribute(this.extensionResource('media', 'videoPreview.js'))}" nonce="${nonce}"></script>
</body>
</html>`;
	}

	private async getResourcePath(webviewEditor: zycode.WebviewPanel, resource: zycode.Uri, version: string): Promise<string | null> {
		if (resource.scheme === 'git') {
			const stat = await zycode.workspace.fs.stat(resource);
			if (stat.size === 0) {
				// The file is stored on git lfs
				return null;
			}
		}

		// Avoid adding cache busting if there is already a query string
		if (resource.query) {
			return webviewEditor.webview.asWebviewUri(resource).toString();
		}
		return webviewEditor.webview.asWebviewUri(resource).with({ query: `version=${version}` }).toString();
	}

	private extensionResource(...parts: string[]) {
		return this.webviewEditor.webview.asWebviewUri(zycode.Uri.joinPath(this.extensionRoot, ...parts));
	}
}

export function registerVideoPreviewSupport(context: zycode.ExtensionContext, binarySizeStatusBarEntry: BinarySizeStatusBarEntry): zycode.Disposable {
	const provider = new VideoPreviewProvider(context.extensionUri, binarySizeStatusBarEntry);
	return zycode.window.registerCustomEditorProvider(VideoPreviewProvider.viewType, provider, {
		supportsMultipleEditorsPerDocument: true,
		webviewOptions: {
			retainContextWhenHidden: true,
		}
	});
}
