/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import type * as lsp from 'zycode-languageserver-types';
import { MdLanguageClient } from '../client/client';
import { Command, CommandManager } from '../commandManager';


export class FindFileReferencesCommand implements Command {

	public readonly id = 'markdown.findAllFileReferences';

	constructor(
		private readonly _client: MdLanguageClient,
	) { }

	public async execute(resource?: zycode.Uri) {
		resource ??= zycode.window.activeTextEditor?.document.uri;
		if (!resource) {
			zycode.window.showErrorMessage(zycode.l10n.t("Find file references failed. No resource provided."));
			return;
		}

		await zycode.window.withProgress({
			location: zycode.ProgressLocation.Window,
			title: zycode.l10n.t("Finding file references")
		}, async (_progress, token) => {
			const locations = (await this._client.getReferencesToFileInWorkspace(resource!, token)).map(loc => {
				return new zycode.Location(zycode.Uri.parse(loc.uri), convertRange(loc.range));
			});

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

export function convertRange(range: lsp.Range): zycode.Range {
	return new zycode.Range(range.start.line, range.start.character, range.end.line, range.end.character);
}

export function registerFindFileReferenceSupport(
	commandManager: CommandManager,
	client: MdLanguageClient,
): zycode.Disposable {
	return commandManager.register(new FindFileReferencesCommand(client));
}
