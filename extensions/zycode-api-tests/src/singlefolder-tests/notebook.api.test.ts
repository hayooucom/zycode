/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import { TextDecoder, TextEncoder } from 'util';
import * as zycode from 'zycode';
import { asPromise, assertNoRpc, closeAllEditors, createRandomFile, disposeAll, revertAllDirty, saveAllEditors } from '../utils';

async function createRandomNotebookFile() {
	return createRandomFile('', undefined, '.vsctestnb');
}

async function openRandomNotebookDocument() {
	const uri = await createRandomNotebookFile();
	return zycode.workspace.openNotebookDocument(uri);
}

export async function saveAllFilesAndCloseAll() {
	await saveAllEditors();
	await closeAllEditors();
}


function sleep(ms: number): Promise<void> {
	return new Promise(resolve => {
		setTimeout(resolve, ms);
	});
}

const notebookType = 'notebookCoreTest';

export class Kernel {

	readonly controller: zycode.NotebookController;

	readonly associatedNotebooks = new Set<string>();

	constructor(id: string, label: string, viewType: string = notebookType) {
		this.controller = zycode.notebooks.createNotebookController(id, viewType, label);
		this.controller.executeHandler = this._execute.bind(this);
		this.controller.supportsExecutionOrder = true;
		this.controller.supportedLanguages = ['typescript', 'javascript'];
		this.controller.onDidChangeSelectedNotebooks(e => {
			if (e.selected) {
				this.associatedNotebooks.add(e.notebook.uri.toString());
			} else {
				this.associatedNotebooks.delete(e.notebook.uri.toString());
			}
		});
	}

	protected async _execute(cells: zycode.NotebookCell[]): Promise<void> {
		for (const cell of cells) {
			await this._runCell(cell);
		}
	}

	protected async _runCell(cell: zycode.NotebookCell) {
		// create a single output with exec order 1 and output is plain/text
		// of either the cell itself or (iff empty) the cell's document's uri
		const task = this.controller.createNotebookCellExecution(cell);
		task.start(Date.now());
		task.executionOrder = 1;
		await sleep(10); // Force to be take some time
		await task.replaceOutput([new zycode.NotebookCellOutput([
			zycode.NotebookCellOutputItem.text(cell.document.getText() || cell.document.uri.toString(), 'text/plain')
		])]);
		task.end(true);
	}
}


function getFocusedCell(editor?: zycode.NotebookEditor) {
	return editor ? editor.notebook.cellAt(editor.selections[0].start) : undefined;
}

const apiTestSerializer: zycode.NotebookSerializer = {
	serializeNotebook(_data, _token) {
		return new Uint8Array();
	},
	deserializeNotebook(_content, _token) {
		const dto: zycode.NotebookData = {
			metadata: { custom: { testMetadata: false } },
			cells: [
				{
					value: 'test',
					languageId: 'typescript',
					kind: zycode.NotebookCellKind.Code,
					outputs: [],
					metadata: { custom: { testCellMetadata: 123 } },
					executionSummary: { timing: { startTime: 10, endTime: 20 } }
				},
				{
					value: 'test2',
					languageId: 'typescript',
					kind: zycode.NotebookCellKind.Code,
					outputs: [
						new zycode.NotebookCellOutput([
							zycode.NotebookCellOutputItem.text('Hello World', 'text/plain')
						],
							{
								testOutputMetadata: true,
								['text/plain']: { testOutputItemMetadata: true }
							})
					],
					executionSummary: { executionOrder: 5, success: true },
					metadata: { custom: { testCellMetadata: 456 } }
				}
			]
		};
		return dto;
	},
};

(zycode.env.uiKind === zycode.UIKind.Web ? suite.skip : suite)('Notebook API tests', function () {

	const testDisposables: zycode.Disposable[] = [];
	const suiteDisposables: zycode.Disposable[] = [];

	suiteTeardown(async function () {

		assertNoRpc();

		await revertAllDirty();
		await closeAllEditors();

		disposeAll(suiteDisposables);
		suiteDisposables.length = 0;
	});

	suiteSetup(function () {
		suiteDisposables.push(zycode.workspace.registerNotebookSerializer(notebookType, apiTestSerializer));
	});

	let defaultKernel: Kernel;

	setup(async function () {
		// there should be ONE default kernel in this suite
		defaultKernel = new Kernel('mainKernel', 'Notebook Default Kernel');
		testDisposables.push(defaultKernel.controller);
		await saveAllFilesAndCloseAll();
	});

	teardown(async function () {
		disposeAll(testDisposables);
		testDisposables.length = 0;
		await saveAllFilesAndCloseAll();
	});

	test('notebook open', async function () {
		const notebook = await openRandomNotebookDocument();
		const editor = await zycode.window.showNotebookDocument(notebook);
		assert.strictEqual(getFocusedCell(editor)?.document.getText(), 'test');
		assert.strictEqual(getFocusedCell(editor)?.document.languageId, 'typescript');

		const secondCell = editor.notebook.cellAt(1);
		assert.strictEqual(secondCell.outputs.length, 1);
		assert.deepStrictEqual(secondCell.outputs[0].metadata, { testOutputMetadata: true, ['text/plain']: { testOutputItemMetadata: true } });
		assert.strictEqual(secondCell.outputs[0].items.length, 1);
		assert.strictEqual(secondCell.outputs[0].items[0].mime, 'text/plain');
		assert.strictEqual(new TextDecoder().decode(secondCell.outputs[0].items[0].data), 'Hello World');
		assert.strictEqual(secondCell.executionSummary?.executionOrder, 5);
		assert.strictEqual(secondCell.executionSummary?.success, true);
	});

	test('multiple tabs: different editors with same document', async function () {
		const notebook = await openRandomNotebookDocument();
		const firstNotebookEditor = await zycode.window.showNotebookDocument(notebook, { viewColumn: zycode.ViewColumn.One });
		const secondNotebookEditor = await zycode.window.showNotebookDocument(notebook, { viewColumn: zycode.ViewColumn.Beside });
		assert.notStrictEqual(firstNotebookEditor, secondNotebookEditor);
		assert.strictEqual(firstNotebookEditor?.notebook, secondNotebookEditor?.notebook, 'split notebook editors share the same document');
	});

	test('#106657. Opening a notebook from markers view is broken ', async function () {

		const document = await openRandomNotebookDocument();
		const [cell] = document.getCells();

		assert.strictEqual(zycode.window.activeNotebookEditor, undefined);

		// opening a cell-uri opens a notebook editor
		await zycode.window.showTextDocument(cell.document, { viewColumn: zycode.ViewColumn.Active });

		assert.strictEqual(!!zycode.window.activeNotebookEditor, true);
		assert.strictEqual(zycode.window.activeNotebookEditor!.notebook.uri.toString(), document.uri.toString());
	});

	test('Cannot open notebook from cell-uri with zycode.open-command', async function () {

		const document = await openRandomNotebookDocument();
		const [cell] = document.getCells();

		await saveAllFilesAndCloseAll();
		assert.strictEqual(zycode.window.activeNotebookEditor, undefined);

		// BUG is that the editor opener (https://github.com/microsoft/zycode/blob/8e7877bdc442f1e83a7fec51920d82b696139129/src/vs/editor/browser/services/openerService.ts#L69)
		// removes the fragment if it matches something numeric. For notebooks that's not wanted...
		// opening a cell-uri opens a notebook editor
		await zycode.commands.executeCommand('zycode.open', cell.document.uri);

		assert.strictEqual(zycode.window.activeNotebookEditor!.notebook.uri.toString(), document.uri.toString());
	});

	test('#97830, #97764. Support switch to other editor types', async function () {
		const notebook = await openRandomNotebookDocument();
		const editor = await zycode.window.showNotebookDocument(notebook);
		const edit = new zycode.WorkspaceEdit();
		const focusedCell = getFocusedCell(editor);
		assert.ok(focusedCell);
		edit.replace(focusedCell.document.uri, focusedCell.document.lineAt(0).range, 'var abc = 0;');
		await zycode.workspace.applyEdit(edit);

		assert.strictEqual(getFocusedCell(editor)?.document.getText(), 'var abc = 0;');

		// no kernel -> no default language
		assert.strictEqual(getFocusedCell(editor)?.document.languageId, 'typescript');

		await zycode.commands.executeCommand('zycode.openWith', notebook.uri, 'default');
		assert.strictEqual(zycode.window.activeTextEditor?.document.uri.path, notebook.uri.path);
	});

	test('#102411 - untitled notebook creation failed', async function () {
		const document = await zycode.workspace.openNotebookDocument(notebookType, undefined);
		await zycode.window.showNotebookDocument(document);
		assert.notStrictEqual(zycode.window.activeNotebookEditor, undefined, 'untitled notebook editor is not undefined');

		await closeAllEditors();
	});

	// TODO: Skipped due to notebook content provider removal
	test.skip('#115855 onDidSaveNotebookDocument', async function () {
		const resource = await createRandomNotebookFile();
		const notebook = await zycode.workspace.openNotebookDocument(resource);

		const notebookEdit = new zycode.NotebookEdit(new zycode.NotebookRange(1, 1), [new zycode.NotebookCellData(zycode.NotebookCellKind.Code, 'test 2', 'javascript')]);
		const edit = new zycode.WorkspaceEdit();
		edit.set(notebook.uri, [notebookEdit]);
		await zycode.workspace.applyEdit(edit);
		assert.strictEqual(notebook.isDirty, true);

		const saveEvent = asPromise(zycode.workspace.onDidSaveNotebookDocument);
		await notebook.save();
		await saveEvent;

		assert.strictEqual(notebook.isDirty, false);
	});
});

suite('Notebook & LiveShare', function () {

	const suiteDisposables: zycode.Disposable[] = [];
	const notebookType = 'vsls-testing';

	suiteTeardown(() => {
		zycode.Disposable.from(...suiteDisposables).dispose();
	});

	suiteSetup(function () {

		suiteDisposables.push(zycode.workspace.registerNotebookSerializer(notebookType, new class implements zycode.NotebookSerializer {
			deserializeNotebook(content: Uint8Array, _token: zycode.CancellationToken): zycode.NotebookData | Thenable<zycode.NotebookData> {
				const value = new TextDecoder().decode(content);
				const cell1 = new zycode.NotebookCellData(zycode.NotebookCellKind.Code, value, 'fooLang');
				cell1.outputs = [new zycode.NotebookCellOutput([zycode.NotebookCellOutputItem.stderr(value)])];
				return new zycode.NotebookData([cell1]);
			}
			serializeNotebook(data: zycode.NotebookData, _token: zycode.CancellationToken): Uint8Array | Thenable<Uint8Array> {
				return new TextEncoder().encode(data.cells[0].value);
			}
		}, {}, {
			displayName: 'LS',
			filenamePattern: ['*'],
		}));
	});

	test('command: zycode.resolveNotebookContentProviders', async function () {

		type Info = { viewType: string; displayName: string; filenamePattern: string[] };

		const info = await zycode.commands.executeCommand<Info[]>('zycode.resolveNotebookContentProviders');
		assert.strictEqual(Array.isArray(info), true);

		const item = info.find(item => item.viewType === notebookType);
		assert.ok(item);
		assert.strictEqual(item?.viewType, notebookType);
	});

	test('command: zycode.executeDataToNotebook', async function () {
		const value = 'dataToNotebook';
		const data = await zycode.commands.executeCommand<zycode.NotebookData>('zycode.executeDataToNotebook', notebookType, new TextEncoder().encode(value));
		assert.ok(data instanceof zycode.NotebookData);
		assert.strictEqual(data.cells.length, 1);
		assert.strictEqual(data.cells[0].value, value);
		assert.strictEqual(new TextDecoder().decode(data.cells[0].outputs![0].items[0].data), value);
	});

	test('command: zycode.executeNotebookToData', async function () {
		const value = 'notebookToData';
		const notebook = new zycode.NotebookData([new zycode.NotebookCellData(zycode.NotebookCellKind.Code, value, 'fooLang')]);
		const data = await zycode.commands.executeCommand<Uint8Array>('zycode.executeNotebookToData', notebookType, notebook);
		assert.ok(data instanceof Uint8Array);
		assert.deepStrictEqual(new TextDecoder().decode(data), value);
	});
});
