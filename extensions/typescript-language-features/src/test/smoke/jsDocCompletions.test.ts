/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as zycode from 'zycode';
import { disposeAll } from '../../utils/dispose';
import { acceptFirstSuggestion } from '../suggestTestHelpers';
import { assertEditorContents, Config, createTestEditor, CURSOR, enumerateConfig, insertModesValues, joinLines, updateConfig, VsCodeConfiguration } from '../testUtils';

const testDocumentUri = zycode.Uri.parse('untitled:test.ts');

suite('JSDoc Completions', () => {
	const _disposables: zycode.Disposable[] = [];

	const configDefaults = Object.freeze<VsCodeConfiguration>({
		[Config.snippetSuggestions]: 'inline',
	});

	let oldConfig: { [key: string]: any } = {};

	setup(async () => {
		// the tests assume that typescript features are registered
		await zycode.extensions.getExtension('zycode.typescript-language-features')!.activate();

		// Save off config and apply defaults
		oldConfig = await updateConfig(testDocumentUri, configDefaults);
	});

	teardown(async () => {
		disposeAll(_disposables);

		// Restore config
		await updateConfig(testDocumentUri, oldConfig);

		return zycode.commands.executeCommand('workbench.action.closeAllEditors');
	});

	test('Should complete jsdoc inside single line comment', async () => {
		await enumerateConfig(testDocumentUri, Config.insertMode, insertModesValues, async config => {

			const editor = await createTestEditor(testDocumentUri,
				`/**$0 */`,
				`function abcdef(x, y) { }`,
			);

			await acceptFirstSuggestion(testDocumentUri, _disposables);

			assertEditorContents(editor,
				joinLines(
					`/**`,
					` * `,
					` * @param x ${CURSOR}`,
					` * @param y `,
					` */`,
					`function abcdef(x, y) { }`,
				),
				`Config: ${config}`);
		});
	});
});
