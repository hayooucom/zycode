/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import { Command, CommandManager } from '../commands/commandManager';
import { DocumentSelector } from '../configuration/documentSelector';
import { TelemetryReporter } from '../logging/telemetry';
import { API } from '../tsServer/api';
import type * as Proto from '../tsServer/protocol/protocol';
import { OrganizeImportsMode } from '../tsServer/protocol/protocol.const';
import * as typeConverters from '../typeConverters';
import { ClientCapability, ITypeScriptServiceClient } from '../typescriptService';
import { nulToken } from '../utils/cancellation';
import FileConfigurationManager from './fileConfigurationManager';
import { conditionalRegistration, requireMinVersion, requireSomeCapability } from './util/dependentRegistration';


interface OrganizeImportsCommandMetadata {
	readonly ids: readonly string[];
	readonly title: string;
	readonly minVersion?: API;
	readonly kind: zycode.CodeActionKind;
	readonly mode: OrganizeImportsMode;
}

const organizeImportsCommand: OrganizeImportsCommandMetadata = {
	ids: ['typescript.organizeImports'],
	title: zycode.l10n.t("Organize Imports"),
	kind: zycode.CodeActionKind.SourceOrganizeImports,
	mode: OrganizeImportsMode.All,
};

const sortImportsCommand: OrganizeImportsCommandMetadata = {
	ids: ['typescript.sortImports', 'javascript.sortImports'],
	minVersion: API.v430,
	title: zycode.l10n.t("Sort Imports"),
	kind: zycode.CodeActionKind.Source.append('sortImports'),
	mode: OrganizeImportsMode.SortAndCombine,
};

const removeUnusedImportsCommand: OrganizeImportsCommandMetadata = {
	ids: ['typescript.removeUnusedImports', 'javascript.removeUnusedImports'],
	minVersion: API.v490,
	title: zycode.l10n.t("Remove Unused Imports"),
	kind: zycode.CodeActionKind.Source.append('removeUnusedImports'),
	mode: OrganizeImportsMode.RemoveUnused,
};

class OrganizeImportsCommand implements Command {

	constructor(
		public readonly id: string,
		private readonly commandMetadata: OrganizeImportsCommandMetadata,
		private readonly client: ITypeScriptServiceClient,
		private readonly telemetryReporter: TelemetryReporter,
	) { }

	public async execute(file?: string): Promise<any> {
		/* __GDPR__
			"organizeImports.execute" : {
				"owner": "mjbvz",
				"${include}": [
					"${TypeScriptCommonProperties}"
				]
			}
		*/
		this.telemetryReporter.logTelemetry('organizeImports.execute', {});
		if (!file) {
			const activeEditor = zycode.window.activeTextEditor;
			if (!activeEditor) {
				zycode.window.showErrorMessage(zycode.l10n.t("Organize Imports failed. No resource provided."));
				return;
			}

			const resource = activeEditor.document.uri;
			const document = await zycode.workspace.openTextDocument(resource);
			const openedFiledPath = this.client.toOpenTsFilePath(document);
			if (!openedFiledPath) {
				zycode.window.showErrorMessage(zycode.l10n.t("Organize Imports failed. Unknown file type."));
				return;
			}

			file = openedFiledPath;
		}

		const args: Proto.OrganizeImportsRequestArgs = {
			scope: {
				type: 'file',
				args: {
					file
				}
			},
			// Deprecated in 4.9; `mode` takes priority
			skipDestructiveCodeActions: this.commandMetadata.mode === OrganizeImportsMode.SortAndCombine,
			mode: typeConverters.OrganizeImportsMode.toProtocolOrganizeImportsMode(this.commandMetadata.mode),
		};
		const response = await this.client.interruptGetErr(() => this.client.execute('organizeImports', args, nulToken));
		if (response.type !== 'response' || !response.body) {
			return;
		}

		if (response.body.length) {
			const edits = typeConverters.WorkspaceEdit.fromFileCodeEdits(this.client, response.body);
			return zycode.workspace.applyEdit(edits);
		}
	}
}

class ImportsCodeActionProvider implements zycode.CodeActionProvider {

	constructor(
		private readonly client: ITypeScriptServiceClient,
		private readonly commandMetadata: OrganizeImportsCommandMetadata,
		commandManager: CommandManager,
		private readonly fileConfigManager: FileConfigurationManager,
		telemetryReporter: TelemetryReporter,
	) {
		for (const id of commandMetadata.ids) {
			commandManager.register(new OrganizeImportsCommand(id, commandMetadata, client, telemetryReporter));
		}
	}

	public provideCodeActions(
		document: zycode.TextDocument,
		_range: zycode.Range,
		context: zycode.CodeActionContext,
		token: zycode.CancellationToken
	): zycode.CodeAction[] {
		const file = this.client.toOpenTsFilePath(document);
		if (!file) {
			return [];
		}

		if (!context.only?.contains(this.commandMetadata.kind)) {
			return [];
		}

		this.fileConfigManager.ensureConfigurationForDocument(document, token);

		const action = new zycode.CodeAction(this.commandMetadata.title, this.commandMetadata.kind);
		action.command = { title: '', command: this.commandMetadata.ids[0], arguments: [file] };
		return [action];
	}
}

export function register(
	selector: DocumentSelector,
	client: ITypeScriptServiceClient,
	commandManager: CommandManager,
	fileConfigurationManager: FileConfigurationManager,
	telemetryReporter: TelemetryReporter,
): zycode.Disposable {
	const disposables: zycode.Disposable[] = [];

	for (const command of [organizeImportsCommand, sortImportsCommand, removeUnusedImportsCommand]) {
		disposables.push(conditionalRegistration([
			requireMinVersion(client, command.minVersion ?? API.defaultVersion),
			requireSomeCapability(client, ClientCapability.Semantic),
		], () => {
			const provider = new ImportsCodeActionProvider(client, command, commandManager, fileConfigurationManager, telemetryReporter);
			return zycode.languages.registerCodeActionsProvider(selector.semantic, provider, {
				providedCodeActionKinds: [command.kind]
			});
		}));
	}

	return zycode.Disposable.from(...disposables);
}
