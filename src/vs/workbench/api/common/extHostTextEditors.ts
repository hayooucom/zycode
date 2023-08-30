/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as arrays from 'vs/base/common/arrays';
import { onUnexpectedExternalError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ExtHostEditorsShape, IEditorPropertiesChangeData, IMainContext, ITextDocumentShowOptions, ITextEditorPositionData, MainContext, MainThreadTextEditorsShape } from 'vs/workbench/api/common/extHost.protocol';
import { ExtHostDocumentsAndEditors } from 'vs/workbench/api/common/extHostDocumentsAndEditors';
import { ExtHostTextEditor, TextEditorDecorationType } from 'vs/workbench/api/common/extHostTextEditor';
import * as TypeConverters from 'vs/workbench/api/common/extHostTypeConverters';
import { TextEditorSelectionChangeKind } from 'vs/workbench/api/common/extHostTypes';
import * as zycode from 'zycode';

export class ExtHostEditors implements ExtHostEditorsShape {

	private readonly _onDidChangeTextEditorSelection = new Emitter<zycode.TextEditorSelectionChangeEvent>({ onListenerError: onUnexpectedExternalError });
	private readonly _onDidChangeTextEditorOptions = new Emitter<zycode.TextEditorOptionsChangeEvent>({ onListenerError: onUnexpectedExternalError });
	private readonly _onDidChangeTextEditorVisibleRanges = new Emitter<zycode.TextEditorVisibleRangesChangeEvent>({ onListenerError: onUnexpectedExternalError });
	private readonly _onDidChangeTextEditorViewColumn = new Emitter<zycode.TextEditorViewColumnChangeEvent>({ onListenerError: onUnexpectedExternalError });
	private readonly _onDidChangeActiveTextEditor = new Emitter<zycode.TextEditor | undefined>({ onListenerError: onUnexpectedExternalError });
	private readonly _onDidChangeVisibleTextEditors = new Emitter<readonly zycode.TextEditor[]>({ onListenerError: onUnexpectedExternalError });

	readonly onDidChangeTextEditorSelection: Event<zycode.TextEditorSelectionChangeEvent> = this._onDidChangeTextEditorSelection.event;
	readonly onDidChangeTextEditorOptions: Event<zycode.TextEditorOptionsChangeEvent> = this._onDidChangeTextEditorOptions.event;
	readonly onDidChangeTextEditorVisibleRanges: Event<zycode.TextEditorVisibleRangesChangeEvent> = this._onDidChangeTextEditorVisibleRanges.event;
	readonly onDidChangeTextEditorViewColumn: Event<zycode.TextEditorViewColumnChangeEvent> = this._onDidChangeTextEditorViewColumn.event;
	readonly onDidChangeActiveTextEditor: Event<zycode.TextEditor | undefined> = this._onDidChangeActiveTextEditor.event;
	readonly onDidChangeVisibleTextEditors: Event<readonly zycode.TextEditor[]> = this._onDidChangeVisibleTextEditors.event;

	private readonly _proxy: MainThreadTextEditorsShape;

	constructor(
		mainContext: IMainContext,
		private readonly _extHostDocumentsAndEditors: ExtHostDocumentsAndEditors,
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadTextEditors);


		this._extHostDocumentsAndEditors.onDidChangeVisibleTextEditors(e => this._onDidChangeVisibleTextEditors.fire(e));
		this._extHostDocumentsAndEditors.onDidChangeActiveTextEditor(e => this._onDidChangeActiveTextEditor.fire(e));
	}

	getActiveTextEditor(): zycode.TextEditor | undefined {
		return this._extHostDocumentsAndEditors.activeEditor();
	}

	getVisibleTextEditors(): zycode.TextEditor[];
	getVisibleTextEditors(internal: true): ExtHostTextEditor[];
	getVisibleTextEditors(internal?: true): ExtHostTextEditor[] | zycode.TextEditor[] {
		const editors = this._extHostDocumentsAndEditors.allEditors();
		return internal
			? editors
			: editors.map(editor => editor.value);
	}

	showTextDocument(document: zycode.TextDocument, column: zycode.ViewColumn, preserveFocus: boolean): Promise<zycode.TextEditor>;
	showTextDocument(document: zycode.TextDocument, options: { column: zycode.ViewColumn; preserveFocus: boolean; pinned: boolean }): Promise<zycode.TextEditor>;
	showTextDocument(document: zycode.TextDocument, columnOrOptions: zycode.ViewColumn | zycode.TextDocumentShowOptions | undefined, preserveFocus?: boolean): Promise<zycode.TextEditor>;
	async showTextDocument(document: zycode.TextDocument, columnOrOptions: zycode.ViewColumn | zycode.TextDocumentShowOptions | undefined, preserveFocus?: boolean): Promise<zycode.TextEditor> {
		let options: ITextDocumentShowOptions;
		if (typeof columnOrOptions === 'number') {
			options = {
				position: TypeConverters.ViewColumn.from(columnOrOptions),
				preserveFocus
			};
		} else if (typeof columnOrOptions === 'object') {
			options = {
				position: TypeConverters.ViewColumn.from(columnOrOptions.viewColumn),
				preserveFocus: columnOrOptions.preserveFocus,
				selection: typeof columnOrOptions.selection === 'object' ? TypeConverters.Range.from(columnOrOptions.selection) : undefined,
				pinned: typeof columnOrOptions.preview === 'boolean' ? !columnOrOptions.preview : undefined
			};
		} else {
			options = {
				preserveFocus: false
			};
		}

		const editorId = await this._proxy.$tryShowTextDocument(document.uri, options);
		const editor = editorId && this._extHostDocumentsAndEditors.getEditor(editorId);
		if (editor) {
			return editor.value;
		}
		// we have no editor... having an id means that we had an editor
		// on the main side and that it isn't the current editor anymore...
		if (editorId) {
			throw new Error(`Could NOT open editor for "${document.uri.toString()}" because another editor opened in the meantime.`);
		} else {
			throw new Error(`Could NOT open editor for "${document.uri.toString()}".`);
		}
	}

	createTextEditorDecorationType(extension: IExtensionDescription, options: zycode.DecorationRenderOptions): zycode.TextEditorDecorationType {
		return new TextEditorDecorationType(this._proxy, extension, options).value;
	}

	// --- called from main thread

	$acceptEditorPropertiesChanged(id: string, data: IEditorPropertiesChangeData): void {
		const textEditor = this._extHostDocumentsAndEditors.getEditor(id);
		if (!textEditor) {
			throw new Error('unknown text editor');
		}

		// (1) set all properties
		if (data.options) {
			textEditor._acceptOptions(data.options);
		}
		if (data.selections) {
			const selections = data.selections.selections.map(TypeConverters.Selection.to);
			textEditor._acceptSelections(selections);
		}
		if (data.visibleRanges) {
			const visibleRanges = arrays.coalesce(data.visibleRanges.map(TypeConverters.Range.to));
			textEditor._acceptVisibleRanges(visibleRanges);
		}

		// (2) fire change events
		if (data.options) {
			this._onDidChangeTextEditorOptions.fire({
				textEditor: textEditor.value,
				options: { ...data.options, lineNumbers: TypeConverters.TextEditorLineNumbersStyle.to(data.options.lineNumbers) }
			});
		}
		if (data.selections) {
			const kind = TextEditorSelectionChangeKind.fromValue(data.selections.source);
			const selections = data.selections.selections.map(TypeConverters.Selection.to);
			this._onDidChangeTextEditorSelection.fire({
				textEditor: textEditor.value,
				selections,
				kind
			});
		}
		if (data.visibleRanges) {
			const visibleRanges = arrays.coalesce(data.visibleRanges.map(TypeConverters.Range.to));
			this._onDidChangeTextEditorVisibleRanges.fire({
				textEditor: textEditor.value,
				visibleRanges
			});
		}
	}

	$acceptEditorPositionData(data: ITextEditorPositionData): void {
		for (const id in data) {
			const textEditor = this._extHostDocumentsAndEditors.getEditor(id);
			if (!textEditor) {
				throw new Error('Unknown text editor');
			}
			const viewColumn = TypeConverters.ViewColumn.to(data[id]);
			if (textEditor.value.viewColumn !== viewColumn) {
				textEditor._acceptViewColumn(viewColumn);
				this._onDidChangeTextEditorViewColumn.fire({ textEditor: textEditor.value, viewColumn });
			}
		}
	}

	getDiffInformation(id: string): Promise<zycode.LineChange[]> {
		return Promise.resolve(this._proxy.$getDiffInformation(id));
	}
}
