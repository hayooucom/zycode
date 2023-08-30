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


class SourceDefinitionCommand implements Command {

	public static readonly context = 'tsSupportsSourceDefinition';
	public static readonly minVersion = API.v470;

	public readonly id = 'typescript.goToSourceDefinition';

	public constructor(
		private readonly client: ITypeScriptServiceClient
	) { }

	public async execute() {
		if (this.client.apiVersion.lt(SourceDefinitionCommand.minVersion)) {
			zycode.window.showErrorMessage(zycode.l10n.t("Go to Source Definition failed. Requires TypeScript 4.7+."));
			return;
		}

		const activeEditor = zycode.window.activeTextEditor;
		if (!activeEditor) {
			zycode.window.showErrorMessage(zycode.l10n.t("Go to Source Definition failed. No resource provided."));
			return;
		}

		const resource = activeEditor.document.uri;
		const document = await zycode.workspace.openTextDocument(resource);
		if (!isSupportedLanguageMode(document)) {
			zycode.window.showErrorMessage(zycode.l10n.t("Go to Source Definition failed. Unsupported file type."));
			return;
		}

		const openedFiledPath = this.client.toOpenTsFilePath(document);
		if (!openedFiledPath) {
			zycode.window.showErrorMessage(zycode.l10n.t("Go to Source Definition failed. Unknown file type."));
			return;
		}

		await zycode.window.withProgress({
			location: zycode.ProgressLocation.Window,
			title: zycode.l10n.t("Finding source definitions")
		}, async (_progress, token) => {

			const position = activeEditor.selection.anchor;
			const args = typeConverters.Position.toFileLocationRequestArgs(openedFiledPath, position);
			const response = await this.client.execute('findSourceDefinition', args, token);
			if (response.type === 'response' && response.body) {
				const locations: zycode.Location[] = response.body.map(reference =>
					typeConverters.Location.fromTextSpan(this.client.toResource(reference.file), reference));

				if (locations.length) {
					if (locations.length === 1) {
						zycode.commands.executeCommand('zycode.open', locations[0].uri.with({
							fragment: `L${locations[0].range.start.line + 1},${locations[0].range.start.character + 1}`
						}));
					} else {
						zycode.commands.executeCommand('editor.action.showReferences', resource, position, locations);
					}
					return;
				}
			}

			zycode.window.showErrorMessage(zycode.l10n.t("No source definitions found."));
		});
	}
}


export function register(
	client: ITypeScriptServiceClient,
	commandManager: CommandManager
) {
	function updateContext() {
		zycode.commands.executeCommand('setContext', SourceDefinitionCommand.context, client.apiVersion.gte(SourceDefinitionCommand.minVersion));
	}
	updateContext();

	commandManager.register(new SourceDefinitionCommand(client));
	return client.onTsServerStarted(() => updateContext());
}
