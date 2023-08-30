/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as jsonc from 'jsonc-parser';
import * as path from 'path';
import * as zycode from 'zycode';
import { wait } from '../test/testUtils';
import { ITypeScriptServiceClient, ServerResponse } from '../typescriptService';
import { coalesce } from '../utils/arrays';
import { Disposable } from '../utils/dispose';
import { exists } from '../utils/fs';
import { isTsConfigFileName } from '../configuration/languageDescription';
import { Lazy } from '../utils/lazy';
import { isImplicitProjectConfigFile } from '../tsconfig';
import { TSConfig, TsConfigProvider } from './tsconfigProvider';


enum AutoDetect {
	on = 'on',
	off = 'off',
	build = 'build',
	watch = 'watch'
}


interface TypeScriptTaskDefinition extends zycode.TaskDefinition {
	tsconfig: string;
	option?: string;
}

/**
 * Provides tasks for building `tsconfig.json` files in a project.
 */
class TscTaskProvider extends Disposable implements zycode.TaskProvider {

	private readonly projectInfoRequestTimeout = 2000;
	private readonly findConfigFilesTimeout = 5000;

	private autoDetect = AutoDetect.on;
	private readonly tsconfigProvider: TsConfigProvider;

	public constructor(
		private readonly client: Lazy<ITypeScriptServiceClient>
	) {
		super();
		this.tsconfigProvider = new TsConfigProvider();

		this._register(zycode.workspace.onDidChangeConfiguration(this.onConfigurationChanged, this));
		this.onConfigurationChanged();
	}

	public async provideTasks(token: zycode.CancellationToken): Promise<zycode.Task[]> {
		const folders = zycode.workspace.workspaceFolders;
		if ((this.autoDetect === AutoDetect.off) || !folders || !folders.length) {
			return [];
		}

		const configPaths: Set<string> = new Set();
		const tasks: zycode.Task[] = [];
		for (const project of await this.getAllTsConfigs(token)) {
			if (!configPaths.has(project.fsPath)) {
				configPaths.add(project.fsPath);
				tasks.push(...(await this.getTasksForProject(project)));
			}
		}
		return tasks;
	}

	public async resolveTask(task: zycode.Task): Promise<zycode.Task | undefined> {
		const definition = <TypeScriptTaskDefinition>task.definition;
		if (/\\tsconfig.*\.json/.test(definition.tsconfig)) {
			// Warn that the task has the wrong slash type
			zycode.window.showWarningMessage(zycode.l10n.t("TypeScript Task in tasks.json contains \"\\\\\". TypeScript tasks tsconfig must use \"/\""));
			return undefined;
		}

		const tsconfigPath = definition.tsconfig;
		if (!tsconfigPath) {
			return undefined;
		}

		if (task.scope === undefined || task.scope === zycode.TaskScope.Global || task.scope === zycode.TaskScope.Workspace) {
			// scope is required to be a WorkspaceFolder for resolveTask
			return undefined;
		}
		const tsconfigUri = task.scope.uri.with({ path: task.scope.uri.path + '/' + tsconfigPath });
		const tsconfig: TSConfig = {
			uri: tsconfigUri,
			fsPath: tsconfigUri.fsPath,
			posixPath: tsconfigUri.path,
			workspaceFolder: task.scope
		};
		return this.getTasksForProjectAndDefinition(tsconfig, definition);
	}

	private async getAllTsConfigs(token: zycode.CancellationToken): Promise<TSConfig[]> {
		const configs = (await Promise.all([
			this.getTsConfigForActiveFile(token),
			this.getTsConfigsInWorkspace(token),
		])).flat();

		return Promise.all(
			configs.map(async config => await exists(config.uri) ? config : undefined),
		).then(coalesce);
	}

	private async getTsConfigForActiveFile(token: zycode.CancellationToken): Promise<TSConfig[]> {
		const editor = zycode.window.activeTextEditor;
		if (editor) {
			if (isTsConfigFileName(editor.document.fileName)) {
				const uri = editor.document.uri;
				return [{
					uri,
					fsPath: uri.fsPath,
					posixPath: uri.path,
					workspaceFolder: zycode.workspace.getWorkspaceFolder(uri)
				}];
			}
		}

		const file = this.getActiveTypeScriptFile();
		if (!file) {
			return [];
		}

		const response = await Promise.race([
			this.client.value.execute(
				'projectInfo',
				{ file, needFileNameList: false },
				token),
			new Promise<typeof ServerResponse.NoContent>(resolve => setTimeout(() => resolve(ServerResponse.NoContent), this.projectInfoRequestTimeout))
		]);
		if (response.type !== 'response' || !response.body) {
			return [];
		}

		const { configFileName } = response.body;
		if (configFileName && !isImplicitProjectConfigFile(configFileName)) {
			const normalizedConfigPath = path.normalize(configFileName);
			const uri = zycode.Uri.file(normalizedConfigPath);
			const folder = zycode.workspace.getWorkspaceFolder(uri);
			return [{
				uri,
				fsPath: normalizedConfigPath,
				posixPath: uri.path,
				workspaceFolder: folder
			}];
		}

		return [];
	}

	private async getTsConfigsInWorkspace(token: zycode.CancellationToken): Promise<TSConfig[]> {
		const getConfigsTimeout = new zycode.CancellationTokenSource();
		token.onCancellationRequested(() => getConfigsTimeout.cancel());

		return Promise.race([
			this.tsconfigProvider.getConfigsForWorkspace(getConfigsTimeout.token).then(x => Array.from(x)),
			wait(this.findConfigFilesTimeout).then(() => {
				getConfigsTimeout.cancel();
				return [];
			}),
		]);
	}

	private static async getCommand(project: TSConfig): Promise<string> {
		if (project.workspaceFolder) {
			const localTsc = await TscTaskProvider.getLocalTscAtPath(path.dirname(project.fsPath));
			if (localTsc) {
				return localTsc;
			}

			const workspaceTsc = await TscTaskProvider.getLocalTscAtPath(project.workspaceFolder.uri.fsPath);
			if (workspaceTsc) {
				return workspaceTsc;
			}
		}

		// Use global tsc version
		return 'tsc';
	}

	private static async getLocalTscAtPath(folderPath: string): Promise<string | undefined> {
		const platform = process.platform;
		const bin = path.join(folderPath, 'node_modules', '.bin');
		if (platform === 'win32' && await exists(zycode.Uri.file(path.join(bin, 'tsc.cmd')))) {
			return path.join(bin, 'tsc.cmd');
		} else if ((platform === 'linux' || platform === 'darwin') && await exists(zycode.Uri.file(path.join(bin, 'tsc')))) {
			return path.join(bin, 'tsc');
		}
		return undefined;
	}

	private getActiveTypeScriptFile(): string | undefined {
		const editor = zycode.window.activeTextEditor;
		if (editor) {
			const document = editor.document;
			if (document && (document.languageId === 'typescript' || document.languageId === 'typescriptreact')) {
				return this.client.value.toTsFilePath(document.uri);
			}
		}
		return undefined;
	}

	private getBuildTask(workspaceFolder: zycode.WorkspaceFolder | undefined, label: string, command: string, args: string[], buildTaskidentifier: TypeScriptTaskDefinition): zycode.Task {
		const buildTask = new zycode.Task(
			buildTaskidentifier,
			workspaceFolder || zycode.TaskScope.Workspace,
			zycode.l10n.t("build - {0}", label),
			'tsc',
			new zycode.ShellExecution(command, args),
			'$tsc');
		buildTask.group = zycode.TaskGroup.Build;
		buildTask.isBackground = false;
		return buildTask;
	}

	private getWatchTask(workspaceFolder: zycode.WorkspaceFolder | undefined, label: string, command: string, args: string[], watchTaskidentifier: TypeScriptTaskDefinition) {
		const watchTask = new zycode.Task(
			watchTaskidentifier,
			workspaceFolder || zycode.TaskScope.Workspace,
			zycode.l10n.t("watch - {0}", label),
			'tsc',
			new zycode.ShellExecution(command, [...args, '--watch']),
			'$tsc-watch');
		watchTask.group = zycode.TaskGroup.Build;
		watchTask.isBackground = true;
		return watchTask;
	}

	private async getTasksForProject(project: TSConfig): Promise<zycode.Task[]> {
		const command = await TscTaskProvider.getCommand(project);
		const args = await this.getBuildShellArgs(project);
		const label = this.getLabelForTasks(project);

		const tasks: zycode.Task[] = [];

		if (this.autoDetect === AutoDetect.build || this.autoDetect === AutoDetect.on) {
			tasks.push(this.getBuildTask(project.workspaceFolder, label, command, args, { type: 'typescript', tsconfig: label }));
		}

		if (this.autoDetect === AutoDetect.watch || this.autoDetect === AutoDetect.on) {
			tasks.push(this.getWatchTask(project.workspaceFolder, label, command, args, { type: 'typescript', tsconfig: label, option: 'watch' }));
		}

		return tasks;
	}

	private async getTasksForProjectAndDefinition(project: TSConfig, definition: TypeScriptTaskDefinition): Promise<zycode.Task | undefined> {
		const command = await TscTaskProvider.getCommand(project);
		const args = await this.getBuildShellArgs(project);
		const label = this.getLabelForTasks(project);

		let task: zycode.Task | undefined;

		if (definition.option === undefined) {
			task = this.getBuildTask(project.workspaceFolder, label, command, args, definition);
		} else if (definition.option === 'watch') {
			task = this.getWatchTask(project.workspaceFolder, label, command, args, definition);
		}

		return task;
	}

	private async getBuildShellArgs(project: TSConfig): Promise<Array<string>> {
		const defaultArgs = ['-p', project.fsPath];
		try {
			const bytes = await zycode.workspace.fs.readFile(project.uri);
			const text = Buffer.from(bytes).toString('utf-8');
			const tsconfig = jsonc.parse(text);
			if (tsconfig?.references) {
				return ['-b', project.fsPath];
			}
		} catch {
			// noops
		}
		return defaultArgs;
	}

	private getLabelForTasks(project: TSConfig): string {
		if (project.workspaceFolder) {
			const workspaceNormalizedUri = zycode.Uri.file(path.normalize(project.workspaceFolder.uri.fsPath)); // Make sure the drive letter is lowercase
			return path.posix.relative(workspaceNormalizedUri.path, project.posixPath);
		}

		return project.posixPath;
	}

	private onConfigurationChanged(): void {
		const type = zycode.workspace.getConfiguration('typescript.tsc').get<AutoDetect>('autoDetect');
		this.autoDetect = typeof type === 'undefined' ? AutoDetect.on : type;
	}
}

export function register(
	lazyClient: Lazy<ITypeScriptServiceClient>,
) {
	return zycode.tasks.registerTaskProvider('typescript', new TscTaskProvider(lazyClient));
}
