/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import { PackageDocument } from './packageDocumentHelper';

export function activate(context: zycode.ExtensionContext) {
	//package.json suggestions
	context.subscriptions.push(registerPackageDocumentCompletions());

}

function registerPackageDocumentCompletions(): zycode.Disposable {
	return zycode.languages.registerCompletionItemProvider({ language: 'json', pattern: '**/package.json' }, {
		provideCompletionItems(document, position, token) {
			return new PackageDocument(document).provideCompletionItems(position, token);
		}
	});

}
