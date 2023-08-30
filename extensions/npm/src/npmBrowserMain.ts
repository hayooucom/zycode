/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as httpRequest from 'request-light';
import * as zycode from 'zycode';
import { addJSONProviders } from './features/jsonContributions';

export async function activate(context: zycode.ExtensionContext): Promise<void> {
	context.subscriptions.push(addJSONProviders(httpRequest.xhr, undefined));
}

export function deactivate(): void {
}
