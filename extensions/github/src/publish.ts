/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import { API as GitAPI, Repository } from './typings/git';
import { getOctokit } from './auth';
import { TextEncoder } from 'util';
import { basename } from 'path';
import { Octokit } from '@octokit/rest';
import { isInCodespaces } from './pushErrorHandler';

function sanitizeRepositoryName(value: string): string {
	return value.trim().replace(/[^a-z0-9_.]/ig, '-');
}

function getPick<T extends zycode.QuickPickItem>(quickpick: zycode.QuickPick<T>): Promise<T | undefined> {
	return Promise.race<T | undefined>([
		new Promise<T>(c => quickpick.onDidAccept(() => quickpick.selectedItems.length > 0 && c(quickpick.selectedItems[0]))),
		new Promise<undefined>(c => quickpick.onDidHide(() => c(undefined)))
	]);
}

export async function publishRepository(gitAPI: GitAPI, repository?: Repository): Promise<void> {
	if (!zycode.workspace.workspaceFolders?.length) {
		return;
	}

	let folder: zycode.Uri;

	if (repository) {
		folder = repository.rootUri;
	} else if (gitAPI.repositories.length === 1) {
		repository = gitAPI.repositories[0];
		folder = repository.rootUri;
	} else if (zycode.workspace.workspaceFolders.length === 1) {
		folder = zycode.workspace.workspaceFolders[0].uri;
	} else {
		const picks = zycode.workspace.workspaceFolders.map(folder => ({ label: folder.name, folder }));
		const placeHolder = zycode.l10n.t('Pick a folder to publish to GitHub');
		const pick = await zycode.window.showQuickPick(picks, { placeHolder });

		if (!pick) {
			return;
		}

		folder = pick.folder.uri;
	}

	let quickpick = zycode.window.createQuickPick<zycode.QuickPickItem & { repo?: string; auth?: 'https' | 'ssh'; isPrivate?: boolean }>();
	quickpick.ignoreFocusOut = true;

	quickpick.placeholder = 'Repository Name';
	quickpick.value = basename(folder.fsPath);
	quickpick.show();
	quickpick.busy = true;

	let owner: string;
	let octokit: Octokit;
	try {
		octokit = await getOctokit();
		const user = await octokit.users.getAuthenticated({});
		owner = user.data.login;
	} catch (e) {
		// User has cancelled sign in
		quickpick.dispose();
		return;
	}

	quickpick.busy = false;

	let repo: string | undefined;
	let isPrivate: boolean;

	const onDidChangeValue = async () => {
		const sanitizedRepo = sanitizeRepositoryName(quickpick.value);

		if (!sanitizedRepo) {
			quickpick.items = [];
		} else {
			quickpick.items = [
				{ label: `$(repo) Publish to GitHub private repository`, description: `$(github) ${owner}/${sanitizedRepo}`, alwaysShow: true, repo: sanitizedRepo, isPrivate: true },
				{ label: `$(repo) Publish to GitHub public repository`, description: `$(github) ${owner}/${sanitizedRepo}`, alwaysShow: true, repo: sanitizedRepo, isPrivate: false },
			];
		}
	};

	onDidChangeValue();

	while (true) {
		const listener = quickpick.onDidChangeValue(onDidChangeValue);
		const pick = await getPick(quickpick);
		listener.dispose();

		repo = pick?.repo;
		isPrivate = pick?.isPrivate ?? true;

		if (repo) {
			try {
				quickpick.busy = true;
				await octokit.repos.get({ owner, repo: repo });
				quickpick.items = [{ label: `$(error) GitHub repository already exists`, description: `$(github) ${owner}/${repo}`, alwaysShow: true }];
			} catch {
				break;
			} finally {
				quickpick.busy = false;
			}
		}
	}

	quickpick.dispose();

	if (!repo) {
		return;
	}

	if (!repository) {
		const gitignore = zycode.Uri.joinPath(folder, '.gitignore');
		let shouldGenerateGitignore = false;

		try {
			await zycode.workspace.fs.stat(gitignore);
		} catch (err) {
			shouldGenerateGitignore = true;
		}

		if (shouldGenerateGitignore) {
			quickpick = zycode.window.createQuickPick();
			quickpick.placeholder = zycode.l10n.t('Select which files should be included in the repository.');
			quickpick.canSelectMany = true;
			quickpick.show();

			try {
				quickpick.busy = true;

				const children = (await zycode.workspace.fs.readDirectory(folder))
					.map(([name]) => name)
					.filter(name => name !== '.git');

				quickpick.items = children.map(name => ({ label: name }));
				quickpick.selectedItems = quickpick.items;
				quickpick.busy = false;

				const result = await Promise.race([
					new Promise<readonly zycode.QuickPickItem[]>(c => quickpick.onDidAccept(() => c(quickpick.selectedItems))),
					new Promise<undefined>(c => quickpick.onDidHide(() => c(undefined)))
				]);

				if (!result || result.length === 0) {
					return;
				}

				const ignored = new Set(children);
				result.forEach(c => ignored.delete(c.label));

				if (ignored.size > 0) {
					const raw = [...ignored].map(i => `/${i}`).join('\n');
					const encoder = new TextEncoder();
					await zycode.workspace.fs.writeFile(gitignore, encoder.encode(raw));
				}
			} finally {
				quickpick.dispose();
			}
		}
	}

	const githubRepository = await zycode.window.withProgress({ location: zycode.ProgressLocation.Notification, cancellable: false, title: 'Publish to GitHub' }, async progress => {
		progress.report({
			message: isPrivate
				? zycode.l10n.t('Publishing to a private GitHub repository')
				: zycode.l10n.t('Publishing to a public GitHub repository'),
			increment: 25
		});

		type CreateRepositoryResponseData = Awaited<ReturnType<typeof octokit.repos.createForAuthenticatedUser>>['data'];
		let createdGithubRepository: CreateRepositoryResponseData | undefined = undefined;

		if (isInCodespaces()) {
			createdGithubRepository = await zycode.commands.executeCommand<CreateRepositoryResponseData>('github.codespaces.publish', { name: repo!, isPrivate });
		} else {
			const res = await octokit.repos.createForAuthenticatedUser({
				name: repo!,
				private: isPrivate
			});
			createdGithubRepository = res.data;
		}

		if (createdGithubRepository) {
			progress.report({ message: zycode.l10n.t('Creating first commit'), increment: 25 });

			if (!repository) {
				repository = await gitAPI.init(folder, { defaultBranch: createdGithubRepository.default_branch }) || undefined;

				if (!repository) {
					return;
				}

				await repository.commit('first commit', { all: true, postCommitCommand: null });
			}

			progress.report({ message: zycode.l10n.t('Uploading files'), increment: 25 });

			const branch = await repository.getBranch('HEAD');
			const protocol = zycode.workspace.getConfiguration('github').get<'https' | 'ssh'>('gitProtocol');
			const remoteUrl = protocol === 'https' ? createdGithubRepository.clone_url : createdGithubRepository.ssh_url;
			await repository.addRemote('origin', remoteUrl);
			await repository.push('origin', branch.name, true);
		}

		return createdGithubRepository;
	});

	if (!githubRepository) {
		return;
	}

	const openOnGitHub = zycode.l10n.t('Open on GitHub');
	zycode.window.showInformationMessage(zycode.l10n.t('Successfully published the "{0}" repository to GitHub.', `${owner}/${repo}`), openOnGitHub).then(action => {
		if (action === openOnGitHub) {
			zycode.commands.executeCommand('zycode.open', zycode.Uri.parse(githubRepository.html_url));
		}
	});
}
