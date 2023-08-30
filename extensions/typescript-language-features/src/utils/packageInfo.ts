/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';

export interface PackageInfo {
	name: string;
	version: string;
	aiKey: string;
}

export function getPackageInfo(context: zycode.ExtensionContext) {
	const packageJSON = context.extension.packageJSON;
	if (packageJSON && typeof packageJSON === 'object') {
		return {
			name: packageJSON.name ?? '',
			version: packageJSON.version ?? '',
			aiKey: packageJSON.aiKey ?? '',
		};
	}
	return null;
}
