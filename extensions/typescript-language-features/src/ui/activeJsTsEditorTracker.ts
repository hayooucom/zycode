/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import { isJsConfigOrTsConfigFileName } from '../configuration/languageDescription';
import { isSupportedLanguageMode } from '../configuration/languageIds';
import { Disposable } from '../utils/dispose';

/**
 * Tracks the active JS/TS editor.
 *
 * This tries to handle the case where the user focuses in the output view / debug console.
 * When this happens, we want to treat the last real focused editor as the active editor,
 * instead of using `zycode.window.activeTextEditor`
 */
export class ActiveJsTsEditorTracker extends Disposable {

	private _activeJsTsEditor: zycode.TextEditor | undefined;

	private readonly _onDidChangeActiveJsTsEditor = this._register(new zycode.EventEmitter<zycode.TextEditor | undefined>());
	public readonly onDidChangeActiveJsTsEditor = this._onDidChangeActiveJsTsEditor.event;

	public constructor() {
		super();
		zycode.window.onDidChangeActiveTextEditor(this.onDidChangeActiveTextEditor, this, this._disposables);
		zycode.window.onDidChangeVisibleTextEditors(() => {
			// Make sure the active editor is still in the visible set.
			// This can happen if the output view is focused and the last active TS file is closed
			if (this._activeJsTsEditor) {
				if (!zycode.window.visibleTextEditors.some(visibleEditor => visibleEditor === this._activeJsTsEditor)) {
					this.onDidChangeActiveTextEditor(undefined);
				}
			}
		}, this, this._disposables);

		this.onDidChangeActiveTextEditor(zycode.window.activeTextEditor);
	}

	public get activeJsTsEditor(): zycode.TextEditor | undefined {
		return this._activeJsTsEditor;
	}

	private onDidChangeActiveTextEditor(editor: zycode.TextEditor | undefined): any {
		if (editor === this._activeJsTsEditor) {
			return;
		}

		if (editor && !editor.viewColumn) {
			// viewColumn is undefined for the debug/output panel, but we still want
			// to show the version info for the previous editor
			return;
		}

		if (editor && this.isManagedFile(editor)) {
			this._activeJsTsEditor = editor;
		} else {
			this._activeJsTsEditor = undefined;
		}
		this._onDidChangeActiveJsTsEditor.fire(this._activeJsTsEditor);
	}

	private isManagedFile(editor: zycode.TextEditor): boolean {
		return this.isManagedScriptFile(editor) || this.isManagedConfigFile(editor);
	}

	private isManagedScriptFile(editor: zycode.TextEditor): boolean {
		return isSupportedLanguageMode(editor.document);
	}

	private isManagedConfigFile(editor: zycode.TextEditor): boolean {
		return isJsConfigOrTsConfigFileName(editor.document.fileName);
	}
}
