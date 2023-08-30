/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import * as interfaces from './interfaces';

export default class MergeConflictCodeLensProvider implements zycode.CodeLensProvider, zycode.Disposable {
	private codeLensRegistrationHandle?: zycode.Disposable | null;
	private config?: interfaces.IExtensionConfiguration;
	private tracker: interfaces.IDocumentMergeConflictTracker;

	constructor(trackerService: interfaces.IDocumentMergeConflictTrackerService) {
		this.tracker = trackerService.createTracker('codelens');
	}

	begin(config: interfaces.IExtensionConfiguration) {
		this.config = config;

		if (this.config.enableCodeLens) {
			this.registerCodeLensProvider();
		}
	}

	configurationUpdated(updatedConfig: interfaces.IExtensionConfiguration) {

		if (updatedConfig.enableCodeLens === false && this.codeLensRegistrationHandle) {
			this.codeLensRegistrationHandle.dispose();
			this.codeLensRegistrationHandle = null;
		}
		else if (updatedConfig.enableCodeLens === true && !this.codeLensRegistrationHandle) {
			this.registerCodeLensProvider();
		}

		this.config = updatedConfig;
	}


	dispose() {
		if (this.codeLensRegistrationHandle) {
			this.codeLensRegistrationHandle.dispose();
			this.codeLensRegistrationHandle = null;
		}
	}

	async provideCodeLenses(document: zycode.TextDocument, _token: zycode.CancellationToken): Promise<zycode.CodeLens[] | null> {

		if (!this.config || !this.config.enableCodeLens) {
			return null;
		}

		const conflicts = await this.tracker.getConflicts(document);
		const conflictsCount = conflicts?.length ?? 0;
		zycode.commands.executeCommand('setContext', 'mergeConflictsCount', conflictsCount);

		if (!conflictsCount) {
			return null;
		}

		const items: zycode.CodeLens[] = [];

		conflicts.forEach(conflict => {
			const acceptCurrentCommand: zycode.Command = {
				command: 'merge-conflict.accept.current',
				title: zycode.l10n.t("Accept Current Change"),
				arguments: ['known-conflict', conflict]
			};

			const acceptIncomingCommand: zycode.Command = {
				command: 'merge-conflict.accept.incoming',
				title: zycode.l10n.t("Accept Incoming Change"),
				arguments: ['known-conflict', conflict]
			};

			const acceptBothCommand: zycode.Command = {
				command: 'merge-conflict.accept.both',
				title: zycode.l10n.t("Accept Both Changes"),
				arguments: ['known-conflict', conflict]
			};

			const diffCommand: zycode.Command = {
				command: 'merge-conflict.compare',
				title: zycode.l10n.t("Compare Changes"),
				arguments: [conflict]
			};

			const range = document.lineAt(conflict.range.start.line).range;
			items.push(
				new zycode.CodeLens(range, acceptCurrentCommand),
				new zycode.CodeLens(range, acceptIncomingCommand),
				new zycode.CodeLens(range, acceptBothCommand),
				new zycode.CodeLens(range, diffCommand)
			);
		});

		return items;
	}

	private registerCodeLensProvider() {
		this.codeLensRegistrationHandle = zycode.languages.registerCodeLensProvider([
			{ scheme: 'file' },
			{ scheme: 'zycode-vfs' },
			{ scheme: 'untitled' },
			{ scheme: 'zycode-userdata' },
		], this);
	}
}
