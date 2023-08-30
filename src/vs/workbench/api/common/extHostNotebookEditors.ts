/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedExternalError } from 'vs/base/common/errors';
import { Emitter } from 'vs/base/common/event';
import { ILogService } from 'vs/platform/log/common/log';
import { ExtHostNotebookEditorsShape, INotebookEditorPropertiesChangeData, INotebookEditorViewColumnInfo } from 'vs/workbench/api/common/extHost.protocol';
import { ExtHostNotebookController } from 'vs/workbench/api/common/extHostNotebook';
import * as typeConverters from 'vs/workbench/api/common/extHostTypeConverters';
import type * as zycode from 'zycode';


export class ExtHostNotebookEditors implements ExtHostNotebookEditorsShape {

	private readonly _onDidChangeNotebookEditorSelection = new Emitter<zycode.NotebookEditorSelectionChangeEvent>({ onListenerError: onUnexpectedExternalError });
	private readonly _onDidChangeNotebookEditorVisibleRanges = new Emitter<zycode.NotebookEditorVisibleRangesChangeEvent>({ onListenerError: onUnexpectedExternalError });

	readonly onDidChangeNotebookEditorSelection = this._onDidChangeNotebookEditorSelection.event;
	readonly onDidChangeNotebookEditorVisibleRanges = this._onDidChangeNotebookEditorVisibleRanges.event;

	constructor(
		@ILogService private readonly _logService: ILogService,
		private readonly _notebooksAndEditors: ExtHostNotebookController,
	) { }

	$acceptEditorPropertiesChanged(id: string, data: INotebookEditorPropertiesChangeData): void {
		this._logService.debug('ExtHostNotebook#$acceptEditorPropertiesChanged', id, data);
		const editor = this._notebooksAndEditors.getEditorById(id);
		// ONE: make all state updates
		if (data.visibleRanges) {
			editor._acceptVisibleRanges(data.visibleRanges.ranges.map(typeConverters.NotebookRange.to));
		}
		if (data.selections) {
			editor._acceptSelections(data.selections.selections.map(typeConverters.NotebookRange.to));
		}

		// TWO: send all events after states have been updated
		if (data.visibleRanges) {
			this._onDidChangeNotebookEditorVisibleRanges.fire({
				notebookEditor: editor.apiEditor,
				visibleRanges: editor.apiEditor.visibleRanges
			});
		}
		if (data.selections) {
			this._onDidChangeNotebookEditorSelection.fire(Object.freeze({
				notebookEditor: editor.apiEditor,
				selections: editor.apiEditor.selections
			}));
		}
	}

	$acceptEditorViewColumns(data: INotebookEditorViewColumnInfo): void {
		for (const id in data) {
			const editor = this._notebooksAndEditors.getEditorById(id);
			editor._acceptViewColumn(typeConverters.ViewColumn.to(data[id]));
		}
	}
}
