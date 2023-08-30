/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import { DocumentSelector } from '../configuration/documentSelector';
import { ClientCapability, ITypeScriptServiceClient } from '../typescriptService';
import DefinitionProviderBase from './definitionProviderBase';
import { conditionalRegistration, requireSomeCapability } from './util/dependentRegistration';

class TypeScriptImplementationProvider extends DefinitionProviderBase implements zycode.ImplementationProvider {
	public provideImplementation(document: zycode.TextDocument, position: zycode.Position, token: zycode.CancellationToken): Promise<zycode.Definition | undefined> {
		return this.getSymbolLocations('implementation', document, position, token);
	}
}

export function register(
	selector: DocumentSelector,
	client: ITypeScriptServiceClient,
) {
	return conditionalRegistration([
		requireSomeCapability(client, ClientCapability.Semantic),
	], () => {
		return zycode.languages.registerImplementationProvider(selector.semantic,
			new TypeScriptImplementationProvider(client));
	});
}
