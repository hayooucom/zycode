/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import { DocumentSelector } from '../configuration/documentSelector';
import { API } from '../tsServer/api';
import * as typeConverters from '../typeConverters';
import { ClientCapability, ITypeScriptServiceClient } from '../typescriptService';
import DefinitionProviderBase from './definitionProviderBase';
import { conditionalRegistration, requireSomeCapability } from './util/dependentRegistration';

export default class TypeScriptDefinitionProvider extends DefinitionProviderBase implements zycode.DefinitionProvider {

	public async provideDefinition(
		document: zycode.TextDocument,
		position: zycode.Position,
		token: zycode.CancellationToken
	): Promise<zycode.DefinitionLink[] | zycode.Definition | undefined> {
		const filepath = this.client.toOpenTsFilePath(document);
		if (!filepath) {
			return undefined;
		}

		const args = typeConverters.Position.toFileLocationRequestArgs(filepath, position);
		const response = await this.client.execute('definitionAndBoundSpan', args, token);
		if (response.type !== 'response' || !response.body) {
			return undefined;
		}

		const span = response.body.textSpan ? typeConverters.Range.fromTextSpan(response.body.textSpan) : undefined;
		let definitions = response.body.definitions;

		if (zycode.workspace.getConfiguration(document.languageId).get('preferGoToSourceDefinition', false) && this.client.apiVersion.gte(API.v470)) {
			const sourceDefinitionsResponse = await this.client.execute('findSourceDefinition', args, token);
			if (sourceDefinitionsResponse.type === 'response' && sourceDefinitionsResponse.body?.length) {
				definitions = sourceDefinitionsResponse.body;
			}
		}

		return definitions
			.map((location): zycode.DefinitionLink => {
				const target = typeConverters.Location.fromTextSpan(this.client.toResource(location.file), location);
				if (location.contextStart && location.contextEnd) {
					return {
						originSelectionRange: span,
						targetRange: typeConverters.Range.fromLocations(location.contextStart, location.contextEnd),
						targetUri: target.uri,
						targetSelectionRange: target.range,
					};
				}
				return {
					originSelectionRange: span,
					targetRange: target.range,
					targetUri: target.uri
				};
			});
	}
}

export function register(
	selector: DocumentSelector,
	client: ITypeScriptServiceClient,
) {
	return conditionalRegistration([
		requireSomeCapability(client, ClientCapability.EnhancedSyntax, ClientCapability.Semantic),
	], () => {
		return zycode.languages.registerDefinitionProvider(selector.syntax,
			new TypeScriptDefinitionProvider(client));
	});
}
