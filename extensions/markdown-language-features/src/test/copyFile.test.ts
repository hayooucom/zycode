/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as zycode from 'zycode';
import { resolveCopyDestination } from '../languageFeatures/copyFiles/copyFiles';


suite('resolveCopyDestination', () => {

	test('Relative destinations should resolve next to document', async () => {
		const documentUri = zycode.Uri.parse('test://projects/project/sub/readme.md');

		{
			const dest = resolveCopyDestination(documentUri, 'img.png', '${fileName}', () => zycode.Uri.parse('test://projects/project/'));
			assert.strictEqual(dest.toString(), 'test://projects/project/sub/img.png');
		}
		{
			const dest = resolveCopyDestination(documentUri, 'img.png', './${fileName}', () => zycode.Uri.parse('test://projects/project/'));
			assert.strictEqual(dest.toString(), 'test://projects/project/sub/img.png');
		}
		{
			const dest = resolveCopyDestination(documentUri, 'img.png', '../${fileName}', () => zycode.Uri.parse('test://projects/project/'));
			assert.strictEqual(dest.toString(), 'test://projects/project/img.png');
		}
	});

	test('Destination starting with / should go to workspace root', async () => {
		const documentUri = zycode.Uri.parse('test://projects/project/sub/readme.md');
		const dest = resolveCopyDestination(documentUri, 'img.png', '/${fileName}', () => zycode.Uri.parse('test://projects/project/'));

		assert.strictEqual(dest.toString(), 'test://projects/project/img.png');
	});

	test('If there is no workspace root, / should resolve to document dir', async () => {
		const documentUri = zycode.Uri.parse('test://projects/project/sub/readme.md');
		const dest = resolveCopyDestination(documentUri, 'img.png', '/${fileName}', () => undefined);

		assert.strictEqual(dest.toString(), 'test://projects/project/sub/img.png');
	});

	test('If path ends in /, we should automatically add the fileName', async () => {
		{
			const documentUri = zycode.Uri.parse('test://projects/project/sub/readme.md');
			const dest = resolveCopyDestination(documentUri, 'img.png', 'images/', () => zycode.Uri.parse('test://projects/project/'));
			assert.strictEqual(dest.toString(), 'test://projects/project/sub/images/img.png');
		}
		{
			const documentUri = zycode.Uri.parse('test://projects/project/sub/readme.md');
			const dest = resolveCopyDestination(documentUri, 'img.png', './', () => zycode.Uri.parse('test://projects/project/'));
			assert.strictEqual(dest.toString(), 'test://projects/project/sub/img.png');
		}
		{
			const documentUri = zycode.Uri.parse('test://projects/project/sub/readme.md');
			const dest = resolveCopyDestination(documentUri, 'img.png', '/', () => zycode.Uri.parse('test://projects/project/'));

			assert.strictEqual(dest.toString(), 'test://projects/project/img.png');
		}
	});

	test('Basic transform', async () => {
		const documentUri = zycode.Uri.parse('test://projects/project/sub/readme.md');
		const dest = resolveCopyDestination(documentUri, 'img.png', '${fileName/.png/.gif/}', () => undefined);

		assert.strictEqual(dest.toString(), 'test://projects/project/sub/img.gif');
	});

	test('transforms should support capture groups', async () => {
		const documentUri = zycode.Uri.parse('test://projects/project/sub/readme.md');
		const dest = resolveCopyDestination(documentUri, 'img.png', '${fileName/(.+)\\.(.+)/$2.$1/}', () => undefined);

		assert.strictEqual(dest.toString(), 'test://projects/project/sub/png.img');
	});
});
