/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as zycode from 'zycode';
import { assertNoRpc } from '../utils';

suite('zycode API - types', () => {

	teardown(assertNoRpc);

	test('static properties, es5 compat class', function () {
		assert.ok(zycode.ThemeIcon.File instanceof zycode.ThemeIcon);
		assert.ok(zycode.ThemeIcon.Folder instanceof zycode.ThemeIcon);
		assert.ok(zycode.CodeActionKind.Empty instanceof zycode.CodeActionKind);
		assert.ok(zycode.CodeActionKind.QuickFix instanceof zycode.CodeActionKind);
		assert.ok(zycode.CodeActionKind.Refactor instanceof zycode.CodeActionKind);
		assert.ok(zycode.CodeActionKind.RefactorExtract instanceof zycode.CodeActionKind);
		assert.ok(zycode.CodeActionKind.RefactorInline instanceof zycode.CodeActionKind);
		assert.ok(zycode.CodeActionKind.RefactorMove instanceof zycode.CodeActionKind);
		assert.ok(zycode.CodeActionKind.RefactorRewrite instanceof zycode.CodeActionKind);
		assert.ok(zycode.CodeActionKind.Source instanceof zycode.CodeActionKind);
		assert.ok(zycode.CodeActionKind.SourceOrganizeImports instanceof zycode.CodeActionKind);
		assert.ok(zycode.CodeActionKind.SourceFixAll instanceof zycode.CodeActionKind);
		// assert.ok(zycode.QuickInputButtons.Back instanceof zycode.QuickInputButtons); never was an instance

	});
});
