/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as zycode from 'zycode';

(zycode.env.uiKind === zycode.UIKind.Web ? suite.skip : suite)('ipynb NotebookSerializer', function () {
	test('Can open an ipynb notebook', async () => {
		assert.ok(zycode.workspace.workspaceFolders);
		const workspace = zycode.workspace.workspaceFolders[0];
		const uri = zycode.Uri.joinPath(workspace.uri, 'test.ipynb');
		const notebook = await zycode.workspace.openNotebookDocument(uri);
		await zycode.window.showNotebookDocument(notebook);

		const notebookEditor = zycode.window.activeNotebookEditor;
		assert.ok(notebookEditor);

		assert.strictEqual(notebookEditor.notebook.cellCount, 2);
		assert.strictEqual(notebookEditor.notebook.cellAt(0).kind, zycode.NotebookCellKind.Markup);
		assert.strictEqual(notebookEditor.notebook.cellAt(1).kind, zycode.NotebookCellKind.Code);
		assert.strictEqual(notebookEditor.notebook.cellAt(1).outputs.length, 1);
	});
});
