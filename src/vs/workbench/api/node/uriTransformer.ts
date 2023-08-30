/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { UriParts, IRawURITransformer, URITransformer, IURITransformer } from 'vs/base/common/uriIpc';

/**
 * ```
 * --------------------------------
 * |    UI SIDE    |  AGENT SIDE  |
 * |---------------|--------------|
 * | zycode-remote | file         |
 * | file          | zycode-local |
 * --------------------------------
 * ```
 */
function createRawURITransformer(remoteAuthority: string): IRawURITransformer {
	return {
		transformIncoming: (uri: UriParts): UriParts => {
			if (uri.scheme === 'zycode-remote') {
				return { scheme: 'file', path: uri.path, query: uri.query, fragment: uri.fragment };
			}
			if (uri.scheme === 'file') {
				return { scheme: 'zycode-local', path: uri.path, query: uri.query, fragment: uri.fragment };
			}
			return uri;
		},
		transformOutgoing: (uri: UriParts): UriParts => {
			if (uri.scheme === 'file') {
				return { scheme: 'zycode-remote', authority: remoteAuthority, path: uri.path, query: uri.query, fragment: uri.fragment };
			}
			if (uri.scheme === 'zycode-local') {
				return { scheme: 'file', path: uri.path, query: uri.query, fragment: uri.fragment };
			}
			return uri;
		},
		transformOutgoingScheme: (scheme: string): string => {
			if (scheme === 'file') {
				return 'zycode-remote';
			} else if (scheme === 'zycode-local') {
				return 'file';
			}
			return scheme;
		}
	};
}

export function createURITransformer(remoteAuthority: string): IURITransformer {
	return new URITransformer(createRawURITransformer(remoteAuthority));
}
