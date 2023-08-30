/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import { API as GitAPI } from './typings/git';
import { publishRepository } from './publish';
import { DisposableStore } from './util';
import { LinkContext, getLink, getVscodeDevHost } from './links';

async function copyVscodeDevLink(gitAPI: GitAPI, useSelection: boolean, context: LinkContext, includeRange = true) {
	try {
		const permalink = await getLink(gitAPI, useSelection, true, getVscodeDevHost(), 'headlink', context, includeRange);
		if (permalink) {
			return zycode.env.clipboard.writeText(permalink);
		}
	} catch (err) {
		if (!(err instanceof zycode.CancellationError)) {
			zycode.window.showErrorMessage(err.message);
		}
	}
}

async function openVscodeDevLink(gitAPI: GitAPI): Promise<zycode.Uri | undefined> {
	try {
		const headlink = await getLink(gitAPI, true, false, getVscodeDevHost(), 'headlink');
		return headlink ? zycode.Uri.parse(headlink) : undefined;
	} catch (err) {
		if (!(err instanceof zycode.CancellationError)) {
			zycode.window.showErrorMessage(err.message);
		}
		return undefined;
	}
}

export function registerCommands(gitAPI: GitAPI): zycode.Disposable {
	const disposables = new DisposableStore();

	disposables.add(zycode.commands.registerCommand('github.publish', async () => {
		try {
			publishRepository(gitAPI);
		} catch (err) {
			zycode.window.showErrorMessage(err.message);
		}
	}));

	disposables.add(zycode.commands.registerCommand('github.copyVscodeDevLink', async (context: LinkContext) => {
		return copyVscodeDevLink(gitAPI, true, context);
	}));

	disposables.add(zycode.commands.registerCommand('github.copyVscodeDevLinkFile', async (context: LinkContext) => {
		return copyVscodeDevLink(gitAPI, false, context);
	}));

	disposables.add(zycode.commands.registerCommand('github.copyVscodeDevLinkWithoutRange', async (context: LinkContext) => {
		return copyVscodeDevLink(gitAPI, true, context, false);
	}));

	disposables.add(zycode.commands.registerCommand('github.openOnVscodeDev', async () => {
		return openVscodeDevLink(gitAPI);
	}));

	return disposables;
}
