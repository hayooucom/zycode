/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import { DocumentSelector } from '../configuration/documentSelector';
import { API } from '../tsServer/api';
import * as typeConverters from '../typeConverters';
import { ClientCapability, ITypeScriptServiceClient } from '../typescriptService';
import { conditionalRegistration, requireMinVersion, requireSomeCapability } from './util/dependentRegistration';

class LinkedEditingSupport implements zycode.LinkedEditingRangeProvider {

	public static readonly minVersion = API.v510;

	public constructor(
		private readonly client: ITypeScriptServiceClient
	) { }

	async provideLinkedEditingRanges(document: zycode.TextDocument, position: zycode.Position, token: zycode.CancellationToken): Promise<zycode.LinkedEditingRanges | undefined> {
		const filepath = this.client.toOpenTsFilePath(document);
		if (!filepath) {
			return undefined;
		}

		const args = typeConverters.Position.toFileLocationRequestArgs(filepath, position);
		const response = await this.client.execute('linkedEditingRange', args, token);
		if (response.type !== 'response' || !response.body) {
			return undefined;
		}

		const wordPattern = response.body.wordPattern ? new RegExp(response.body.wordPattern) : undefined;
		return new zycode.LinkedEditingRanges(response.body.ranges.map(range => typeConverters.Range.fromTextSpan(range)), wordPattern);
	}
}

export function register(
	selector: DocumentSelector,
	client: ITypeScriptServiceClient
) {
	return conditionalRegistration([
		requireMinVersion(client, LinkedEditingSupport.minVersion),
		requireSomeCapability(client, ClientCapability.Syntax),
	], () => {
		return zycode.languages.registerLinkedEditingRangeProvider(selector.syntax,
			new LinkedEditingSupport(client));
	});
}
