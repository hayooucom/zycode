/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { join } from 'path';
import * as zycode from 'zycode';
import { assertNoRpc, createRandomFile, testFs } from '../utils';

suite('zycode API - languages', () => {

	teardown(assertNoRpc);

	const isWindows = process.platform === 'win32';

	function positionToString(p: zycode.Position) {
		return `[${p.character}/${p.line}]`;
	}

	function rangeToString(r: zycode.Range) {
		return `[${positionToString(r.start)}/${positionToString(r.end)}]`;
	}

	function assertEqualRange(actual: zycode.Range, expected: zycode.Range, message?: string) {
		assert.strictEqual(rangeToString(actual), rangeToString(expected), message);
	}

	test('setTextDocumentLanguage -> close/open event', async function () {
		const file = await createRandomFile('foo\nbar\nbar');
		const doc = await zycode.workspace.openTextDocument(file);
		const langIdNow = doc.languageId;
		let clock = 0;
		const disposables: zycode.Disposable[] = [];

		const close = new Promise<void>(resolve => {
			disposables.push(zycode.workspace.onDidCloseTextDocument(e => {
				if (e === doc) {
					assert.strictEqual(doc.languageId, langIdNow);
					assert.strictEqual(clock, 0);
					clock += 1;
					resolve();
				}
			}));
		});
		const open = new Promise<void>(resolve => {
			disposables.push(zycode.workspace.onDidOpenTextDocument(e => {
				if (e === doc) { // same instance!
					assert.strictEqual(doc.languageId, 'json');
					assert.strictEqual(clock, 1);
					clock += 1;
					resolve();
				}
			}));
		});
		const change = zycode.languages.setTextDocumentLanguage(doc, 'json');
		await Promise.all([change, close, open]);
		assert.strictEqual(clock, 2);
		assert.strictEqual(doc.languageId, 'json');
		disposables.forEach(disposable => disposable.dispose());
		disposables.length = 0;
	});

	test('setTextDocumentLanguage -> error when language does not exist', async function () {
		const file = await createRandomFile('foo\nbar\nbar');
		const doc = await zycode.workspace.openTextDocument(file);

		try {
			await zycode.languages.setTextDocumentLanguage(doc, 'fooLangDoesNotExist');
			assert.ok(false);
		} catch (err) {
			assert.ok(err);
		}
	});

	test('diagnostics, read & event', function () {
		const uri = zycode.Uri.file('/foo/bar.txt');
		const col1 = zycode.languages.createDiagnosticCollection('foo1');
		col1.set(uri, [new zycode.Diagnostic(new zycode.Range(0, 0, 0, 12), 'error1')]);

		const col2 = zycode.languages.createDiagnosticCollection('foo2');
		col2.set(uri, [new zycode.Diagnostic(new zycode.Range(0, 0, 0, 12), 'error1')]);

		const diag = zycode.languages.getDiagnostics(uri);
		assert.strictEqual(diag.length, 2);

		const tuples = zycode.languages.getDiagnostics();
		let found = false;
		for (const [thisUri,] of tuples) {
			if (thisUri.toString() === uri.toString()) {
				found = true;
				break;
			}
		}
		assert.ok(tuples.length >= 1);
		assert.ok(found);
	});

	// HINT: If this test fails, and you have been modifying code used in workers, you might have
	// accidentally broken the workers. Check the logs for errors.
	test('link detector', async function () {
		const uri = await createRandomFile('class A { // http://a.com }', undefined, '.java');
		const doc = await zycode.workspace.openTextDocument(uri);

		const target = zycode.Uri.file(isWindows ? 'c:\\foo\\bar' : '/foo/bar');
		const range = new zycode.Range(new zycode.Position(0, 0), new zycode.Position(0, 5));

		const linkProvider: zycode.DocumentLinkProvider = {
			provideDocumentLinks: _doc => {
				return [new zycode.DocumentLink(range, target)];
			}
		};
		zycode.languages.registerDocumentLinkProvider({ language: 'java', scheme: testFs.scheme }, linkProvider);

		const links = await zycode.commands.executeCommand<zycode.DocumentLink[]>('zycode.executeLinkProvider', doc.uri);
		assert.strictEqual(links && links.length, 2, links.map(l => !l.target).join(', '));
		const [link1, link2] = links!.sort((l1, l2) => l1.range.start.compareTo(l2.range.start));

		assert.strictEqual(link1.target && link1.target.toString(), target.toString());
		assertEqualRange(link1.range, range);

		assert.strictEqual(link2.target && link2.target.toString(), 'http://a.com/');
		assertEqualRange(link2.range, new zycode.Range(new zycode.Position(0, 13), new zycode.Position(0, 25)));
	});

	test('diagnostics & CodeActionProvider', async function () {

		class D2 extends zycode.Diagnostic {
			customProp = { complex() { } };
			constructor() {
				super(new zycode.Range(0, 2, 0, 7), 'sonntag');
			}
		}

		const diag1 = new zycode.Diagnostic(new zycode.Range(0, 0, 0, 5), 'montag');
		const diag2 = new D2();

		let ran = false;
		const uri = zycode.Uri.parse('ttt:path.far');

		const r1 = zycode.languages.registerCodeActionsProvider({ pattern: '*.far', scheme: 'ttt' }, {
			provideCodeActions(_document, _range, ctx): zycode.Command[] {

				assert.strictEqual(ctx.diagnostics.length, 2);
				const [first, second] = ctx.diagnostics;
				assert.ok(first === diag1);
				assert.ok(second === diag2);
				assert.ok(diag2 instanceof D2);
				ran = true;
				return [];
			}
		});

		const r2 = zycode.workspace.registerTextDocumentContentProvider('ttt', {
			provideTextDocumentContent() {
				return 'this is some text';
			}
		});

		const r3 = zycode.languages.createDiagnosticCollection();
		r3.set(uri, [diag1]);

		const r4 = zycode.languages.createDiagnosticCollection();
		r4.set(uri, [diag2]);

		await zycode.workspace.openTextDocument(uri);
		await zycode.commands.executeCommand('zycode.executeCodeActionProvider', uri, new zycode.Range(0, 0, 0, 10));
		assert.ok(ran);
		zycode.Disposable.from(r1, r2, r3, r4).dispose();
	});

	test('completions with document filters', async function () {
		let ran = false;
		const uri = zycode.Uri.file(join(zycode.workspace.rootPath || '', './bower.json'));

		const jsonDocumentFilter = [{ language: 'json', pattern: '**/package.json' }, { language: 'json', pattern: '**/bower.json' }, { language: 'json', pattern: '**/.bower.json' }];

		const r1 = zycode.languages.registerCompletionItemProvider(jsonDocumentFilter, {
			provideCompletionItems: (_document: zycode.TextDocument, _position: zycode.Position, _token: zycode.CancellationToken): zycode.CompletionItem[] => {
				const proposal = new zycode.CompletionItem('foo');
				proposal.kind = zycode.CompletionItemKind.Property;
				ran = true;
				return [proposal];
			}
		});

		await zycode.workspace.openTextDocument(uri);
		const result = await zycode.commands.executeCommand<zycode.CompletionList>('zycode.executeCompletionItemProvider', uri, new zycode.Position(1, 0));
		r1.dispose();
		assert.ok(ran, 'Provider has not been invoked');
		assert.ok(result!.items.some(i => i.label === 'foo'), 'Results do not include "foo"');
	});

	test('folding command', async function () {
		const content = `[
			/**
			 * This is a comment with indentation issues
		*/
			{
				"name": "bag of items",
				"items": [
					"foo", "bar"
				]
			}
		]`;
		const uri = await createRandomFile(content, undefined, '.jsonc');
		await zycode.workspace.openTextDocument(uri);
		const jsonExtension = await zycode.extensions.getExtension('zycode.json-language-features');
		assert.ok(jsonExtension);
		await jsonExtension.activate();
		const result1 = await zycode.commands.executeCommand<zycode.FoldingRange[]>('zycode.executeFoldingRangeProvider', uri);
		assert.deepEqual(result1, [
			{ start: 0, end: 9 },
			{ start: 1, end: 3, kind: zycode.FoldingRangeKind.Comment },
			{ start: 4, end: 8 },
			{ start: 6, end: 7 },
		]);

		await zycode.workspace.getConfiguration('editor').update('foldingStrategy', 'indentation');
		try {
			const result2 = await zycode.commands.executeCommand<zycode.FoldingRange[]>('zycode.executeFoldingRangeProvider', uri);
			assert.deepEqual(result2, [
				{ start: 0, end: 10 },
				{ start: 1, end: 2 },
				{ start: 3, end: 9 },
				{ start: 4, end: 8 },
				{ start: 6, end: 7 },
			]);
			await zycode.workspace.getConfiguration('editor').update('folding', false);
			const result3 = await zycode.commands.executeCommand<zycode.FoldingRange[]>('zycode.executeFoldingRangeProvider', uri);
			assert.deepEqual(result3, []);
		} finally {
			await zycode.workspace.getConfiguration('editor').update('foldingStrategy', undefined);
			await zycode.workspace.getConfiguration('editor').update('folding', undefined);
		}
	});
});
