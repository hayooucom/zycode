/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import * as fileSchemes from '../configuration/fileSchemes';
import { doesResourceLookLikeAJavaScriptFile, doesResourceLookLikeATypeScriptFile } from '../configuration/languageDescription';
import { API } from '../tsServer/api';
import { parseKindModifier } from '../tsServer/protocol/modifiers';
import type * as Proto from '../tsServer/protocol/protocol';
import * as PConst from '../tsServer/protocol/protocol.const';
import * as typeConverters from '../typeConverters';
import { ITypeScriptServiceClient } from '../typescriptService';

function getSymbolKind(item: Proto.NavtoItem): zycode.SymbolKind {
	switch (item.kind) {
		case PConst.Kind.method: return zycode.SymbolKind.Method;
		case PConst.Kind.enum: return zycode.SymbolKind.Enum;
		case PConst.Kind.enumMember: return zycode.SymbolKind.EnumMember;
		case PConst.Kind.function: return zycode.SymbolKind.Function;
		case PConst.Kind.class: return zycode.SymbolKind.Class;
		case PConst.Kind.interface: return zycode.SymbolKind.Interface;
		case PConst.Kind.type: return zycode.SymbolKind.Class;
		case PConst.Kind.memberVariable: return zycode.SymbolKind.Field;
		case PConst.Kind.memberGetAccessor: return zycode.SymbolKind.Field;
		case PConst.Kind.memberSetAccessor: return zycode.SymbolKind.Field;
		case PConst.Kind.variable: return zycode.SymbolKind.Variable;
		default: return zycode.SymbolKind.Variable;
	}
}

class TypeScriptWorkspaceSymbolProvider implements zycode.WorkspaceSymbolProvider {

	public constructor(
		private readonly client: ITypeScriptServiceClient,
		private readonly modeIds: readonly string[],
	) { }

	public async provideWorkspaceSymbols(
		search: string,
		token: zycode.CancellationToken
	): Promise<zycode.SymbolInformation[]> {
		let file: string | undefined;
		if (this.searchAllOpenProjects) {
			file = undefined;
		} else {
			const document = this.getDocument();
			file = document ? await this.toOpenedFiledPath(document) : undefined;

			if (!file && this.client.apiVersion.lt(API.v390)) {
				return [];
			}
		}

		const args: Proto.NavtoRequestArgs = {
			file,
			searchValue: search,
			maxResultCount: 256,
		};

		const response = await this.client.execute('navto', args, token);
		if (response.type !== 'response' || !response.body) {
			return [];
		}

		return response.body
			.filter(item => item.containerName || item.kind !== 'alias')
			.map(item => this.toSymbolInformation(item));
	}

	private get searchAllOpenProjects() {
		return this.client.apiVersion.gte(API.v390)
			&& zycode.workspace.getConfiguration('typescript').get('workspaceSymbols.scope', 'allOpenProjects') === 'allOpenProjects';
	}

	private async toOpenedFiledPath(document: zycode.TextDocument) {
		if (document.uri.scheme === fileSchemes.git) {
			try {
				const path = zycode.Uri.file(JSON.parse(document.uri.query)?.path);
				if (doesResourceLookLikeATypeScriptFile(path) || doesResourceLookLikeAJavaScriptFile(path)) {
					const document = await zycode.workspace.openTextDocument(path);
					return this.client.toOpenTsFilePath(document);
				}
			} catch {
				// noop
			}
		}
		return this.client.toOpenTsFilePath(document);
	}

	private toSymbolInformation(item: Proto.NavtoItem) {
		const label = TypeScriptWorkspaceSymbolProvider.getLabel(item);
		const info = new zycode.SymbolInformation(
			label,
			getSymbolKind(item),
			item.containerName || '',
			typeConverters.Location.fromTextSpan(this.client.toResource(item.file), item));
		const kindModifiers = item.kindModifiers ? parseKindModifier(item.kindModifiers) : undefined;
		if (kindModifiers?.has(PConst.KindModifiers.deprecated)) {
			info.tags = [zycode.SymbolTag.Deprecated];
		}
		return info;
	}

	private static getLabel(item: Proto.NavtoItem) {
		const label = item.name;
		if (item.kind === 'method' || item.kind === 'function') {
			return label + '()';
		}
		return label;
	}

	private getDocument(): zycode.TextDocument | undefined {
		// typescript wants to have a resource even when asking
		// general questions so we check the active editor. If this
		// doesn't match we take the first TS document.

		const activeDocument = zycode.window.activeTextEditor?.document;
		if (activeDocument) {
			if (this.modeIds.includes(activeDocument.languageId)) {
				return activeDocument;
			}
		}

		const documents = zycode.workspace.textDocuments;
		for (const document of documents) {
			if (this.modeIds.includes(document.languageId)) {
				return document;
			}
		}
		return undefined;
	}
}

export function register(
	client: ITypeScriptServiceClient,
	modeIds: readonly string[],
) {
	return zycode.languages.registerWorkspaceSymbolProvider(
		new TypeScriptWorkspaceSymbolProvider(client, modeIds));
}
