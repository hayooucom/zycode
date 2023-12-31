/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import { PackageDocument } from './packageDocumentHelper';
import { ExtensionLinter } from './extensionLinter';

export function activate(context: zycode.ExtensionContext) {

	//package.json suggestions
	context.subscriptions.push(registerPackageDocumentCompletions());

	context.subscriptions.push(new ExtensionLinter());
}


function registerPackageDocumentCompletions(): zycode.Disposable {
	return zycode.languages.registerCompletionItemProvider({ language: 'json', pattern: '**/package.json' }, {
		provideCompletionItems(document, position, token) {
			return new PackageDocument(document).provideCompletionItems(position, token);
		}
	});
}
