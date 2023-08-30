/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'zycode' {

	// https://github.com/microsoft/zycode/issues/173738

	export interface LanguageConfiguration {
		autoClosingPairs?: {
			open: string;
			close: string;
			notIn?: string[];
		}[];
	}
}
