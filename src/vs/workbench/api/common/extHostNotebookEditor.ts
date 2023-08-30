/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { illegalArgument } from 'vs/base/common/errors';
import { MainThreadNotebookEditorsShape } from 'vs/workbench/api/common/extHost.protocol';
import * as extHostConverter from 'vs/workbench/api/common/extHostTypeConverters';
import * as extHostTypes from 'vs/workbench/api/common/extHostTypes';
import * as zycode from 'zycode';
import { ExtHostNotebookDocument } from './extHostNotebookDocument';

export class ExtHostNotebookEditor {

	public static readonly apiEditorsToExtHost = new WeakMap<zycode.NotebookEditor, ExtHostNotebookEditor>();

	private _selections: zycode.NotebookRange[] = [];
	private _visibleRanges: zycode.NotebookRange[] = [];
	private _viewColumn?: zycode.ViewColumn;

	private _visible: boolean = false;

	private _editor?: zycode.NotebookEditor;

	constructor(
		readonly id: string,
		private readonly _proxy: MainThreadNotebookEditorsShape,
		readonly notebookData: ExtHostNotebookDocument,
		visibleRanges: zycode.NotebookRange[],
		selections: zycode.NotebookRange[],
		viewColumn: zycode.ViewColumn | undefined
	) {
		this._selections = selections;
		this._visibleRanges = visibleRanges;
		this._viewColumn = viewColumn;
	}

	get apiEditor(): zycode.NotebookEditor {
		if (!this._editor) {
			const that = this;
			this._editor = {
				get notebook() {
					return that.notebookData.apiNotebook;
				},
				get selection() {
					return that._selections[0];
				},
				set selection(selection: zycode.NotebookRange) {
					this.selections = [selection];
				},
				get selections() {
					return that._selections;
				},
				set selections(value: zycode.NotebookRange[]) {
					if (!Array.isArray(value) || !value.every(extHostTypes.NotebookRange.isNotebookRange)) {
						throw illegalArgument('selections');
					}
					that._selections = value;
					that._trySetSelections(value);
				},
				get visibleRanges() {
					return that._visibleRanges;
				},
				revealRange(range, revealType) {
					that._proxy.$tryRevealRange(
						that.id,
						extHostConverter.NotebookRange.from(range),
						revealType ?? extHostTypes.NotebookEditorRevealType.Default
					);
				},
				get viewColumn() {
					return that._viewColumn;
				},
			};

			ExtHostNotebookEditor.apiEditorsToExtHost.set(this._editor, this);
		}
		return this._editor;
	}

	get visible(): boolean {
		return this._visible;
	}

	_acceptVisibility(value: boolean) {
		this._visible = value;
	}

	_acceptVisibleRanges(value: zycode.NotebookRange[]): void {
		this._visibleRanges = value;
	}

	_acceptSelections(selections: zycode.NotebookRange[]): void {
		this._selections = selections;
	}

	private _trySetSelections(value: zycode.NotebookRange[]): void {
		this._proxy.$trySetSelections(this.id, value.map(extHostConverter.NotebookRange.from));
	}

	_acceptViewColumn(value: zycode.ViewColumn | undefined) {
		this._viewColumn = value;
	}
}
