/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as zycode from 'zycode';
import * as utils from '../utils';

(zycode.env.uiKind === zycode.UIKind.Web ? suite.skip : suite.skip)('Notebook Editor', function () {

	const contentSerializer = new class implements zycode.NotebookSerializer {
		deserializeNotebook() {
			return new zycode.NotebookData(
				[new zycode.NotebookCellData(zycode.NotebookCellKind.Code, '// code cell', 'javascript')],
			);
		}
		serializeNotebook() {
			return new Uint8Array();
		}
	};

	const onDidOpenNotebookEditor = (timeout = zycode.env.uiKind === zycode.UIKind.Desktop ? 5000 : 15000) => {
		return new Promise<boolean>((resolve, reject) => {

			const handle = setTimeout(() => {
				sub.dispose();
				reject(new Error('onDidOpenNotebookEditor TIMEOUT reached'));
			}, timeout);

			const sub = zycode.window.onDidChangeActiveNotebookEditor(() => {
				if (zycode.window.activeNotebookEditor === undefined) {
					// skip if there is no active notebook editor (e.g. when opening a new notebook)
					return;
				}

				clearTimeout(handle);
				sub.dispose();
				resolve(true);
			});
		});
	};

	const disposables: zycode.Disposable[] = [];
	const testDisposables: zycode.Disposable[] = [];

	suiteTeardown(async function () {
		utils.assertNoRpc();
		await utils.revertAllDirty();
		await utils.closeAllEditors();
		utils.disposeAll(disposables);
		disposables.length = 0;

		for (const doc of zycode.workspace.notebookDocuments) {
			assert.strictEqual(doc.isDirty, false, doc.uri.toString());
		}
	});

	suiteSetup(function () {
		disposables.push(zycode.workspace.registerNotebookSerializer('notebook.nbdtest', contentSerializer));
	});

	teardown(async function () {
		utils.disposeAll(testDisposables);
		testDisposables.length = 0;
	});

	// #138683
	// TODO@rebornix https://github.com/microsoft/zycode/issues/170072
	test.skip('Opening a notebook should fire activeNotebook event changed only once', utils.withVerboseLogs(async function () {
		const openedEditor = onDidOpenNotebookEditor();
		const resource = await utils.createRandomFile(undefined, undefined, '.nbdtest');
		const document = await zycode.workspace.openNotebookDocument(resource);
		const editor = await zycode.window.showNotebookDocument(document);
		assert.ok(await openedEditor);
		assert.strictEqual(editor.notebook.uri.toString(), resource.toString());
	}));

	// TODO@rebornix https://github.com/microsoft/zycode/issues/173125
	test.skip('Active/Visible Editor', async function () {
		const firstEditorOpen = onDidOpenNotebookEditor();
		const resource = await utils.createRandomFile(undefined, undefined, '.nbdtest');
		const document = await zycode.workspace.openNotebookDocument(resource);

		const firstEditor = await zycode.window.showNotebookDocument(document);
		await firstEditorOpen;
		assert.strictEqual(zycode.window.activeNotebookEditor, firstEditor);
		assert.strictEqual(zycode.window.visibleNotebookEditors.includes(firstEditor), true);

		const secondEditor = await zycode.window.showNotebookDocument(document, { viewColumn: zycode.ViewColumn.Beside });
		// There is no guarantee that when `showNotebookDocument` resolves, the active notebook editor is already updated correctly.
		// assert.strictEqual(secondEditor === zycode.window.activeNotebookEditor, true);
		assert.notStrictEqual(firstEditor, secondEditor);
		assert.strictEqual(zycode.window.visibleNotebookEditors.includes(secondEditor), true);
		assert.strictEqual(zycode.window.visibleNotebookEditors.includes(firstEditor), true);
		assert.strictEqual(zycode.window.visibleNotebookEditors.length, 2);
		await utils.closeAllEditors();
	});

	test('Notebook Editor Event - onDidChangeVisibleNotebookEditors on open/close', async function () {
		const openedEditor = utils.asPromise(zycode.window.onDidChangeVisibleNotebookEditors);
		const resource = await utils.createRandomFile(undefined, undefined, '.nbdtest');
		const document = await zycode.workspace.openNotebookDocument(resource);
		await zycode.window.showNotebookDocument(document);
		assert.ok(await openedEditor);

		const firstEditorClose = utils.asPromise(zycode.window.onDidChangeVisibleNotebookEditors);
		await utils.closeAllEditors();
		await firstEditorClose;
	});

	test('Notebook Editor Event - onDidChangeVisibleNotebookEditors on two editor groups', async function () {
		const resource = await utils.createRandomFile(undefined, undefined, '.nbdtest');
		const document = await zycode.workspace.openNotebookDocument(resource);

		let count = 0;
		testDisposables.push(zycode.window.onDidChangeVisibleNotebookEditors(() => {
			count = zycode.window.visibleNotebookEditors.length;
		}));

		await zycode.window.showNotebookDocument(document, { viewColumn: zycode.ViewColumn.Active });
		assert.strictEqual(count, 1);

		await zycode.window.showNotebookDocument(document, { viewColumn: zycode.ViewColumn.Beside });
		assert.strictEqual(count, 2);

		await utils.closeAllEditors();
		assert.strictEqual(count, 0);
	});
});
