/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import MergeConflictServices from './services';

export function activate(context: zycode.ExtensionContext) {
	// Register disposables
	const services = new MergeConflictServices(context);
	services.begin();
	context.subscriptions.push(services);
}

export function deactivate() {
}

