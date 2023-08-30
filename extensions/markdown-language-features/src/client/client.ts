/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import { BaseLanguageClient, LanguageClientOptions, NotebookDocumentSyncRegistrationType } from 'zycode-languageclient';
import { IMdParser } from '../markdownEngine';
import * as proto from './protocol';
import { looksLikeMarkdownPath, markdownFileExtensions } from '../util/file';
import { VsCodeMdWorkspace } from './workspace';
import { FileWatcherManager } from './fileWatchingManager';
import { IDisposable } from '../util/dispose';


export type LanguageClientConstructor = (name: string, description: string, clientOptions: LanguageClientOptions) => BaseLanguageClient;

export class MdLanguageClient implements IDisposable {

	constructor(
		private readonly _client: BaseLanguageClient,
		private readonly _workspace: VsCodeMdWorkspace,
	) { }

	dispose(): void {
		this._client.stop();
		this._workspace.dispose();
	}

	resolveLinkTarget(linkText: string, uri: zycode.Uri): Promise<proto.ResolvedDocumentLinkTarget> {
		return this._client.sendRequest(proto.resolveLinkTarget, { linkText, uri: uri.toString() });
	}

	getEditForFileRenames(files: ReadonlyArray<{ oldUri: string; newUri: string }>, token: zycode.CancellationToken) {
		return this._client.sendRequest(proto.getEditForFileRenames, files, token);
	}

	getReferencesToFileInWorkspace(resource: zycode.Uri, token: zycode.CancellationToken) {
		return this._client.sendRequest(proto.getReferencesToFileInWorkspace, { uri: resource.toString() }, token);
	}
}

export async function startClient(factory: LanguageClientConstructor, parser: IMdParser): Promise<MdLanguageClient> {

	const mdFileGlob = `**/*.{${markdownFileExtensions.join(',')}}`;

	const clientOptions: LanguageClientOptions = {
		documentSelector: [{ language: 'markdown' }],
		synchronize: {
			configurationSection: ['markdown'],
			fileEvents: zycode.workspace.createFileSystemWatcher(mdFileGlob),
		},
		initializationOptions: {
			markdownFileExtensions,
			i10lLocation: zycode.l10n.uri?.toJSON(),
		},
		diagnosticPullOptions: {
			onChange: true,
			onTabs: true,
			match(_documentSelector, resource) {
				return looksLikeMarkdownPath(resource);
			},
		},
	};

	const client = factory('markdown', zycode.l10n.t("Markdown Language Server"), clientOptions);

	client.registerProposedFeatures();

	const notebookFeature = client.getFeature(NotebookDocumentSyncRegistrationType.method);
	if (notebookFeature !== undefined) {
		notebookFeature.register({
			id: String(Date.now()),
			registerOptions: {
				notebookSelector: [{
					notebook: '*',
					cells: [{ language: 'markdown' }]
				}]
			}
		});
	}

	const workspace = new VsCodeMdWorkspace();

	client.onRequest(proto.parse, async (e) => {
		const uri = zycode.Uri.parse(e.uri);
		const doc = await workspace.getOrLoadMarkdownDocument(uri);
		if (doc) {
			return parser.tokenize(doc);
		} else {
			return [];
		}
	});

	client.onRequest(proto.fs_readFile, async (e): Promise<number[]> => {
		const uri = zycode.Uri.parse(e.uri);
		return Array.from(await zycode.workspace.fs.readFile(uri));
	});

	client.onRequest(proto.fs_stat, async (e): Promise<{ isDirectory: boolean } | undefined> => {
		const uri = zycode.Uri.parse(e.uri);
		try {
			const stat = await zycode.workspace.fs.stat(uri);
			return { isDirectory: stat.type === zycode.FileType.Directory };
		} catch {
			return undefined;
		}
	});

	client.onRequest(proto.fs_readDirectory, async (e): Promise<[string, { isDirectory: boolean }][]> => {
		const uri = zycode.Uri.parse(e.uri);
		const result = await zycode.workspace.fs.readDirectory(uri);
		return result.map(([name, type]) => [name, { isDirectory: type === zycode.FileType.Directory }]);
	});

	client.onRequest(proto.findMarkdownFilesInWorkspace, async (): Promise<string[]> => {
		return (await zycode.workspace.findFiles(mdFileGlob, '**/node_modules/**')).map(x => x.toString());
	});

	const watchers = new FileWatcherManager();

	client.onRequest(proto.fs_watcher_create, async (params): Promise<void> => {
		const id = params.id;
		const uri = zycode.Uri.parse(params.uri);

		const sendWatcherChange = (kind: 'create' | 'change' | 'delete') => {
			client.sendRequest(proto.fs_watcher_onChange, { id, uri: params.uri, kind });
		};

		watchers.create(id, uri, params.watchParentDirs, {
			create: params.options.ignoreCreate ? undefined : () => sendWatcherChange('create'),
			change: params.options.ignoreChange ? undefined : () => sendWatcherChange('change'),
			delete: params.options.ignoreDelete ? undefined : () => sendWatcherChange('delete'),
		});
	});

	client.onRequest(proto.fs_watcher_delete, async (params): Promise<void> => {
		watchers.delete(params.id);
	});

	zycode.commands.registerCommand('vscodeMarkdownLanguageservice.open', (uri, args) => {
		return zycode.commands.executeCommand('zycode.open', uri, args);
	});

	zycode.commands.registerCommand('vscodeMarkdownLanguageservice.rename', (uri, pos) => {
		return zycode.commands.executeCommand('editor.action.rename', [zycode.Uri.from(uri), new zycode.Position(pos.line, pos.character)]);
	});

	await client.start();

	return new MdLanguageClient(client, workspace);
}
