/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';

/**
 * Tries to convert an url into a zycode uri and returns undefined if this is not possible.
 * `url` can be absolute or relative.
*/
export function urlToUri(url: string, base: zycode.Uri): zycode.Uri | undefined {
	try {
		// `zycode.Uri.joinPath` cannot be used, since it understands
		// `src` as path, not as relative url. This is problematic for query args.
		const parsedUrl = new URL(url, base.toString());
		const uri = zycode.Uri.parse(parsedUrl.toString());
		return uri;
	} catch (e) {
		// Don't crash if `URL` cannot parse `src`.
		return undefined;
	}
}
