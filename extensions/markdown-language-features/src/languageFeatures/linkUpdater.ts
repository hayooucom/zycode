/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as picomatch from 'picomatch';
import * as zycode from 'zycode';
import { TextDocumentEdit } from 'zycode-languageclient';
import { MdLanguageClient } from '../client/client';
import { Delayer } from '../util/async';
import { noopToken } from '../util/cancellation';
import { Disposable } from '../util/dispose';
import { convertRange } from './fileReferences';


const settingNames = Object.freeze({
	enabled: 'updateLinksOnFileMove.enabled',
	include: 'updateLinksOnFileMove.include',
	enableForDirectories: 'updateLinksOnFileMove.enableForDirectories',
});

const enum UpdateLinksOnFileMoveSetting {
	Prompt = 'prompt',
	Always = 'always',
	Never = 'never',
}

interface RenameAction {
	readonly oldUri: zycode.Uri;
	readonly newUri: zycode.Uri;
}

class UpdateLinksOnFileRenameHandler extends Disposable {

	private readonly _delayer = new Delayer(50);
	private readonly _pendingRenames = new Set<RenameAction>();

	public constructor(
		private readonly _client: MdLanguageClient,
	) {
		super();

		this._register(zycode.workspace.onDidRenameFiles(async (e) => {
			await Promise.all(e.files.map(async (rename) => {
				if (await this._shouldParticipateInLinkUpdate(rename.newUri)) {
					this._pendingRenames.add(rename);
				}
			}));

			if (this._pendingRenames.size) {
				this._delayer.trigger(() => {
					zycode.window.withProgress({
						location: zycode.ProgressLocation.Window,
						title: zycode.l10n.t("Checking for Markdown links to update")
					}, () => this._flushRenames());
				});
			}
		}));
	}

	private async _flushRenames(): Promise<void> {
		const renames = Array.from(this._pendingRenames);
		this._pendingRenames.clear();

		const result = await this._getEditsForFileRename(renames, noopToken);

		if (result && result.edit.size) {
			if (await this._confirmActionWithUser(result.resourcesBeingRenamed)) {
				await zycode.workspace.applyEdit(result.edit);
			}
		}
	}

	private async _confirmActionWithUser(newResources: readonly zycode.Uri[]): Promise<boolean> {
		if (!newResources.length) {
			return false;
		}

		const config = zycode.workspace.getConfiguration('markdown', newResources[0]);
		const setting = config.get<UpdateLinksOnFileMoveSetting>(settingNames.enabled);
		switch (setting) {
			case UpdateLinksOnFileMoveSetting.Prompt:
				return this._promptUser(newResources);
			case UpdateLinksOnFileMoveSetting.Always:
				return true;
			case UpdateLinksOnFileMoveSetting.Never:
			default:
				return false;
		}
	}
	private async _shouldParticipateInLinkUpdate(newUri: zycode.Uri): Promise<boolean> {
		const config = zycode.workspace.getConfiguration('markdown', newUri);
		const setting = config.get<UpdateLinksOnFileMoveSetting>(settingNames.enabled);
		if (setting === UpdateLinksOnFileMoveSetting.Never) {
			return false;
		}

		const externalGlob = config.get<string[]>(settingNames.include);
		if (externalGlob) {
			for (const glob of externalGlob) {
				if (picomatch.isMatch(newUri.fsPath, glob)) {
					return true;
				}
			}
		}

		const stat = await zycode.workspace.fs.stat(newUri);
		if (stat.type === zycode.FileType.Directory) {
			return config.get<boolean>(settingNames.enableForDirectories, true);
		}

		return false;
	}

	private async _promptUser(newResources: readonly zycode.Uri[]): Promise<boolean> {
		if (!newResources.length) {
			return false;
		}

		const rejectItem: zycode.MessageItem = {
			title: zycode.l10n.t("No"),
			isCloseAffordance: true,
		};

		const acceptItem: zycode.MessageItem = {
			title: zycode.l10n.t("Yes"),
		};

		const alwaysItem: zycode.MessageItem = {
			title: zycode.l10n.t("Always"),
		};

		const neverItem: zycode.MessageItem = {
			title: zycode.l10n.t("Never"),
		};

		const choice = await zycode.window.showInformationMessage(
			newResources.length === 1
				? zycode.l10n.t("Update Markdown links for '{0}'?", path.basename(newResources[0].fsPath))
				: this._getConfirmMessage(zycode.l10n.t("Update Markdown links for the following {0} files?", newResources.length), newResources), {
			modal: true,
		}, rejectItem, acceptItem, alwaysItem, neverItem);

		switch (choice) {
			case acceptItem: {
				return true;
			}
			case rejectItem: {
				return false;
			}
			case alwaysItem: {
				const config = zycode.workspace.getConfiguration('markdown', newResources[0]);
				config.update(
					settingNames.enabled,
					UpdateLinksOnFileMoveSetting.Always,
					this._getConfigTargetScope(config, settingNames.enabled));
				return true;
			}
			case neverItem: {
				const config = zycode.workspace.getConfiguration('markdown', newResources[0]);
				config.update(
					settingNames.enabled,
					UpdateLinksOnFileMoveSetting.Never,
					this._getConfigTargetScope(config, settingNames.enabled));
				return false;
			}
			default: {
				return false;
			}
		}
	}

	private async _getEditsForFileRename(renames: readonly RenameAction[], token: zycode.CancellationToken): Promise<{ edit: zycode.WorkspaceEdit; resourcesBeingRenamed: zycode.Uri[] } | undefined> {
		const result = await this._client.getEditForFileRenames(renames.map(rename => ({ oldUri: rename.oldUri.toString(), newUri: rename.newUri.toString() })), token);
		if (!result?.edit.documentChanges?.length) {
			return undefined;
		}

		const workspaceEdit = new zycode.WorkspaceEdit();

		for (const change of result.edit.documentChanges as TextDocumentEdit[]) {
			const uri = zycode.Uri.parse(change.textDocument.uri);
			for (const edit of change.edits) {
				workspaceEdit.replace(uri, convertRange(edit.range), edit.newText);
			}
		}

		return {
			edit: workspaceEdit,
			resourcesBeingRenamed: result.participatingRenames.map(x => zycode.Uri.parse(x.newUri)),
		};
	}

	private _getConfirmMessage(start: string, resourcesToConfirm: readonly zycode.Uri[]): string {
		const MAX_CONFIRM_FILES = 10;

		const paths = [start];
		paths.push('');
		paths.push(...resourcesToConfirm.slice(0, MAX_CONFIRM_FILES).map(r => path.basename(r.fsPath)));

		if (resourcesToConfirm.length > MAX_CONFIRM_FILES) {
			if (resourcesToConfirm.length - MAX_CONFIRM_FILES === 1) {
				paths.push(zycode.l10n.t("...1 additional file not shown"));
			} else {
				paths.push(zycode.l10n.t("...{0} additional files not shown", resourcesToConfirm.length - MAX_CONFIRM_FILES));
			}
		}

		paths.push('');
		return paths.join('\n');
	}

	private _getConfigTargetScope(config: zycode.WorkspaceConfiguration, settingsName: string): zycode.ConfigurationTarget {
		const inspected = config.inspect(settingsName);
		if (inspected?.workspaceFolderValue) {
			return zycode.ConfigurationTarget.WorkspaceFolder;
		}

		if (inspected?.workspaceValue) {
			return zycode.ConfigurationTarget.Workspace;
		}

		return zycode.ConfigurationTarget.Global;
	}
}

export function registerUpdateLinksOnRename(client: MdLanguageClient): zycode.Disposable {
	return new UpdateLinksOnFileRenameHandler(client);
}
