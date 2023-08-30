/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as httpRequest from 'request-light';
import * as zycode from 'zycode';
import { addJSONProviders } from './features/jsonContributions';
import { runSelectedScript, selectAndRunScriptFromFolder } from './commands';
import { NpmScriptsTreeDataProvider } from './npmView';
import { getPackageManager, invalidateTasksCache, NpmTaskProvider, hasPackageJson } from './tasks';
import { invalidateHoverScriptsCache, NpmScriptHoverProvider } from './scriptHover';
import { NpmScriptLensProvider } from './npmScriptLens';
import * as which from 'which';

let treeDataProvider: NpmScriptsTreeDataProvider | undefined;

function invalidateScriptCaches() {
	invalidateHoverScriptsCache();
	invalidateTasksCache();
	if (treeDataProvider) {
		treeDataProvider.refresh();
	}
}

export async function activate(context: zycode.ExtensionContext): Promise<void> {
	configureHttpRequest();
	context.subscriptions.push(zycode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration('http.proxy') || e.affectsConfiguration('http.proxyStrictSSL')) {
			configureHttpRequest();
		}
	}));

	const npmCommandPath = await getNPMCommandPath();
	context.subscriptions.push(addJSONProviders(httpRequest.xhr, npmCommandPath));
	registerTaskProvider(context);

	treeDataProvider = registerExplorer(context);

	context.subscriptions.push(zycode.workspace.onDidChangeConfiguration((e) => {
		if (e.affectsConfiguration('npm.exclude') || e.affectsConfiguration('npm.autoDetect') || e.affectsConfiguration('npm.scriptExplorerExclude')) {
			invalidateTasksCache();
			if (treeDataProvider) {
				treeDataProvider.refresh();
			}
		}
		if (e.affectsConfiguration('npm.scriptExplorerAction')) {
			if (treeDataProvider) {
				treeDataProvider.refresh();
			}
		}
	}));

	registerHoverProvider(context);

	context.subscriptions.push(zycode.commands.registerCommand('npm.runSelectedScript', runSelectedScript));

	if (await hasPackageJson()) {
		zycode.commands.executeCommand('setContext', 'npm:showScriptExplorer', true);
	}

	context.subscriptions.push(zycode.commands.registerCommand('npm.runScriptFromFolder', selectAndRunScriptFromFolder));
	context.subscriptions.push(zycode.commands.registerCommand('npm.refresh', () => {
		invalidateScriptCaches();
	}));
	context.subscriptions.push(zycode.commands.registerCommand('npm.packageManager', (args) => {
		if (args instanceof zycode.Uri) {
			return getPackageManager(context, args);
		}
		return '';
	}));
	context.subscriptions.push(new NpmScriptLensProvider());

	context.subscriptions.push(zycode.window.registerTerminalQuickFixProvider('ms-zycode.npm-command', {
		provideTerminalQuickFixes({ outputMatch }) {
			if (!outputMatch) {
				return;
			}

			const lines = outputMatch.regexMatch[1];
			const fixes: zycode.TerminalQuickFixExecuteTerminalCommand[] = [];
			for (const line of lines.split('\n')) {
				// search from the second char, since the lines might be prefixed with
				// "npm ERR!" which comes before the actual command suggestion.
				const begin = line.indexOf('npm', 1);
				if (begin === -1) {
					continue;
				}

				const end = line.lastIndexOf('#');
				fixes.push({ terminalCommand: line.slice(begin, end === -1 ? undefined : end - 1) });
			}

			return fixes;
		},
	}));
}

async function getNPMCommandPath(): Promise<string | undefined> {
	if (canRunNpmInCurrentWorkspace()) {
		try {
			return await which(process.platform === 'win32' ? 'npm.cmd' : 'npm');
		} catch (e) {
			return undefined;
		}
	}
	return undefined;
}

function canRunNpmInCurrentWorkspace() {
	if (zycode.workspace.workspaceFolders) {
		return zycode.workspace.workspaceFolders.some(f => f.uri.scheme === 'file');
	}
	return false;
}

let taskProvider: NpmTaskProvider;
function registerTaskProvider(context: zycode.ExtensionContext): zycode.Disposable | undefined {
	if (zycode.workspace.workspaceFolders) {
		const watcher = zycode.workspace.createFileSystemWatcher('**/package.json');
		watcher.onDidChange((_e) => invalidateScriptCaches());
		watcher.onDidDelete((_e) => invalidateScriptCaches());
		watcher.onDidCreate((_e) => invalidateScriptCaches());
		context.subscriptions.push(watcher);

		const workspaceWatcher = zycode.workspace.onDidChangeWorkspaceFolders((_e) => invalidateScriptCaches());
		context.subscriptions.push(workspaceWatcher);

		taskProvider = new NpmTaskProvider(context);
		const disposable = zycode.tasks.registerTaskProvider('npm', taskProvider);
		context.subscriptions.push(disposable);
		return disposable;
	}
	return undefined;
}

function registerExplorer(context: zycode.ExtensionContext): NpmScriptsTreeDataProvider | undefined {
	if (zycode.workspace.workspaceFolders) {
		const treeDataProvider = new NpmScriptsTreeDataProvider(context, taskProvider!);
		const view = zycode.window.createTreeView('npm', { treeDataProvider: treeDataProvider, showCollapseAll: true });
		context.subscriptions.push(view);
		return treeDataProvider;
	}
	return undefined;
}

function registerHoverProvider(context: zycode.ExtensionContext): NpmScriptHoverProvider | undefined {
	if (zycode.workspace.workspaceFolders) {
		const npmSelector: zycode.DocumentSelector = {
			language: 'json',
			scheme: 'file',
			pattern: '**/package.json'
		};
		const provider = new NpmScriptHoverProvider(context);
		context.subscriptions.push(zycode.languages.registerHoverProvider(npmSelector, provider));
		return provider;
	}
	return undefined;
}

function configureHttpRequest() {
	const httpSettings = zycode.workspace.getConfiguration('http');
	httpRequest.configure(httpSettings.get<string>('proxy', ''), httpSettings.get<boolean>('proxyStrictSSL', true));
}

export function deactivate(): void {
}
