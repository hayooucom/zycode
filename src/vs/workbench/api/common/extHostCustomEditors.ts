/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { CancellationToken } from 'vs/base/common/cancellation';
import { hash } from 'vs/base/common/hash';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { joinPath } from 'vs/base/common/resources';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ExtHostDocuments } from 'vs/workbench/api/common/extHostDocuments';
import { IExtensionStoragePaths } from 'vs/workbench/api/common/extHostStoragePaths';
import * as typeConverters from 'vs/workbench/api/common/extHostTypeConverters';
import { ExtHostWebviews, shouldSerializeBuffersForPostMessage, toExtensionData } from 'vs/workbench/api/common/extHostWebview';
import { ExtHostWebviewPanels } from 'vs/workbench/api/common/extHostWebviewPanels';
import { EditorGroupColumn } from 'vs/workbench/services/editor/common/editorGroupColumn';
import type * as zycode from 'zycode';
import { Cache } from './cache';
import * as extHostProtocol from './extHost.protocol';
import * as extHostTypes from './extHostTypes';


class CustomDocumentStoreEntry {

	private _backupCounter = 1;

	constructor(
		public readonly document: zycode.CustomDocument,
		private readonly _storagePath: URI | undefined,
	) { }

	private readonly _edits = new Cache<zycode.CustomDocumentEditEvent>('custom documents');

	private _backup?: zycode.CustomDocumentBackup;

	addEdit(item: zycode.CustomDocumentEditEvent): number {
		return this._edits.add([item]);
	}

	async undo(editId: number, isDirty: boolean): Promise<void> {
		await this.getEdit(editId).undo();
		if (!isDirty) {
			this.disposeBackup();
		}
	}

	async redo(editId: number, isDirty: boolean): Promise<void> {
		await this.getEdit(editId).redo();
		if (!isDirty) {
			this.disposeBackup();
		}
	}

	disposeEdits(editIds: number[]): void {
		for (const id of editIds) {
			this._edits.delete(id);
		}
	}

	getNewBackupUri(): URI {
		if (!this._storagePath) {
			throw new Error('Backup requires a valid storage path');
		}
		const fileName = hashPath(this.document.uri) + (this._backupCounter++);
		return joinPath(this._storagePath, fileName);
	}

	updateBackup(backup: zycode.CustomDocumentBackup): void {
		this._backup?.delete();
		this._backup = backup;
	}

	disposeBackup(): void {
		this._backup?.delete();
		this._backup = undefined;
	}

	private getEdit(editId: number): zycode.CustomDocumentEditEvent {
		const edit = this._edits.get(editId, 0);
		if (!edit) {
			throw new Error('No edit found');
		}
		return edit;
	}
}

class CustomDocumentStore {
	private readonly _documents = new Map<string, CustomDocumentStoreEntry>();

	public get(viewType: string, resource: zycode.Uri): CustomDocumentStoreEntry | undefined {
		return this._documents.get(this.key(viewType, resource));
	}

	public add(viewType: string, document: zycode.CustomDocument, storagePath: URI | undefined): CustomDocumentStoreEntry {
		const key = this.key(viewType, document.uri);
		if (this._documents.has(key)) {
			throw new Error(`Document already exists for viewType:${viewType} resource:${document.uri}`);
		}
		const entry = new CustomDocumentStoreEntry(document, storagePath);
		this._documents.set(key, entry);
		return entry;
	}

	public delete(viewType: string, document: zycode.CustomDocument) {
		const key = this.key(viewType, document.uri);
		this._documents.delete(key);
	}

	private key(viewType: string, resource: zycode.Uri): string {
		return `${viewType}@@@${resource}`;
	}
}

const enum CustomEditorType {
	Text,
	Custom
}

type ProviderEntry = {
	readonly extension: IExtensionDescription;
	readonly type: CustomEditorType.Text;
	readonly provider: zycode.CustomTextEditorProvider;
} | {
	readonly extension: IExtensionDescription;
	readonly type: CustomEditorType.Custom;
	readonly provider: zycode.CustomReadonlyEditorProvider;
};

class EditorProviderStore {
	private readonly _providers = new Map<string, ProviderEntry>();

	public addTextProvider(viewType: string, extension: IExtensionDescription, provider: zycode.CustomTextEditorProvider): zycode.Disposable {
		return this.add(CustomEditorType.Text, viewType, extension, provider);
	}

	public addCustomProvider(viewType: string, extension: IExtensionDescription, provider: zycode.CustomReadonlyEditorProvider): zycode.Disposable {
		return this.add(CustomEditorType.Custom, viewType, extension, provider);
	}

	public get(viewType: string): ProviderEntry | undefined {
		return this._providers.get(viewType);
	}

	private add(type: CustomEditorType, viewType: string, extension: IExtensionDescription, provider: zycode.CustomTextEditorProvider | zycode.CustomReadonlyEditorProvider): zycode.Disposable {
		if (this._providers.has(viewType)) {
			throw new Error(`Provider for viewType:${viewType} already registered`);
		}
		this._providers.set(viewType, { type, extension, provider } as ProviderEntry);
		return new extHostTypes.Disposable(() => this._providers.delete(viewType));
	}
}

export class ExtHostCustomEditors implements extHostProtocol.ExtHostCustomEditorsShape {

	private readonly _proxy: extHostProtocol.MainThreadCustomEditorsShape;

	private readonly _editorProviders = new EditorProviderStore();

	private readonly _documents = new CustomDocumentStore();

	constructor(
		mainContext: extHostProtocol.IMainContext,
		private readonly _extHostDocuments: ExtHostDocuments,
		private readonly _extensionStoragePaths: IExtensionStoragePaths | undefined,
		private readonly _extHostWebview: ExtHostWebviews,
		private readonly _extHostWebviewPanels: ExtHostWebviewPanels,
	) {
		this._proxy = mainContext.getProxy(extHostProtocol.MainContext.MainThreadCustomEditors);
	}

	public registerCustomEditorProvider(
		extension: IExtensionDescription,
		viewType: string,
		provider: zycode.CustomReadonlyEditorProvider | zycode.CustomTextEditorProvider,
		options: { webviewOptions?: zycode.WebviewPanelOptions; supportsMultipleEditorsPerDocument?: boolean },
	): zycode.Disposable {
		const disposables = new DisposableStore();
		if (isCustomTextEditorProvider(provider)) {
			disposables.add(this._editorProviders.addTextProvider(viewType, extension, provider));
			this._proxy.$registerTextEditorProvider(toExtensionData(extension), viewType, options.webviewOptions || {}, {
				supportsMove: !!provider.moveCustomTextEditor,
			}, shouldSerializeBuffersForPostMessage(extension));
		} else {
			disposables.add(this._editorProviders.addCustomProvider(viewType, extension, provider));

			if (isCustomEditorProviderWithEditingCapability(provider)) {
				disposables.add(provider.onDidChangeCustomDocument(e => {
					const entry = this.getCustomDocumentEntry(viewType, e.document.uri);
					if (isEditEvent(e)) {
						const editId = entry.addEdit(e);
						this._proxy.$onDidEdit(e.document.uri, viewType, editId, e.label);
					} else {
						this._proxy.$onContentChange(e.document.uri, viewType);
					}
				}));
			}

			this._proxy.$registerCustomEditorProvider(toExtensionData(extension), viewType, options.webviewOptions || {}, !!options.supportsMultipleEditorsPerDocument, shouldSerializeBuffersForPostMessage(extension));
		}

		return extHostTypes.Disposable.from(
			disposables,
			new extHostTypes.Disposable(() => {
				this._proxy.$unregisterEditorProvider(viewType);
			}));
	}

	async $createCustomDocument(resource: UriComponents, viewType: string, backupId: string | undefined, untitledDocumentData: VSBuffer | undefined, cancellation: CancellationToken) {
		const entry = this._editorProviders.get(viewType);
		if (!entry) {
			throw new Error(`No provider found for '${viewType}'`);
		}

		if (entry.type !== CustomEditorType.Custom) {
			throw new Error(`Invalid provide type for '${viewType}'`);
		}

		const revivedResource = URI.revive(resource);
		const document = await entry.provider.openCustomDocument(revivedResource, { backupId, untitledDocumentData: untitledDocumentData?.buffer }, cancellation);

		let storageRoot: URI | undefined;
		if (isCustomEditorProviderWithEditingCapability(entry.provider) && this._extensionStoragePaths) {
			storageRoot = this._extensionStoragePaths.workspaceValue(entry.extension) ?? this._extensionStoragePaths.globalValue(entry.extension);
		}
		this._documents.add(viewType, document, storageRoot);

		return { editable: isCustomEditorProviderWithEditingCapability(entry.provider) };
	}

	async $disposeCustomDocument(resource: UriComponents, viewType: string): Promise<void> {
		const entry = this._editorProviders.get(viewType);
		if (!entry) {
			throw new Error(`No provider found for '${viewType}'`);
		}

		if (entry.type !== CustomEditorType.Custom) {
			throw new Error(`Invalid provider type for '${viewType}'`);
		}

		const revivedResource = URI.revive(resource);
		const { document } = this.getCustomDocumentEntry(viewType, revivedResource);
		this._documents.delete(viewType, document);
		document.dispose();
	}

	async $resolveCustomEditor(
		resource: UriComponents,
		handle: extHostProtocol.WebviewHandle,
		viewType: string,
		initData: {
			title: string;
			contentOptions: extHostProtocol.IWebviewContentOptions;
			options: extHostProtocol.IWebviewPanelOptions;
			active: boolean;
		},
		position: EditorGroupColumn,
		cancellation: CancellationToken,
	): Promise<void> {
		const entry = this._editorProviders.get(viewType);
		if (!entry) {
			throw new Error(`No provider found for '${viewType}'`);
		}

		const viewColumn = typeConverters.ViewColumn.to(position);

		const webview = this._extHostWebview.createNewWebview(handle, initData.contentOptions, entry.extension);
		const panel = this._extHostWebviewPanels.createNewWebviewPanel(handle, viewType, initData.title, viewColumn, initData.options, webview, initData.active);

		const revivedResource = URI.revive(resource);

		switch (entry.type) {
			case CustomEditorType.Custom: {
				const { document } = this.getCustomDocumentEntry(viewType, revivedResource);
				return entry.provider.resolveCustomEditor(document, panel, cancellation);
			}
			case CustomEditorType.Text: {
				const document = this._extHostDocuments.getDocument(revivedResource);
				return entry.provider.resolveCustomTextEditor(document, panel, cancellation);
			}
			default: {
				throw new Error('Unknown webview provider type');
			}
		}
	}

	$disposeEdits(resourceComponents: UriComponents, viewType: string, editIds: number[]): void {
		const document = this.getCustomDocumentEntry(viewType, resourceComponents);
		document.disposeEdits(editIds);
	}

	async $onMoveCustomEditor(handle: string, newResourceComponents: UriComponents, viewType: string): Promise<void> {
		const entry = this._editorProviders.get(viewType);
		if (!entry) {
			throw new Error(`No provider found for '${viewType}'`);
		}

		if (!(entry.provider as zycode.CustomTextEditorProvider).moveCustomTextEditor) {
			throw new Error(`Provider does not implement move '${viewType}'`);
		}

		const webview = this._extHostWebviewPanels.getWebviewPanel(handle);
		if (!webview) {
			throw new Error(`No webview found`);
		}

		const resource = URI.revive(newResourceComponents);
		const document = this._extHostDocuments.getDocument(resource);
		await (entry.provider as zycode.CustomTextEditorProvider).moveCustomTextEditor!(document, webview, CancellationToken.None);
	}

	async $undo(resourceComponents: UriComponents, viewType: string, editId: number, isDirty: boolean): Promise<void> {
		const entry = this.getCustomDocumentEntry(viewType, resourceComponents);
		return entry.undo(editId, isDirty);
	}

	async $redo(resourceComponents: UriComponents, viewType: string, editId: number, isDirty: boolean): Promise<void> {
		const entry = this.getCustomDocumentEntry(viewType, resourceComponents);
		return entry.redo(editId, isDirty);
	}

	async $revert(resourceComponents: UriComponents, viewType: string, cancellation: CancellationToken): Promise<void> {
		const entry = this.getCustomDocumentEntry(viewType, resourceComponents);
		const provider = this.getCustomEditorProvider(viewType);
		await provider.revertCustomDocument(entry.document, cancellation);
		entry.disposeBackup();
	}

	async $onSave(resourceComponents: UriComponents, viewType: string, cancellation: CancellationToken): Promise<void> {
		const entry = this.getCustomDocumentEntry(viewType, resourceComponents);
		const provider = this.getCustomEditorProvider(viewType);
		await provider.saveCustomDocument(entry.document, cancellation);
		entry.disposeBackup();
	}

	async $onSaveAs(resourceComponents: UriComponents, viewType: string, targetResource: UriComponents, cancellation: CancellationToken): Promise<void> {
		const entry = this.getCustomDocumentEntry(viewType, resourceComponents);
		const provider = this.getCustomEditorProvider(viewType);
		return provider.saveCustomDocumentAs(entry.document, URI.revive(targetResource), cancellation);
	}

	async $backup(resourceComponents: UriComponents, viewType: string, cancellation: CancellationToken): Promise<string> {
		const entry = this.getCustomDocumentEntry(viewType, resourceComponents);
		const provider = this.getCustomEditorProvider(viewType);

		const backup = await provider.backupCustomDocument(entry.document, {
			destination: entry.getNewBackupUri(),
		}, cancellation);
		entry.updateBackup(backup);
		return backup.id;
	}

	private getCustomDocumentEntry(viewType: string, resource: UriComponents): CustomDocumentStoreEntry {
		const entry = this._documents.get(viewType, URI.revive(resource));
		if (!entry) {
			throw new Error('No custom document found');
		}
		return entry;
	}

	private getCustomEditorProvider(viewType: string): zycode.CustomEditorProvider {
		const entry = this._editorProviders.get(viewType);
		const provider = entry?.provider;
		if (!provider || !isCustomEditorProviderWithEditingCapability(provider)) {
			throw new Error('Custom document is not editable');
		}
		return provider;
	}
}

function isCustomEditorProviderWithEditingCapability(provider: zycode.CustomTextEditorProvider | zycode.CustomEditorProvider | zycode.CustomReadonlyEditorProvider): provider is zycode.CustomEditorProvider {
	return !!(provider as zycode.CustomEditorProvider).onDidChangeCustomDocument;
}

function isCustomTextEditorProvider(provider: zycode.CustomReadonlyEditorProvider<zycode.CustomDocument> | zycode.CustomTextEditorProvider): provider is zycode.CustomTextEditorProvider {
	return typeof (provider as zycode.CustomTextEditorProvider).resolveCustomTextEditor === 'function';
}

function isEditEvent(e: zycode.CustomDocumentContentChangeEvent | zycode.CustomDocumentEditEvent): e is zycode.CustomDocumentEditEvent {
	return typeof (e as zycode.CustomDocumentEditEvent).undo === 'function'
		&& typeof (e as zycode.CustomDocumentEditEvent).redo === 'function';
}

function hashPath(resource: URI): string {
	const str = resource.scheme === Schemas.file || resource.scheme === Schemas.untitled ? resource.fsPath : resource.toString();
	return hash(str) + '';
}
