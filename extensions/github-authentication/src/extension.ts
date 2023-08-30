/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import { GitHubAuthenticationProvider, UriEventHandler } from './github';

function initGHES(context: zycode.ExtensionContext, uriHandler: UriEventHandler) {
	const settingValue = zycode.workspace.getConfiguration().get<string>('github-enterprise.uri');
	if (!settingValue) {
		return undefined;
	}

	// validate user value
	let uri: zycode.Uri;
	try {
		uri = zycode.Uri.parse(settingValue, true);
	} catch (e) {
		zycode.window.showErrorMessage(zycode.l10n.t('GitHub Enterprise Server URI is not a valid URI: {0}', e.message ?? e));
		return;
	}

	const githubEnterpriseAuthProvider = new GitHubAuthenticationProvider(context, uriHandler, uri);
	context.subscriptions.push(githubEnterpriseAuthProvider);
	return githubEnterpriseAuthProvider;
}

export function activate(context: zycode.ExtensionContext) {
	const uriHandler = new UriEventHandler();
	context.subscriptions.push(uriHandler);
	context.subscriptions.push(zycode.window.registerUriHandler(uriHandler));

	context.subscriptions.push(new GitHubAuthenticationProvider(context, uriHandler));

	let githubEnterpriseAuthProvider: GitHubAuthenticationProvider | undefined = initGHES(context, uriHandler);

	context.subscriptions.push(zycode.workspace.onDidChangeConfiguration(async e => {
		if (e.affectsConfiguration('github-enterprise.uri')) {
			if (zycode.workspace.getConfiguration().get<string>('github-enterprise.uri')) {
				githubEnterpriseAuthProvider?.dispose();
				githubEnterpriseAuthProvider = initGHES(context, uriHandler);
			}
		}
	}));
}
