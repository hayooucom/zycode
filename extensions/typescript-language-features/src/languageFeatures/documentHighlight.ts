/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import { DocumentSelector } from '../configuration/documentSelector';
import type * as Proto from '../tsServer/protocol/protocol';
import * as typeConverters from '../typeConverters';
import { ITypeScriptServiceClient } from '../typescriptService';

class TypeScriptDocumentHighlightProvider implements zycode.DocumentHighlightProvider {
	public constructor(
		private readonly client: ITypeScriptServiceClient
	) { }

	public async provideDocumentHighlights(
		document: zycode.TextDocument,
		position: zycode.Position,
		token: zycode.CancellationToken
	): Promise<zycode.DocumentHighlight[]> {
		const file = this.client.toOpenTsFilePath(document);
		if (!file) {
			return [];
		}

		const args = {
			...typeConverters.Position.toFileLocationRequestArgs(file, position),
			filesToSearch: [file]
		};
		const response = await this.client.execute('documentHighlights', args, token);
		if (response.type !== 'response' || !response.body) {
			return [];
		}

		return response.body.flatMap(convertDocumentHighlight);
	}
}

function convertDocumentHighlight(highlight: Proto.DocumentHighlightsItem): ReadonlyArray<zycode.DocumentHighlight> {
	return highlight.highlightSpans.map(span =>
		new zycode.DocumentHighlight(
			typeConverters.Range.fromTextSpan(span),
			span.kind === 'writtenReference' ? zycode.DocumentHighlightKind.Write : zycode.DocumentHighlightKind.Read));
}

export function register(
	selector: DocumentSelector,
	client: ITypeScriptServiceClient,
) {
	return zycode.languages.registerDocumentHighlightProvider(selector.syntax,
		new TypeScriptDocumentHighlightProvider(client));
}
