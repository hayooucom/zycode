/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as zycode from 'zycode';
import { onChangedDocument, retryUntilDocumentChanges, wait } from './testUtils';

export async function acceptFirstSuggestion(uri: zycode.Uri, _disposables: zycode.Disposable[]) {
	return retryUntilDocumentChanges(uri, { retries: 10, timeout: 0 }, _disposables, async () => {
		await zycode.commands.executeCommand('editor.action.triggerSuggest');
		await wait(1000);
		await zycode.commands.executeCommand('acceptSelectedSuggestion');
	});
}

export async function typeCommitCharacter(uri: zycode.Uri, character: string, _disposables: zycode.Disposable[]) {
	const didChangeDocument = onChangedDocument(uri, _disposables);
	await zycode.commands.executeCommand('editor.action.triggerSuggest');
	await wait(3000); // Give time for suggestions to show
	await zycode.commands.executeCommand('type', { text: character });
	return await didChangeDocument;
}
