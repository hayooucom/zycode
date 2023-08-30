/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import { join } from 'path';
import * as zycode from 'zycode';

export function rndName() {
	let name = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 10; i++) {
		name += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return name;
}

export function createRandomFile(contents = '', fileExtension = 'txt'): Thenable<zycode.Uri> {
	return new Promise((resolve, reject) => {
		const tmpFile = join(os.tmpdir(), rndName() + '.' + fileExtension);
		fs.writeFile(tmpFile, contents, (error) => {
			if (error) {
				return reject(error);
			}

			resolve(zycode.Uri.file(tmpFile));
		});
	});
}


export function deleteFile(file: zycode.Uri): Thenable<boolean> {
	return new Promise((resolve, reject) => {
		fs.unlink(file.fsPath, (err) => {
			if (err) {
				reject(err);
			} else {
				resolve(true);
			}
		});
	});
}

export const CURSOR = '$$CURSOR$$';

export function withRandomFileEditor(
	contents: string,
	fileExtension: string,
	run: (editor: zycode.TextEditor, doc: zycode.TextDocument) => Thenable<void>
): Thenable<boolean> {
	const cursorIndex = contents.indexOf(CURSOR);
	return createRandomFile(contents.replace(CURSOR, ''), fileExtension).then(file => {
		return zycode.workspace.openTextDocument(file).then(doc => {
			return zycode.window.showTextDocument(doc).then((editor) => {
				if (cursorIndex >= 0) {
					const pos = doc.positionAt(cursorIndex);
					editor.selection = new zycode.Selection(pos, pos);
				}
				return run(editor, doc).then(_ => {
					if (doc.isDirty) {
						return doc.save().then(() => {
							return deleteFile(file);
						});
					} else {
						return deleteFile(file);
					}
				});
			});
		});
	});
}

export const wait = (ms: number) => new Promise<void>(resolve => setTimeout(() => resolve(), ms));

export const joinLines = (...args: string[]) => args.join(os.platform() === 'win32' ? '\r\n' : '\n');

export async function createTestEditor(uri: zycode.Uri, ...lines: string[]) {
	const document = await zycode.workspace.openTextDocument(uri);
	const editor = await zycode.window.showTextDocument(document);
	await editor.insertSnippet(new zycode.SnippetString(joinLines(...lines)), new zycode.Range(0, 0, 1000, 0));
	return editor;
}

export function assertEditorContents(editor: zycode.TextEditor, expectedDocContent: string, message?: string): void {
	const cursorIndex = expectedDocContent.indexOf(CURSOR);

	assert.strictEqual(
		editor.document.getText(),
		expectedDocContent.replace(CURSOR, ''),
		message);

	if (cursorIndex >= 0) {
		const expectedCursorPos = editor.document.positionAt(cursorIndex);
		assert.deepStrictEqual(
			{ line: editor.selection.active.line, character: editor.selection.active.line },
			{ line: expectedCursorPos.line, character: expectedCursorPos.line },
			'Cursor position'
		);
	}
}

export type VsCodeConfiguration = { [key: string]: any };

export async function updateConfig(documentUri: zycode.Uri, newConfig: VsCodeConfiguration): Promise<VsCodeConfiguration> {
	const oldConfig: VsCodeConfiguration = {};
	const config = zycode.workspace.getConfiguration(undefined, documentUri);

	for (const configKey of Object.keys(newConfig)) {
		oldConfig[configKey] = config.get(configKey);
		await new Promise<void>((resolve, reject) =>
			config.update(configKey, newConfig[configKey], zycode.ConfigurationTarget.Global)
				.then(() => resolve(), reject));
	}
	return oldConfig;
}

export const Config = Object.freeze({
	autoClosingBrackets: 'editor.autoClosingBrackets',
	typescriptCompleteFunctionCalls: 'typescript.suggest.completeFunctionCalls',
	insertMode: 'editor.suggest.insertMode',
	snippetSuggestions: 'editor.snippetSuggestions',
	suggestSelection: 'editor.suggestSelection',
	javascriptQuoteStyle: 'javascript.preferences.quoteStyle',
	typescriptQuoteStyle: 'typescript.preferences.quoteStyle',
} as const);

export const insertModesValues = Object.freeze(['insert', 'replace']);

export async function enumerateConfig(
	documentUri: zycode.Uri,
	configKey: string,
	values: readonly string[],
	f: (message: string) => Promise<void>
): Promise<void> {
	for (const value of values) {
		const newConfig = { [configKey]: value };
		await updateConfig(documentUri, newConfig);
		await f(JSON.stringify(newConfig));
	}
}


export function onChangedDocument(documentUri: zycode.Uri, disposables: zycode.Disposable[]) {
	return new Promise<zycode.TextDocument>(resolve => zycode.workspace.onDidChangeTextDocument(e => {
		if (e.document.uri.toString() === documentUri.toString()) {
			resolve(e.document);
		}
	}, undefined, disposables));
}

export async function retryUntilDocumentChanges(
	documentUri: zycode.Uri,
	options: { retries: number; timeout: number },
	disposables: zycode.Disposable[],
	exec: () => Thenable<unknown>,
) {
	const didChangeDocument = onChangedDocument(documentUri, disposables);

	let done = false;

	const result = await Promise.race([
		didChangeDocument,
		(async () => {
			for (let i = 0; i < options.retries; ++i) {
				await wait(options.timeout);
				if (done) {
					return;
				}
				await exec();
			}
		})(),
	]);
	done = true;
	return result;
}
