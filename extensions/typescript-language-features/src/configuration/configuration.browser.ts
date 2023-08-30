/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import { BaseServiceConfigurationProvider } from './configuration';

export class BrowserServiceConfigurationProvider extends BaseServiceConfigurationProvider {

	// On browsers, we only support using the built-in TS version
	protected readGlobalTsdk(_configuration: zycode.WorkspaceConfiguration): string | null {
		return null;
	}

	protected readLocalTsdk(_configuration: zycode.WorkspaceConfiguration): string | null {
		return null;
	}
}
