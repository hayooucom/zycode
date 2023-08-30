/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { insert } from 'vs/base/common/arrays';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { EditSessionIdentityMatch, IEditSessionIdentityCreateParticipant, IEditSessionIdentityProvider, IEditSessionIdentityService } from 'vs/platform/workspace/common/editSessions';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';

export class EditSessionIdentityService implements IEditSessionIdentityService {
	readonly _serviceBrand: undefined;

	private _editSessionIdentifierProviders = new Map<string, IEditSessionIdentityProvider>();

	constructor(
		@IExtensionService private readonly _extensionService: IExtensionService,
		@ILogService private readonly _logService: ILogService,
	) { }

	registerEditSessionIdentityProvider(provider: IEditSessionIdentityProvider): IDisposable {
		if (this._editSessionIdentifierProviders.get(provider.scheme)) {
			throw new Error(`A provider has already been registered for scheme ${provider.scheme}`);
		}

		this._editSessionIdentifierProviders.set(provider.scheme, provider);
		return toDisposable(() => {
			this._editSessionIdentifierProviders.delete(provider.scheme);
		});
	}

	async getEditSessionIdentifier(workspaceFolder: IWorkspaceFolder, token: CancellationToken): Promise<string | undefined> {
		const { scheme } = workspaceFolder.uri;

		const provider = await this.activateProvider(scheme);
		this._logService.trace(`EditSessionIdentityProvider for scheme ${scheme} available: ${!!provider}`);

		return provider?.getEditSessionIdentifier(workspaceFolder, token);
	}

	async provideEditSessionIdentityMatch(workspaceFolder: IWorkspaceFolder, identity1: string, identity2: string, cancellationToken: CancellationToken): Promise<EditSessionIdentityMatch | undefined> {
		const { scheme } = workspaceFolder.uri;

		const provider = await this.activateProvider(scheme);
		this._logService.trace(`EditSessionIdentityProvider for scheme ${scheme} available: ${!!provider}`);

		return provider?.provideEditSessionIdentityMatch?.(workspaceFolder, identity1, identity2, cancellationToken);
	}

	async onWillCreateEditSessionIdentity(workspaceFolder: IWorkspaceFolder, cancellationToken: CancellationToken): Promise<void> {
		this._logService.debug('Running onWillCreateEditSessionIdentity participants...');

		// TODO@joyceerhl show progress notification?
		for (const participant of this._participants) {
			await participant.participate(workspaceFolder, cancellationToken);
		}

		this._logService.debug(`Done running ${this._participants.length} onWillCreateEditSessionIdentity participants.`);
	}

	private _participants: IEditSessionIdentityCreateParticipant[] = [];

	addEditSessionIdentityCreateParticipant(participant: IEditSessionIdentityCreateParticipant): IDisposable {
		const dispose = insert(this._participants, participant);

		return toDisposable(() => dispose());
	}

	private async activateProvider(scheme: string) {
		const transformedScheme = scheme === 'zycode-remote' ? 'file' : scheme;

		const provider = this._editSessionIdentifierProviders.get(scheme);
		if (provider) {
			return provider;
		}

		await this._extensionService.activateByEvent(`onEditSession:${transformedScheme}`);
		return this._editSessionIdentifierProviders.get(scheme);
	}
}

registerSingleton(IEditSessionIdentityService, EditSessionIdentityService, InstantiationType.Delayed);
