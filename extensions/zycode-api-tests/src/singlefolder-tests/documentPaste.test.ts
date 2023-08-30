/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as zycode from 'zycode';
import { closeAllEditors, createRandomFile, disposeAll } from '../utils';

const textPlain = 'text/plain';

// Skipped due to flakiness on Linux Desktop and errors on web
suite.skip('zycode API - Copy Paste', function () {

	this.retries(3);

	const testDisposables: zycode.Disposable[] = [];

	teardown(async function () {
		disposeAll(testDisposables);
		await closeAllEditors();
	});

	test('Copy should be able to overwrite text/plain', async () => {
		const file = await createRandomFile('$abcde@');
		const doc = await zycode.workspace.openTextDocument(file);

		const editor = await zycode.window.showTextDocument(doc);
		editor.selections = [new zycode.Selection(0, 1, 0, 6)];

		testDisposables.push(zycode.languages.registerDocumentPasteEditProvider({ language: 'plaintext' }, new class implements zycode.DocumentPasteEditProvider {
			async prepareDocumentPaste(_document: zycode.TextDocument, _ranges: readonly zycode.Range[], dataTransfer: zycode.DataTransfer, _token: zycode.CancellationToken): Promise<void> {
				const existing = dataTransfer.get(textPlain);
				if (existing) {
					const str = await existing.asString();
					const reversed = reverseString(str);
					dataTransfer.set(textPlain, new zycode.DataTransferItem(reversed));
				}
			}
		}, { id: 'test', copyMimeTypes: [textPlain] }));

		await zycode.commands.executeCommand('editor.action.clipboardCopyAction');
		const newDocContent = getNextDocumentText(testDisposables, doc);
		await zycode.commands.executeCommand('editor.action.clipboardPasteAction');
		assert.strictEqual(await newDocContent, '$edcba@');
	});

	test('Copy with empty selection should copy entire line', async () => {
		const file = await createRandomFile('abc\ndef');
		const doc = await zycode.workspace.openTextDocument(file);
		await zycode.window.showTextDocument(doc);

		testDisposables.push(zycode.languages.registerDocumentPasteEditProvider({ language: 'plaintext' }, new class implements zycode.DocumentPasteEditProvider {
			async prepareDocumentPaste(_document: zycode.TextDocument, _ranges: readonly zycode.Range[], dataTransfer: zycode.DataTransfer, _token: zycode.CancellationToken): Promise<void> {
				const existing = dataTransfer.get(textPlain);
				if (existing) {
					const str = await existing.asString();
					// text/plain includes the trailing new line in this case
					// On windows, this will always be `\r\n` even if the document uses `\n`
					const eol = str.match(/\r?\n$/)?.[0] ?? '\n';
					const reversed = reverseString(str.slice(0, -eol.length));
					dataTransfer.set(textPlain, new zycode.DataTransferItem(reversed + '\n'));
				}
			}
		}, { id: 'test', copyMimeTypes: [textPlain] }));

		await zycode.commands.executeCommand('editor.action.clipboardCopyAction');
		const newDocContent = getNextDocumentText(testDisposables, doc);
		await zycode.commands.executeCommand('editor.action.clipboardPasteAction');
		assert.strictEqual(await newDocContent, `cba\nabc\ndef`);
	});

	test('Copy with multiple selections should get all selections', async () => {
		const file = await createRandomFile('111\n222\n333');
		const doc = await zycode.workspace.openTextDocument(file);
		const editor = await zycode.window.showTextDocument(doc);

		editor.selections = [
			new zycode.Selection(0, 0, 0, 3),
			new zycode.Selection(2, 0, 2, 3),
		];

		testDisposables.push(zycode.languages.registerDocumentPasteEditProvider({ language: 'plaintext' }, new class implements zycode.DocumentPasteEditProvider {
			async prepareDocumentPaste(document: zycode.TextDocument, ranges: readonly zycode.Range[], dataTransfer: zycode.DataTransfer, _token: zycode.CancellationToken): Promise<void> {
				const existing = dataTransfer.get(textPlain);
				if (existing) {
					const selections = ranges.map(range => document.getText(range));
					dataTransfer.set(textPlain, new zycode.DataTransferItem(`(${ranges.length})${selections.join(' ')}`));
				}
			}
		}, { id: 'test', copyMimeTypes: [textPlain] }));

		await zycode.commands.executeCommand('editor.action.clipboardCopyAction');
		editor.selections = [new zycode.Selection(0, 0, 0, 0)];
		const newDocContent = getNextDocumentText(testDisposables, doc);
		await zycode.commands.executeCommand('editor.action.clipboardPasteAction');

		assert.strictEqual(await newDocContent, `(2)111 333111\n222\n333`);
	});

	test('Earlier invoked copy providers should win when writing values', async () => {
		const file = await createRandomFile('abc\ndef');
		const doc = await zycode.workspace.openTextDocument(file);

		const editor = await zycode.window.showTextDocument(doc);
		editor.selections = [new zycode.Selection(0, 0, 0, 3)];

		const callOrder: string[] = [];
		const a_id = 'a';
		const b_id = 'b';

		let providerAResolve: () => void;
		const providerAFinished = new Promise<void>(resolve => providerAResolve = resolve);

		testDisposables.push(zycode.languages.registerDocumentPasteEditProvider({ language: 'plaintext' }, new class implements zycode.DocumentPasteEditProvider {
			async prepareDocumentPaste(_document: zycode.TextDocument, _ranges: readonly zycode.Range[], dataTransfer: zycode.DataTransfer, _token: zycode.CancellationToken): Promise<void> {
				callOrder.push(a_id);
				dataTransfer.set(textPlain, new zycode.DataTransferItem('a'));
				providerAResolve();
			}
		}, { id: 'test', copyMimeTypes: [textPlain] }));

		// Later registered providers will be called first
		testDisposables.push(zycode.languages.registerDocumentPasteEditProvider({ language: 'plaintext' }, new class implements zycode.DocumentPasteEditProvider {
			async prepareDocumentPaste(_document: zycode.TextDocument, _ranges: readonly zycode.Range[], dataTransfer: zycode.DataTransfer, _token: zycode.CancellationToken): Promise<void> {
				callOrder.push(b_id);

				// Wait for the first provider to finish even though we were called first.
				// This tests that resulting order does not depend on the order the providers
				// return in.
				await providerAFinished;

				dataTransfer.set(textPlain, new zycode.DataTransferItem('b'));
			}
		}, { id: 'test', copyMimeTypes: [textPlain] }));

		await zycode.commands.executeCommand('editor.action.clipboardCopyAction');
		const newDocContent = getNextDocumentText(testDisposables, doc);
		await zycode.commands.executeCommand('editor.action.clipboardPasteAction');
		assert.strictEqual(await newDocContent, 'b\ndef');

		// Confirm provider call order is what we expected
		assert.deepStrictEqual(callOrder, [b_id, a_id]);
	});

	test('Copy providers should not be able to effect the data transfer of another', async () => {
		const file = await createRandomFile('abc\ndef');
		const doc = await zycode.workspace.openTextDocument(file);

		const editor = await zycode.window.showTextDocument(doc);
		editor.selections = [new zycode.Selection(0, 0, 0, 3)];


		let providerAResolve: () => void;
		const providerAFinished = new Promise<void>(resolve => providerAResolve = resolve);

		testDisposables.push(zycode.languages.registerDocumentPasteEditProvider({ language: 'plaintext' }, new class implements zycode.DocumentPasteEditProvider {
			async prepareDocumentPaste(_document: zycode.TextDocument, _ranges: readonly zycode.Range[], dataTransfer: zycode.DataTransfer, _token: zycode.CancellationToken): Promise<void> {
				dataTransfer.set(textPlain, new zycode.DataTransferItem('xyz'));
				providerAResolve();
			}
		}, { id: 'test', copyMimeTypes: [textPlain] }));

		testDisposables.push(zycode.languages.registerDocumentPasteEditProvider({ language: 'plaintext' }, new class implements zycode.DocumentPasteEditProvider {
			async prepareDocumentPaste(_document: zycode.TextDocument, _ranges: readonly zycode.Range[], dataTransfer: zycode.DataTransfer, _token: zycode.CancellationToken): Promise<void> {

				// Wait for the first provider to finish
				await providerAFinished;

				// We we access the data transfer here, we should not see changes made by the first provider
				const entry = dataTransfer.get(textPlain);
				const str = await entry!.asString();
				dataTransfer.set(textPlain, new zycode.DataTransferItem(reverseString(str)));
			}
		}, { id: 'test', copyMimeTypes: [textPlain] }));

		await zycode.commands.executeCommand('editor.action.clipboardCopyAction');
		const newDocContent = getNextDocumentText(testDisposables, doc);
		await zycode.commands.executeCommand('editor.action.clipboardPasteAction');
		assert.strictEqual(await newDocContent, 'cba\ndef');
	});


	test('One failing provider should not effect other', async () => {
		const file = await createRandomFile('abc\ndef');
		const doc = await zycode.workspace.openTextDocument(file);

		const editor = await zycode.window.showTextDocument(doc);
		editor.selections = [new zycode.Selection(0, 0, 0, 3)];

		testDisposables.push(zycode.languages.registerDocumentPasteEditProvider({ language: 'plaintext' }, new class implements zycode.DocumentPasteEditProvider {
			async prepareDocumentPaste(_document: zycode.TextDocument, _ranges: readonly zycode.Range[], dataTransfer: zycode.DataTransfer, _token: zycode.CancellationToken): Promise<void> {
				dataTransfer.set(textPlain, new zycode.DataTransferItem('xyz'));
			}
		}, { id: 'test', copyMimeTypes: [textPlain] }));

		testDisposables.push(zycode.languages.registerDocumentPasteEditProvider({ language: 'plaintext' }, new class implements zycode.DocumentPasteEditProvider {
			async prepareDocumentPaste(_document: zycode.TextDocument, _ranges: readonly zycode.Range[], _dataTransfer: zycode.DataTransfer, _token: zycode.CancellationToken): Promise<void> {
				throw new Error('Expected testing error from bad provider');
			}
		}, { id: 'test', copyMimeTypes: [textPlain] }));

		await zycode.commands.executeCommand('editor.action.clipboardCopyAction');
		const newDocContent = getNextDocumentText(testDisposables, doc);
		await zycode.commands.executeCommand('editor.action.clipboardPasteAction');
		assert.strictEqual(await newDocContent, 'xyz\ndef');
	});
});

function reverseString(str: string) {
	return str.split("").reverse().join("");
}

function getNextDocumentText(disposables: zycode.Disposable[], doc: zycode.TextDocument): Promise<string> {
	return new Promise<string>(resolve => {
		disposables.push(zycode.workspace.onDidChangeTextDocument(e => {
			if (e.document.uri.fsPath === doc.uri.fsPath) {
				resolve(e.document.getText());
			}
		}));
	});
}
