/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import * as uri from 'zycode-uri';
import { ILogger } from '../logging';
import { MarkdownContributionProvider } from '../markdownExtensions';
import { Disposable } from '../util/dispose';
import { isMarkdownFile } from '../util/file';
import { MdLinkOpener } from '../util/openDocumentLink';
import { WebviewResourceProvider } from '../util/resources';
import { urlToUri } from '../util/url';
import { ImageInfo, MdDocumentRenderer } from './documentRenderer';
import { MarkdownPreviewConfigurationManager } from './previewConfig';
import { scrollEditorToLine, StartingScrollFragment, StartingScrollLine, StartingScrollLocation } from './scrolling';
import { getVisibleLine, LastScrollLocation, TopmostLineMonitor } from './topmostLineMonitor';
import type { FromWebviewMessage, ToWebviewMessage } from '../../types/previewMessaging';

export class PreviewDocumentVersion {

	public readonly resource: zycode.Uri;
	private readonly _version: number;

	public constructor(document: zycode.TextDocument) {
		this.resource = document.uri;
		this._version = document.version;
	}

	public equals(other: PreviewDocumentVersion): boolean {
		return this.resource.fsPath === other.resource.fsPath
			&& this._version === other._version;
	}
}

interface MarkdownPreviewDelegate {
	getTitle?(resource: zycode.Uri): string;
	getAdditionalState(): {};
	openPreviewLinkToMarkdownFile(markdownLink: zycode.Uri, fragment: string | undefined): void;
}

class MarkdownPreview extends Disposable implements WebviewResourceProvider {

	private static readonly _unwatchedImageSchemes = new Set(['https', 'http', 'data']);

	private _disposed: boolean = false;

	private readonly _delay = 300;
	private _throttleTimer: any;

	private readonly _resource: zycode.Uri;
	private readonly _webviewPanel: zycode.WebviewPanel;

	private _line: number | undefined;
	private _scrollToFragment: string | undefined;
	private _firstUpdate = true;
	private _currentVersion?: PreviewDocumentVersion;
	private _isScrolling = false;

	private _imageInfo: readonly ImageInfo[] = [];
	private readonly _fileWatchersBySrc = new Map</* src: */ string, zycode.FileSystemWatcher>();

	private readonly _onScrollEmitter = this._register(new zycode.EventEmitter<LastScrollLocation>());
	public readonly onScroll = this._onScrollEmitter.event;

	private readonly _disposeCts = this._register(new zycode.CancellationTokenSource());

	constructor(
		webview: zycode.WebviewPanel,
		resource: zycode.Uri,
		startingScroll: StartingScrollLocation | undefined,
		private readonly _delegate: MarkdownPreviewDelegate,
		private readonly _contentProvider: MdDocumentRenderer,
		private readonly _previewConfigurations: MarkdownPreviewConfigurationManager,
		private readonly _logger: ILogger,
		private readonly _contributionProvider: MarkdownContributionProvider,
		private readonly _opener: MdLinkOpener,
	) {
		super();

		this._webviewPanel = webview;
		this._resource = resource;

		switch (startingScroll?.type) {
			case 'line':
				if (!isNaN(startingScroll.line!)) {
					this._line = startingScroll.line;
				}
				break;

			case 'fragment':
				this._scrollToFragment = startingScroll.fragment;
				break;
		}

		this._register(_contributionProvider.onContributionsChanged(() => {
			setTimeout(() => this.refresh(true), 0);
		}));

		this._register(zycode.workspace.onDidChangeTextDocument(event => {
			if (this.isPreviewOf(event.document.uri)) {
				this.refresh();
			}
		}));

		this._register(zycode.workspace.onDidOpenTextDocument(document => {
			if (this.isPreviewOf(document.uri)) {
				this.refresh();
			}
		}));

		const watcher = this._register(zycode.workspace.createFileSystemWatcher(new zycode.RelativePattern(resource, '*')));
		this._register(watcher.onDidChange(uri => {
			if (this.isPreviewOf(uri)) {
				// Only use the file system event when VS Code does not already know about the file
				if (!zycode.workspace.textDocuments.some(doc => doc.uri.toString() === uri.toString())) {
					this.refresh();
				}
			}
		}));

		this._register(this._webviewPanel.webview.onDidReceiveMessage((e: FromWebviewMessage.Type) => {
			if (e.source !== this._resource.toString()) {
				return;
			}

			switch (e.type) {
				case 'cacheImageSizes':
					this._imageInfo = e.imageData;
					break;

				case 'revealLine':
					this._onDidScrollPreview(e.line);
					break;

				case 'didClick':
					this._onDidClickPreview(e.line);
					break;

				case 'openLink':
					this._onDidClickPreviewLink(e.href);
					break;

				case 'showPreviewSecuritySelector':
					zycode.commands.executeCommand('markdown.showPreviewSecuritySelector', e.source);
					break;

				case 'previewStyleLoadError':
					zycode.window.showWarningMessage(
						zycode.l10n.t("Could not load 'markdown.styles': {0}", e.unloadedStyles.join(', ')));
					break;
			}
		}));

		this.refresh();
	}

	override dispose() {
		this._disposeCts.cancel();

		super.dispose();

		this._disposed = true;

		clearTimeout(this._throttleTimer);
		for (const entry of this._fileWatchersBySrc.values()) {
			entry.dispose();
		}
		this._fileWatchersBySrc.clear();
	}

	public get resource(): zycode.Uri {
		return this._resource;
	}

	public get state() {
		return {
			resource: this._resource.toString(),
			line: this._line,
			fragment: this._scrollToFragment,
			...this._delegate.getAdditionalState(),
		};
	}

	/**
	 * The first call immediately refreshes the preview,
	 * calls happening shortly thereafter are debounced.
	*/
	public refresh(forceUpdate: boolean = false) {
		// Schedule update if none is pending
		if (!this._throttleTimer) {
			if (this._firstUpdate) {
				this._updatePreview(true);
			} else {
				this._throttleTimer = setTimeout(() => this._updatePreview(forceUpdate), this._delay);
			}
		}

		this._firstUpdate = false;
	}


	public isPreviewOf(resource: zycode.Uri): boolean {
		return this._resource.fsPath === resource.fsPath;
	}

	public postMessage(msg: ToWebviewMessage.Type) {
		if (!this._disposed) {
			this._webviewPanel.webview.postMessage(msg);
		}
	}

	public scrollTo(topLine: number) {
		if (this._disposed) {
			return;
		}

		if (this._isScrolling) {
			this._isScrolling = false;
			return;
		}

		this._logger.verbose('MarkdownPreview', 'updateForView', { markdownFile: this._resource });
		this._line = topLine;
		this.postMessage({
			type: 'updateView',
			line: topLine,
			source: this._resource.toString()
		});
	}

	private async _updatePreview(forceUpdate?: boolean): Promise<void> {
		clearTimeout(this._throttleTimer);
		this._throttleTimer = undefined;

		if (this._disposed) {
			return;
		}

		let document: zycode.TextDocument;
		try {
			document = await zycode.workspace.openTextDocument(this._resource);
		} catch {
			if (!this._disposed) {
				await this._showFileNotFoundError();
			}
			return;
		}

		if (this._disposed) {
			return;
		}

		const pendingVersion = new PreviewDocumentVersion(document);
		if (!forceUpdate && this._currentVersion?.equals(pendingVersion)) {
			if (this._line) {
				this.scrollTo(this._line);
			}
			return;
		}

		const shouldReloadPage = forceUpdate || !this._currentVersion || this._currentVersion.resource.toString() !== pendingVersion.resource.toString() || !this._webviewPanel.visible;
		this._currentVersion = pendingVersion;

		let selectedLine: number | undefined = undefined;
		for (const editor of zycode.window.visibleTextEditors) {
			if (this.isPreviewOf(editor.document.uri)) {
				selectedLine = editor.selection.active.line;
				break;
			}
		}

		const content = await (shouldReloadPage
			? this._contentProvider.renderDocument(document, this, this._previewConfigurations, this._line, selectedLine, this.state, this._imageInfo, this._disposeCts.token)
			: this._contentProvider.renderBody(document, this));

		// Another call to `doUpdate` may have happened.
		// Make sure we are still updating for the correct document
		if (this._currentVersion?.equals(pendingVersion)) {
			this._updateWebviewContent(content.html, shouldReloadPage);
			this._updateImageWatchers(content.containingImages);
		}
	}

	private _onDidScrollPreview(line: number) {
		this._line = line;
		this._onScrollEmitter.fire({ line: this._line, uri: this._resource });
		const config = this._previewConfigurations.loadAndCacheConfiguration(this._resource);
		if (!config.scrollEditorWithPreview) {
			return;
		}

		for (const editor of zycode.window.visibleTextEditors) {
			if (!this.isPreviewOf(editor.document.uri)) {
				continue;
			}

			this._isScrolling = true;
			scrollEditorToLine(line, editor);
		}
	}

	private async _onDidClickPreview(line: number): Promise<void> {
		// fix #82457, find currently opened but unfocused source tab
		await zycode.commands.executeCommand('markdown.showSource');

		const revealLineInEditor = (editor: zycode.TextEditor) => {
			const position = new zycode.Position(line, 0);
			const newSelection = new zycode.Selection(position, position);
			editor.selection = newSelection;
			editor.revealRange(newSelection, zycode.TextEditorRevealType.InCenterIfOutsideViewport);
		};

		for (const visibleEditor of zycode.window.visibleTextEditors) {
			if (this.isPreviewOf(visibleEditor.document.uri)) {
				const editor = await zycode.window.showTextDocument(visibleEditor.document, visibleEditor.viewColumn);
				revealLineInEditor(editor);
				return;
			}
		}

		await zycode.workspace.openTextDocument(this._resource)
			.then(zycode.window.showTextDocument)
			.then((editor) => {
				revealLineInEditor(editor);
			}, () => {
				zycode.window.showErrorMessage(zycode.l10n.t('Could not open {0}', this._resource.toString()));
			});
	}

	private async _showFileNotFoundError() {
		this._webviewPanel.webview.html = this._contentProvider.renderFileNotFoundDocument(this._resource);
	}

	private _updateWebviewContent(html: string, reloadPage: boolean): void {
		if (this._disposed) {
			return;
		}

		if (this._delegate.getTitle) {
			this._webviewPanel.title = this._delegate.getTitle(this._resource);
		}
		this._webviewPanel.webview.options = this._getWebviewOptions();

		if (reloadPage) {
			this._webviewPanel.webview.html = html;
		} else {
			this.postMessage({
				type: 'updateContent',
				content: html,
				source: this._resource.toString(),
			});
		}
	}

	private _updateImageWatchers(srcs: Set<string>) {
		// Delete stale file watchers.
		for (const [src, watcher] of this._fileWatchersBySrc) {
			if (!srcs.has(src)) {
				watcher.dispose();
				this._fileWatchersBySrc.delete(src);
			}
		}

		// Create new file watchers.
		const root = zycode.Uri.joinPath(this._resource, '../');
		for (const src of srcs) {
			const uri = urlToUri(src, root);
			if (uri && !MarkdownPreview._unwatchedImageSchemes.has(uri.scheme) && !this._fileWatchersBySrc.has(src)) {
				const watcher = zycode.workspace.createFileSystemWatcher(new zycode.RelativePattern(uri, '*'));
				watcher.onDidChange(() => {
					this.refresh(true);
				});
				this._fileWatchersBySrc.set(src, watcher);
			}
		}
	}

	private _getWebviewOptions(): zycode.WebviewOptions {
		return {
			enableScripts: true,
			enableForms: false,
			localResourceRoots: this._getLocalResourceRoots()
		};
	}

	private _getLocalResourceRoots(): ReadonlyArray<zycode.Uri> {
		const baseRoots = Array.from(this._contributionProvider.contributions.previewResourceRoots);

		const folder = zycode.workspace.getWorkspaceFolder(this._resource);
		if (folder) {
			const workspaceRoots = zycode.workspace.workspaceFolders?.map(folder => folder.uri);
			if (workspaceRoots) {
				baseRoots.push(...workspaceRoots);
			}
		} else {
			baseRoots.push(uri.Utils.dirname(this._resource));
		}

		return baseRoots;
	}

	private async _onDidClickPreviewLink(href: string) {
		const config = zycode.workspace.getConfiguration('markdown', this.resource);
		const openLinks = config.get<string>('preview.openMarkdownLinks', 'inPreview');
		if (openLinks === 'inPreview') {
			const resolved = await this._opener.resolveDocumentLink(href, this.resource);
			if (resolved.kind === 'file') {
				try {
					const doc = await zycode.workspace.openTextDocument(zycode.Uri.from(resolved.uri));
					if (isMarkdownFile(doc)) {
						return this._delegate.openPreviewLinkToMarkdownFile(doc.uri, resolved.fragment ? decodeURIComponent(resolved.fragment) : undefined);
					}
				} catch {
					// Noop
				}
			}
		}

		return this._opener.openDocumentLink(href, this.resource);
	}

	//#region WebviewResourceProvider

	asWebviewUri(resource: zycode.Uri) {
		return this._webviewPanel.webview.asWebviewUri(resource);
	}

	get cspSource() {
		return this._webviewPanel.webview.cspSource;
	}

	//#endregion
}

export interface IManagedMarkdownPreview {

	readonly resource: zycode.Uri;
	readonly resourceColumn: zycode.ViewColumn;

	readonly onDispose: zycode.Event<void>;
	readonly onDidChangeViewState: zycode.Event<zycode.WebviewPanelOnDidChangeViewStateEvent>;

	copyImage(id: string): void;
	dispose(): void;
	refresh(): void;
	updateConfiguration(): void;

	matchesResource(
		otherResource: zycode.Uri,
		otherPosition: zycode.ViewColumn | undefined,
		otherLocked: boolean
	): boolean;
}

export class StaticMarkdownPreview extends Disposable implements IManagedMarkdownPreview {

	public static readonly customEditorViewType = 'zycode.markdown.preview.editor';

	public static revive(
		resource: zycode.Uri,
		webview: zycode.WebviewPanel,
		contentProvider: MdDocumentRenderer,
		previewConfigurations: MarkdownPreviewConfigurationManager,
		topmostLineMonitor: TopmostLineMonitor,
		logger: ILogger,
		contributionProvider: MarkdownContributionProvider,
		opener: MdLinkOpener,
		scrollLine?: number,
	): StaticMarkdownPreview {
		return new StaticMarkdownPreview(webview, resource, contentProvider, previewConfigurations, topmostLineMonitor, logger, contributionProvider, opener, scrollLine);
	}

	private readonly _preview: MarkdownPreview;

	private constructor(
		private readonly _webviewPanel: zycode.WebviewPanel,
		resource: zycode.Uri,
		contentProvider: MdDocumentRenderer,
		private readonly _previewConfigurations: MarkdownPreviewConfigurationManager,
		topmostLineMonitor: TopmostLineMonitor,
		logger: ILogger,
		contributionProvider: MarkdownContributionProvider,
		opener: MdLinkOpener,
		scrollLine?: number,
	) {
		super();
		const topScrollLocation = scrollLine ? new StartingScrollLine(scrollLine) : undefined;
		this._preview = this._register(new MarkdownPreview(this._webviewPanel, resource, topScrollLocation, {
			getAdditionalState: () => { return {}; },
			openPreviewLinkToMarkdownFile: (markdownLink, fragment) => {
				return zycode.commands.executeCommand('zycode.openWith', markdownLink.with({
					fragment
				}), StaticMarkdownPreview.customEditorViewType, this._webviewPanel.viewColumn);
			}
		}, contentProvider, _previewConfigurations, logger, contributionProvider, opener));

		this._register(this._webviewPanel.onDidDispose(() => {
			this.dispose();
		}));

		this._register(this._webviewPanel.onDidChangeViewState(e => {
			this._onDidChangeViewState.fire(e);
		}));

		this._register(this._preview.onScroll((scrollInfo) => {
			topmostLineMonitor.setPreviousStaticEditorLine(scrollInfo);
		}));

		this._register(topmostLineMonitor.onDidChanged(event => {
			if (this._preview.isPreviewOf(event.resource)) {
				this._preview.scrollTo(event.line);
			}
		}));
	}

	copyImage(id: string) {
		this._webviewPanel.reveal();
		this._preview.postMessage({
			type: 'copyImage',
			source: this.resource.toString(),
			id: id
		});
	}

	private readonly _onDispose = this._register(new zycode.EventEmitter<void>());
	public readonly onDispose = this._onDispose.event;

	private readonly _onDidChangeViewState = this._register(new zycode.EventEmitter<zycode.WebviewPanelOnDidChangeViewStateEvent>());
	public readonly onDidChangeViewState = this._onDidChangeViewState.event;

	override dispose() {
		this._onDispose.fire();
		super.dispose();
	}

	public matchesResource(
		_otherResource: zycode.Uri,
		_otherPosition: zycode.ViewColumn | undefined,
		_otherLocked: boolean
	): boolean {
		return false;
	}

	public refresh() {
		this._preview.refresh(true);
	}

	public updateConfiguration() {
		if (this._previewConfigurations.hasConfigurationChanged(this._preview.resource)) {
			this.refresh();
		}
	}

	public get resource() {
		return this._preview.resource;
	}

	public get resourceColumn() {
		return this._webviewPanel.viewColumn || zycode.ViewColumn.One;
	}
}

interface DynamicPreviewInput {
	readonly resource: zycode.Uri;
	readonly resourceColumn: zycode.ViewColumn;
	readonly locked: boolean;
	readonly line?: number;
}

export class DynamicMarkdownPreview extends Disposable implements IManagedMarkdownPreview {

	public static readonly viewType = 'markdown.preview';

	private readonly _resourceColumn: zycode.ViewColumn;
	private _locked: boolean;

	private readonly _webviewPanel: zycode.WebviewPanel;
	private _preview: MarkdownPreview;

	public static revive(
		input: DynamicPreviewInput,
		webview: zycode.WebviewPanel,
		contentProvider: MdDocumentRenderer,
		previewConfigurations: MarkdownPreviewConfigurationManager,
		logger: ILogger,
		topmostLineMonitor: TopmostLineMonitor,
		contributionProvider: MarkdownContributionProvider,
		opener: MdLinkOpener,
	): DynamicMarkdownPreview {
		webview.iconPath = contentProvider.iconPath;

		return new DynamicMarkdownPreview(webview, input,
			contentProvider, previewConfigurations, logger, topmostLineMonitor, contributionProvider, opener);
	}

	public static create(
		input: DynamicPreviewInput,
		previewColumn: zycode.ViewColumn,
		contentProvider: MdDocumentRenderer,
		previewConfigurations: MarkdownPreviewConfigurationManager,
		logger: ILogger,
		topmostLineMonitor: TopmostLineMonitor,
		contributionProvider: MarkdownContributionProvider,
		opener: MdLinkOpener,
	): DynamicMarkdownPreview {
		const webview = zycode.window.createWebviewPanel(
			DynamicMarkdownPreview.viewType,
			DynamicMarkdownPreview._getPreviewTitle(input.resource, input.locked),
			previewColumn, { enableFindWidget: true, });

		webview.iconPath = contentProvider.iconPath;

		return new DynamicMarkdownPreview(webview, input,
			contentProvider, previewConfigurations, logger, topmostLineMonitor, contributionProvider, opener);
	}

	private constructor(
		webview: zycode.WebviewPanel,
		input: DynamicPreviewInput,
		private readonly _contentProvider: MdDocumentRenderer,
		private readonly _previewConfigurations: MarkdownPreviewConfigurationManager,
		private readonly _logger: ILogger,
		private readonly _topmostLineMonitor: TopmostLineMonitor,
		private readonly _contributionProvider: MarkdownContributionProvider,
		private readonly _opener: MdLinkOpener,
	) {
		super();

		this._webviewPanel = webview;

		this._resourceColumn = input.resourceColumn;
		this._locked = input.locked;

		this._preview = this._createPreview(input.resource, typeof input.line === 'number' ? new StartingScrollLine(input.line) : undefined);

		this._register(webview.onDidDispose(() => { this.dispose(); }));

		this._register(this._webviewPanel.onDidChangeViewState(e => {
			this._onDidChangeViewStateEmitter.fire(e);
		}));

		this._register(this._topmostLineMonitor.onDidChanged(event => {
			if (this._preview.isPreviewOf(event.resource)) {
				this._preview.scrollTo(event.line);
			}
		}));

		this._register(zycode.window.onDidChangeTextEditorSelection(event => {
			if (this._preview.isPreviewOf(event.textEditor.document.uri)) {
				this._preview.postMessage({
					type: 'onDidChangeTextEditorSelection',
					line: event.selections[0].active.line,
					source: this._preview.resource.toString()
				});
			}
		}));

		this._register(zycode.window.onDidChangeActiveTextEditor(editor => {
			// Only allow previewing normal text editors which have a viewColumn: See #101514
			if (typeof editor?.viewColumn === 'undefined') {
				return;
			}

			if (isMarkdownFile(editor.document) && !this._locked && !this._preview.isPreviewOf(editor.document.uri)) {
				const line = getVisibleLine(editor);
				this.update(editor.document.uri, line ? new StartingScrollLine(line) : undefined);
			}
		}));
	}

	copyImage(id: string) {
		this._webviewPanel.reveal();
		this._preview.postMessage({
			type: 'copyImage',
			source: this.resource.toString(),
			id: id
		});
	}

	private readonly _onDisposeEmitter = this._register(new zycode.EventEmitter<void>());
	public readonly onDispose = this._onDisposeEmitter.event;

	private readonly _onDidChangeViewStateEmitter = this._register(new zycode.EventEmitter<zycode.WebviewPanelOnDidChangeViewStateEvent>());
	public readonly onDidChangeViewState = this._onDidChangeViewStateEmitter.event;

	override dispose() {
		this._preview.dispose();
		this._webviewPanel.dispose();

		this._onDisposeEmitter.fire();
		this._onDisposeEmitter.dispose();
		super.dispose();
	}

	public get resource() {
		return this._preview.resource;
	}

	public get resourceColumn() {
		return this._resourceColumn;
	}

	public reveal(viewColumn: zycode.ViewColumn) {
		this._webviewPanel.reveal(viewColumn);
	}

	public refresh() {
		this._preview.refresh(true);
	}

	public updateConfiguration() {
		if (this._previewConfigurations.hasConfigurationChanged(this._preview.resource)) {
			this.refresh();
		}
	}

	public update(newResource: zycode.Uri, scrollLocation?: StartingScrollLocation) {
		if (this._preview.isPreviewOf(newResource)) {
			switch (scrollLocation?.type) {
				case 'line':
					this._preview.scrollTo(scrollLocation.line);
					return;

				case 'fragment':
					// Workaround. For fragments, just reload the entire preview
					break;

				default:
					return;
			}
		}

		this._preview.dispose();
		this._preview = this._createPreview(newResource, scrollLocation);
	}

	public toggleLock() {
		this._locked = !this._locked;
		this._webviewPanel.title = DynamicMarkdownPreview._getPreviewTitle(this._preview.resource, this._locked);
	}

	private static _getPreviewTitle(resource: zycode.Uri, locked: boolean): string {
		const resourceLabel = uri.Utils.basename(resource);
		return locked
			? zycode.l10n.t('[Preview] {0}', resourceLabel)
			: zycode.l10n.t('Preview {0}', resourceLabel);
	}

	public get position(): zycode.ViewColumn | undefined {
		return this._webviewPanel.viewColumn;
	}

	public matchesResource(
		otherResource: zycode.Uri,
		otherPosition: zycode.ViewColumn | undefined,
		otherLocked: boolean
	): boolean {
		if (this.position !== otherPosition) {
			return false;
		}

		if (this._locked) {
			return otherLocked && this._preview.isPreviewOf(otherResource);
		} else {
			return !otherLocked;
		}
	}

	public matches(otherPreview: DynamicMarkdownPreview): boolean {
		return this.matchesResource(otherPreview._preview.resource, otherPreview.position, otherPreview._locked);
	}

	private _createPreview(resource: zycode.Uri, startingScroll?: StartingScrollLocation): MarkdownPreview {
		return new MarkdownPreview(this._webviewPanel, resource, startingScroll, {
			getTitle: (resource) => DynamicMarkdownPreview._getPreviewTitle(resource, this._locked),
			getAdditionalState: () => {
				return {
					resourceColumn: this.resourceColumn,
					locked: this._locked,
				};
			},
			openPreviewLinkToMarkdownFile: (link: zycode.Uri, fragment?: string) => {
				this.update(link, fragment ? new StartingScrollFragment(fragment) : undefined);
			}
		},
			this._contentProvider,
			this._previewConfigurations,
			this._logger,
			this._contributionProvider,
			this._opener);
	}
}
