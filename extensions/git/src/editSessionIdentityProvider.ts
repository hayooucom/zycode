/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as zycode from 'zycode';
import { RefType } from './api/git';
import { Model } from './model';

export class GitEditSessionIdentityProvider implements zycode.EditSessionIdentityProvider, zycode.Disposable {

	private providerRegistration: zycode.Disposable;

	constructor(private model: Model) {
		this.providerRegistration = zycode.workspace.registerEditSessionIdentityProvider('file', this);

		zycode.workspace.onWillCreateEditSessionIdentity((e) => {
			e.waitUntil(this._onWillCreateEditSessionIdentity(e.workspaceFolder));
		});
	}

	dispose() {
		this.providerRegistration.dispose();
	}

	async provideEditSessionIdentity(workspaceFolder: zycode.WorkspaceFolder, token: zycode.CancellationToken): Promise<string | undefined> {
		await this.model.openRepository(path.dirname(workspaceFolder.uri.fsPath));

		const repository = this.model.getRepository(workspaceFolder.uri);
		await repository?.status();

		if (!repository || !repository?.HEAD?.upstream) {
			return undefined;
		}

		const remoteUrl = repository.remotes.find((remote) => remote.name === repository.HEAD?.upstream?.remote)?.pushUrl?.replace(/^(git@[^\/:]+)(:)/i, 'ssh://$1/');
		const remote = remoteUrl ? await zycode.workspace.getCanonicalUri(zycode.Uri.parse(remoteUrl), { targetScheme: 'https' }, token) : null;

		return JSON.stringify({
			remote: remote?.toString() ?? remoteUrl,
			ref: repository.HEAD?.upstream?.name ?? null,
			sha: repository.HEAD?.commit ?? null,
		});
	}

	provideEditSessionIdentityMatch(identity1: string, identity2: string): zycode.EditSessionIdentityMatch {
		try {
			const normalizedIdentity1 = normalizeEditSessionIdentity(identity1);
			const normalizedIdentity2 = normalizeEditSessionIdentity(identity2);

			if (normalizedIdentity1.remote === normalizedIdentity2.remote &&
				normalizedIdentity1.ref === normalizedIdentity2.ref &&
				normalizedIdentity1.sha === normalizedIdentity2.sha) {
				// This is a perfect match
				return zycode.EditSessionIdentityMatch.Complete;
			} else if (normalizedIdentity1.remote === normalizedIdentity2.remote &&
				normalizedIdentity1.ref === normalizedIdentity2.ref &&
				normalizedIdentity1.sha !== normalizedIdentity2.sha) {
				// Same branch and remote but different SHA
				return zycode.EditSessionIdentityMatch.Partial;
			} else {
				return zycode.EditSessionIdentityMatch.None;
			}
		} catch (ex) {
			return zycode.EditSessionIdentityMatch.Partial;
		}
	}

	private async _onWillCreateEditSessionIdentity(workspaceFolder: zycode.WorkspaceFolder): Promise<void> {
		await this._doPublish(workspaceFolder);
	}

	private async _doPublish(workspaceFolder: zycode.WorkspaceFolder) {
		await this.model.openRepository(path.dirname(workspaceFolder.uri.fsPath));

		const repository = this.model.getRepository(workspaceFolder.uri);
		if (!repository) {
			return;
		}

		await repository.status();

		// If this branch hasn't been published to the remote yet,
		// ensure that it is published before Continue On is invoked
		if (!repository.HEAD?.upstream && repository.HEAD?.type === RefType.Head) {

			const publishBranch = zycode.l10n.t('Publish Branch');
			const selection = await zycode.window.showInformationMessage(
				zycode.l10n.t('The current branch is not published to the remote. Would you like to publish it to access your changes elsewhere?'),
				{ modal: true },
				publishBranch
			);
			if (selection !== publishBranch) {
				throw new zycode.CancellationError();
			}

			await zycode.commands.executeCommand('git.publish');
		}
	}
}

function normalizeEditSessionIdentity(identity: string) {
	let { remote, ref, sha } = JSON.parse(identity);

	if (typeof remote === 'string' && remote.endsWith('.git')) {
		remote = remote.slice(0, remote.length - 4);
	}

	return {
		remote,
		ref,
		sha
	};
}
