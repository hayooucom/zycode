/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import type * as Proto from '../tsServer/protocol/protocol';
import { ClientCapability, ITypeScriptServiceClient, ServerType } from '../typescriptService';
import { conditionalRegistration, requireSomeCapability } from './util/dependentRegistration';
import { DocumentSelector } from '../configuration/documentSelector';
import { documentationToMarkdown } from './util/textRendering';
import * as typeConverters from '../typeConverters';
import FileConfigurationManager from './fileConfigurationManager';



class TypeScriptHoverProvider implements zycode.HoverProvider {

	public constructor(
		private readonly client: ITypeScriptServiceClient,
		private readonly fileConfigurationManager: FileConfigurationManager,
	) { }

	public async provideHover(
		document: zycode.TextDocument,
		position: zycode.Position,
		token: zycode.CancellationToken
	): Promise<zycode.Hover | undefined> {
		const filepath = this.client.toOpenTsFilePath(document);
		if (!filepath) {
			return undefined;
		}

		const response = await this.client.interruptGetErr(async () => {
			await this.fileConfigurationManager.ensureConfigurationForDocument(document, token);

			const args = typeConverters.Position.toFileLocationRequestArgs(filepath, position);
			return this.client.execute('quickinfo', args, token);
		});

		if (response.type !== 'response' || !response.body) {
			return undefined;
		}

		return new zycode.Hover(
			this.getContents(document.uri, response.body, response._serverType),
			typeConverters.Range.fromTextSpan(response.body));
	}

	private getContents(
		resource: zycode.Uri,
		data: Proto.QuickInfoResponseBody,
		source: ServerType | undefined,
	) {
		const parts: zycode.MarkdownString[] = [];

		if (data.displayString) {
			const displayParts: string[] = [];

			if (source === ServerType.Syntax && this.client.hasCapabilityForResource(resource, ClientCapability.Semantic)) {
				displayParts.push(
					zycode.l10n.t({
						message: "(loading...)",
						comment: ['Prefix displayed for hover entries while the server is still loading']
					}));
			}

			displayParts.push(data.displayString);
			parts.push(new zycode.MarkdownString().appendCodeblock(displayParts.join(' '), 'typescript'));
		}
		const md = documentationToMarkdown(data.documentation, data.tags, this.client, resource);
		parts.push(md);
		return parts;
	}
}

export function register(
	selector: DocumentSelector,
	client: ITypeScriptServiceClient,
	fileConfigurationManager: FileConfigurationManager,
): zycode.Disposable {
	return conditionalRegistration([
		requireSomeCapability(client, ClientCapability.EnhancedSyntax, ClientCapability.Semantic),
	], () => {
		return zycode.languages.registerHoverProvider(selector.syntax,
			new TypeScriptHoverProvider(client, fileConfigurationManager));
	});
}
