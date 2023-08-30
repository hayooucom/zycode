/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import { SimpleBrowserManager } from './simpleBrowserManager';
import { SimpleBrowserView } from './simpleBrowserView';

declare class URL {
	constructor(input: string, base?: string | URL);
	hostname: string;
}

const openApiCommand = 'simpleBrowser.api.open';
const showCommand = 'simpleBrowser.show';

const enabledHosts = new Set<string>([
	'localhost',
	// localhost IPv4
	'127.0.0.1',
	// localhost IPv6
	'[0:0:0:0:0:0:0:1]',
	'[::1]',
	// all interfaces IPv4
	'0.0.0.0',
	// all interfaces IPv6
	'[0:0:0:0:0:0:0:0]',
	'[::]'
]);

const openerId = 'simpleBrowser.open';

export function activate(context: zycode.ExtensionContext) {

	const manager = new SimpleBrowserManager(context.extensionUri);
	context.subscriptions.push(manager);

	context.subscriptions.push(zycode.window.registerWebviewPanelSerializer(SimpleBrowserView.viewType, {
		deserializeWebviewPanel: async (panel, state) => {
			manager.restore(panel, state);
		}
	}));

	context.subscriptions.push(zycode.commands.registerCommand(showCommand, async (url?: string) => {
		if (!url) {
			url = await zycode.window.showInputBox({
				placeHolder: zycode.l10n.t("https://example.com"),
				prompt: zycode.l10n.t("Enter url to visit")
			});
		}

		if (url) {
			manager.show(url);
		}
	}));

	context.subscriptions.push(zycode.commands.registerCommand(openApiCommand, (url: zycode.Uri, showOptions?: {
		preserveFocus?: boolean;
		viewColumn: zycode.ViewColumn;
	}) => {
		manager.show(url, showOptions);
	}));

	context.subscriptions.push(zycode.window.registerExternalUriOpener(openerId, {
		canOpenExternalUri(uri: zycode.Uri) {
			// We have to replace the IPv6 hosts with IPv4 because URL can't handle IPv6.
			const originalUri = new URL(uri.toString(true));
			if (enabledHosts.has(originalUri.hostname)) {
				return isWeb()
					? zycode.ExternalUriOpenerPriority.Default
					: zycode.ExternalUriOpenerPriority.Option;
			}

			return zycode.ExternalUriOpenerPriority.None;
		},
		openExternalUri(resolveUri: zycode.Uri) {
			return manager.show(resolveUri, {
				viewColumn: zycode.window.activeTextEditor ? zycode.ViewColumn.Beside : zycode.ViewColumn.Active
			});
		}
	}, {
		schemes: ['http', 'https'],
		label: zycode.l10n.t("Open in simple browser"),
	}));
}

function isWeb(): boolean {
	// @ts-expect-error
	return typeof navigator !== 'undefined' && zycode.env.uiKind === zycode.UIKind.Web;
}
