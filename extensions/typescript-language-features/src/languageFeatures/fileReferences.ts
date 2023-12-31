/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import { Command, CommandManager } from '../commands/commandManager';
import { isSupportedLanguageMode } from '../configuration/languageIds';
import { API } from '../tsServer/api';
import * as typeConverters from '../typeConverters';
import { ITypeScriptServiceClient } from '../typescriptService';


class FileReferencesCommand implements Command {

	public static readonly context = 'tsSupportsFileReferences';
	public static readonly minVersion = API.v420;

	public readonly id = 'typescript.findAllFileReferences';

	public constructor(
		private readonly client: ITypeScriptServiceClient
	) { }

	public async execute(resource?: zycode.Uri) {
		if (this.client.apiVersion.lt(FileReferencesCommand.minVersion)) {
			zycode.window.showErrorMessage(zycode.l10n.t("Find file references failed. Requires TypeScript 4.2+."));
			return;
		}

		resource ??= zycode.window.activeTextEditor?.document.uri;
		if (!resource) {
			zycode.window.showErrorMessage(zycode.l10n.t("Find file references failed. No resource provided."));
			return;
		}

		const document = await zycode.workspace.openTextDocument(resource);
		if (!isSupportedLanguageMode(document)) {
			zycode.window.showErrorMessage(zycode.l10n.t("Find file references failed. Unsupported file type."));
			return;
		}

		const openedFiledPath = this.client.toOpenTsFilePath(document);
		if (!openedFiledPath) {
			zycode.window.showErrorMessage(zycode.l10n.t("Find file references failed. Unknown file type."));
			return;
		}

		await zycode.window.withProgress({
			location: zycode.ProgressLocation.Window,
			title: zycode.l10n.t("Finding file references")
		}, async (_progress, token) => {

			const response = await this.client.execute('fileReferences', {
				file: openedFiledPath
			}, token);
			if (response.type !== 'response' || !response.body) {
				return;
			}

			const locations: zycode.Location[] = response.body.refs.map(reference =>
				typeConverters.Location.fromTextSpan(this.client.toResource(reference.file), reference));

			const config = zycode.workspace.getConfiguration('references');
			const existingSetting = config.inspect<string>('preferredLocation');

			await config.update('preferredLocation', 'view');
			try {
				await zycode.commands.executeCommand('editor.action.showReferences', resource, new zycode.Position(0, 0), locations);
			} finally {
				await config.update('preferredLocation', existingSetting?.workspaceFolderValue ?? existingSetting?.workspaceValue);
			}
		});
	}
}


export function register(
	client: ITypeScriptServiceClient,
	commandManager: CommandManager
) {
	function updateContext() {
		zycode.commands.executeCommand('setContext', FileReferencesCommand.context, client.apiVersion.gte(FileReferencesCommand.minVersion));
	}
	updateContext();

	commandManager.register(new FileReferencesCommand(client));
	return client.onTsServerStarted(() => updateContext());
}
