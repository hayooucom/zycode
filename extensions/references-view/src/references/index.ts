/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import { SymbolsTree } from '../tree';
import { FileItem, ReferenceItem, ReferencesModel, ReferencesTreeInput } from './model';

export function register(tree: SymbolsTree, context: zycode.ExtensionContext): void {

	function findLocations(title: string, command: string) {
		if (zycode.window.activeTextEditor) {
			const input = new ReferencesTreeInput(title, new zycode.Location(zycode.window.activeTextEditor.document.uri, zycode.window.activeTextEditor.selection.active), command);
			tree.setInput(input);
		}
	}

	context.subscriptions.push(
		zycode.commands.registerCommand('references-view.findReferences', () => findLocations('References', 'zycode.executeReferenceProvider')),
		zycode.commands.registerCommand('references-view.findImplementations', () => findLocations('Implementations', 'zycode.executeImplementationProvider')),
		// --- legacy name
		zycode.commands.registerCommand('references-view.find', (...args: any[]) => zycode.commands.executeCommand('references-view.findReferences', ...args)),
		zycode.commands.registerCommand('references-view.removeReferenceItem', removeReferenceItem),
		zycode.commands.registerCommand('references-view.copy', copyCommand),
		zycode.commands.registerCommand('references-view.copyAll', copyAllCommand),
		zycode.commands.registerCommand('references-view.copyPath', copyPathCommand),
	);


	// --- references.preferredLocation setting

	let showReferencesDisposable: zycode.Disposable | undefined;
	const config = 'references.preferredLocation';
	function updateShowReferences(event?: zycode.ConfigurationChangeEvent) {
		if (event && !event.affectsConfiguration(config)) {
			return;
		}
		const value = zycode.workspace.getConfiguration().get<string>(config);

		showReferencesDisposable?.dispose();
		showReferencesDisposable = undefined;

		if (value === 'view') {
			showReferencesDisposable = zycode.commands.registerCommand('editor.action.showReferences', async (uri: zycode.Uri, position: zycode.Position, locations: zycode.Location[]) => {
				const input = new ReferencesTreeInput(zycode.l10n.t('References'), new zycode.Location(uri, position), 'zycode.executeReferenceProvider', locations);
				tree.setInput(input);
			});
		}
	}
	context.subscriptions.push(zycode.workspace.onDidChangeConfiguration(updateShowReferences));
	context.subscriptions.push({ dispose: () => showReferencesDisposable?.dispose() });
	updateShowReferences();
}

const copyAllCommand = async (item: ReferenceItem | FileItem | unknown) => {
	if (item instanceof ReferenceItem) {
		copyCommand(item.file.model);
	} else if (item instanceof FileItem) {
		copyCommand(item.model);
	}
};

function removeReferenceItem(item: FileItem | ReferenceItem | unknown) {
	if (item instanceof FileItem) {
		item.remove();
	} else if (item instanceof ReferenceItem) {
		item.remove();
	}
}


async function copyCommand(item: ReferencesModel | ReferenceItem | FileItem | unknown) {
	let val: string | undefined;
	if (item instanceof ReferencesModel) {
		val = await item.asCopyText();
	} else if (item instanceof ReferenceItem) {
		val = await item.asCopyText();
	} else if (item instanceof FileItem) {
		val = await item.asCopyText();
	}
	if (val) {
		await zycode.env.clipboard.writeText(val);
	}
}

async function copyPathCommand(item: FileItem | unknown) {
	if (item instanceof FileItem) {
		if (item.uri.scheme === 'file') {
			zycode.env.clipboard.writeText(item.uri.fsPath);
		} else {
			zycode.env.clipboard.writeText(item.uri.toString(true));
		}
	}
}
