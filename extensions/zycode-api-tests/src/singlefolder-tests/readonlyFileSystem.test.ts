/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as zycode from 'zycode';
import { TestFS } from '../memfs';
import { assertNoRpc, closeAllEditors } from '../utils';

suite('zycode API - file system', () => {

	teardown(async function () {
		assertNoRpc();
		await closeAllEditors();
	});

	test('readonly file system - boolean', async function () {
		const fs = new TestFS('this-fs', false);
		const reg = zycode.workspace.registerFileSystemProvider(fs.scheme, fs, { isReadonly: true });
		let error: any | undefined;
		try {
			await zycode.workspace.fs.writeFile(zycode.Uri.parse('this-fs:/foo.txt'), Buffer.from('Hello World'));
		} catch (e) {
			error = e;
		}
		assert.strictEqual(zycode.workspace.fs.isWritableFileSystem('this-fs'), false);
		assert.strictEqual(error instanceof zycode.FileSystemError, true);
		const fileError: zycode.FileSystemError = error;
		assert.strictEqual(fileError.code, 'NoPermissions');
		reg.dispose();
	});

	test('readonly file system - markdown', async function () {
		const fs = new TestFS('this-fs', false);
		const reg = zycode.workspace.registerFileSystemProvider(fs.scheme, fs, { isReadonly: new zycode.MarkdownString('This file is readonly.') });
		let error: any | undefined;
		try {
			await zycode.workspace.fs.writeFile(zycode.Uri.parse('this-fs:/foo.txt'), Buffer.from('Hello World'));
		} catch (e) {
			error = e;
		}
		assert.strictEqual(zycode.workspace.fs.isWritableFileSystem('this-fs'), false);
		assert.strictEqual(error instanceof zycode.FileSystemError, true);
		const fileError: zycode.FileSystemError = error;
		assert.strictEqual(fileError.code, 'NoPermissions');
		reg.dispose();
	});

	test('writeable file system', async function () {
		const fs = new TestFS('this-fs', false);
		const reg = zycode.workspace.registerFileSystemProvider(fs.scheme, fs);
		let error: any | undefined;
		try {
			await zycode.workspace.fs.writeFile(zycode.Uri.parse('this-fs:/foo.txt'), Buffer.from('Hello World'));
		} catch (e) {
			error = e;
		}
		assert.strictEqual(zycode.workspace.fs.isWritableFileSystem('this-fs'), true);
		assert.strictEqual(error, undefined);
		reg.dispose();
	});
});
