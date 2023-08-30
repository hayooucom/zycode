/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import { assertNoRpc, assertNoRpcFromEntry, disposeAll } from '../utils';

suite('zycode', function () {

	const dispo: zycode.Disposable[] = [];

	teardown(() => {
		assertNoRpc();
		disposeAll(dispo);
	});

	test('no rpc', function () {
		assertNoRpc();
	});

	test('no rpc, createDiagnosticCollection()', function () {
		const item = zycode.languages.createDiagnosticCollection();
		dispo.push(item);
		assertNoRpcFromEntry([item, 'DiagnosticCollection']);
	});

	test('no rpc, createTextEditorDecorationType(...)', function () {
		const item = zycode.window.createTextEditorDecorationType({});
		dispo.push(item);
		assertNoRpcFromEntry([item, 'TextEditorDecorationType']);
	});

	test('no rpc, createOutputChannel(...)', function () {
		const item = zycode.window.createOutputChannel('hello');
		dispo.push(item);
		assertNoRpcFromEntry([item, 'OutputChannel']);
	});

	test('no rpc, createDiagnosticCollection(...)', function () {
		const item = zycode.languages.createDiagnosticCollection();
		dispo.push(item);
		assertNoRpcFromEntry([item, 'DiagnosticCollection']);
	});

	test('no rpc, createQuickPick(...)', function () {
		const item = zycode.window.createQuickPick();
		dispo.push(item);
		assertNoRpcFromEntry([item, 'QuickPick']);
	});

	test('no rpc, createInputBox(...)', function () {
		const item = zycode.window.createInputBox();
		dispo.push(item);
		assertNoRpcFromEntry([item, 'InputBox']);
	});

	test('no rpc, createStatusBarItem(...)', function () {
		const item = zycode.window.createStatusBarItem();
		dispo.push(item);
		assertNoRpcFromEntry([item, 'StatusBarItem']);
	});

	test('no rpc, createSourceControl(...)', function () {
		const item = zycode.scm.createSourceControl('foo', 'Hello');
		dispo.push(item);
		assertNoRpcFromEntry([item, 'SourceControl']);
	});

	test('no rpc, createCommentController(...)', function () {
		const item = zycode.comments.createCommentController('foo', 'Hello');
		dispo.push(item);
		assertNoRpcFromEntry([item, 'CommentController']);
	});

	test('no rpc, createWebviewPanel(...)', function () {
		const item = zycode.window.createWebviewPanel('webview', 'Hello', zycode.ViewColumn.Active);
		dispo.push(item);
		assertNoRpcFromEntry([item, 'WebviewPanel']);
	});

	test('no rpc, createTreeView(...)', function () {
		const treeDataProvider = new class implements zycode.TreeDataProvider<string> {
			getTreeItem(element: string): zycode.TreeItem | Thenable<zycode.TreeItem> {
				return new zycode.TreeItem(element);
			}
			getChildren(_element?: string): zycode.ProviderResult<string[]> {
				return ['foo', 'bar'];
			}
		};
		const item = zycode.window.createTreeView('test.treeId', { treeDataProvider });
		dispo.push(item);
		assertNoRpcFromEntry([item, 'TreeView']);
	});


	test('no rpc, createNotebookController(...)', function () {
		const ctrl = zycode.notebooks.createNotebookController('foo', 'bar', '');
		dispo.push(ctrl);
		assertNoRpcFromEntry([ctrl, 'NotebookController']);
	});

	test('no rpc, createTerminal(...)', function () {
		const ctrl = zycode.window.createTerminal({ name: 'termi' });
		dispo.push(ctrl);
		assertNoRpcFromEntry([ctrl, 'Terminal']);
	});

	test('no rpc, createFileSystemWatcher(...)', function () {
		const item = zycode.workspace.createFileSystemWatcher('**/*.ts');
		dispo.push(item);
		assertNoRpcFromEntry([item, 'FileSystemWatcher']);
	});

	test('no rpc, createTestController(...)', function () {
		const item = zycode.tests.createTestController('iii', 'lll');
		dispo.push(item);
		assertNoRpcFromEntry([item, 'TestController']);
	});

	test('no rpc, createLanguageStatusItem(...)', function () {
		const item = zycode.languages.createLanguageStatusItem('i', '*');
		dispo.push(item);
		assertNoRpcFromEntry([item, 'LanguageStatusItem']);
	});
});
