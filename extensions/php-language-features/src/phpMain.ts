/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';

import PHPCompletionItemProvider from './features/completionItemProvider';
import PHPHoverProvider from './features/hoverProvider';
import PHPSignatureHelpProvider from './features/signatureHelpProvider';
import PHPValidationProvider from './features/validationProvider';

export function activate(context: zycode.ExtensionContext): any {

	const validator = new PHPValidationProvider();
	validator.activate(context.subscriptions);

	// add providers
	context.subscriptions.push(zycode.languages.registerCompletionItemProvider('php', new PHPCompletionItemProvider(), '>', '$'));
	context.subscriptions.push(zycode.languages.registerHoverProvider('php', new PHPHoverProvider()));
	context.subscriptions.push(zycode.languages.registerSignatureHelpProvider('php', new PHPSignatureHelpProvider(), '(', ','));
}
