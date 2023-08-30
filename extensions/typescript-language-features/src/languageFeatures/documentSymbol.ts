/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import { DocumentSelector } from '../configuration/documentSelector';
import { CachedResponse } from '../tsServer/cachedResponse';
import { parseKindModifier } from '../tsServer/protocol/modifiers';
import type * as Proto from '../tsServer/protocol/protocol';
import * as PConst from '../tsServer/protocol/protocol.const';
import * as typeConverters from '../typeConverters';
import { ITypeScriptServiceClient } from '../typescriptService';

const getSymbolKind = (kind: string): zycode.SymbolKind => {
	switch (kind) {
		case PConst.Kind.module: return zycode.SymbolKind.Module;
		case PConst.Kind.class: return zycode.SymbolKind.Class;
		case PConst.Kind.enum: return zycode.SymbolKind.Enum;
		case PConst.Kind.interface: return zycode.SymbolKind.Interface;
		case PConst.Kind.method: return zycode.SymbolKind.Method;
		case PConst.Kind.memberVariable: return zycode.SymbolKind.Property;
		case PConst.Kind.memberGetAccessor: return zycode.SymbolKind.Property;
		case PConst.Kind.memberSetAccessor: return zycode.SymbolKind.Property;
		case PConst.Kind.variable: return zycode.SymbolKind.Variable;
		case PConst.Kind.const: return zycode.SymbolKind.Variable;
		case PConst.Kind.localVariable: return zycode.SymbolKind.Variable;
		case PConst.Kind.function: return zycode.SymbolKind.Function;
		case PConst.Kind.localFunction: return zycode.SymbolKind.Function;
		case PConst.Kind.constructSignature: return zycode.SymbolKind.Constructor;
		case PConst.Kind.constructorImplementation: return zycode.SymbolKind.Constructor;
	}
	return zycode.SymbolKind.Variable;
};

class TypeScriptDocumentSymbolProvider implements zycode.DocumentSymbolProvider {

	public constructor(
		private readonly client: ITypeScriptServiceClient,
		private readonly cachedResponse: CachedResponse<Proto.NavTreeResponse>,
	) { }

	public async provideDocumentSymbols(document: zycode.TextDocument, token: zycode.CancellationToken): Promise<zycode.DocumentSymbol[] | undefined> {
		const file = this.client.toOpenTsFilePath(document);
		if (!file) {
			return undefined;
		}

		const args: Proto.FileRequestArgs = { file };
		const response = await this.cachedResponse.execute(document, () => this.client.execute('navtree', args, token));
		if (response.type !== 'response' || !response.body?.childItems) {
			return undefined;
		}

		// The root represents the file. Ignore this when showing in the UI
		const result: zycode.DocumentSymbol[] = [];
		for (const item of response.body.childItems) {
			TypeScriptDocumentSymbolProvider.convertNavTree(document.uri, result, item);
		}
		return result;
	}

	private static convertNavTree(
		resource: zycode.Uri,
		output: zycode.DocumentSymbol[],
		item: Proto.NavigationTree,
	): boolean {
		let shouldInclude = TypeScriptDocumentSymbolProvider.shouldInclueEntry(item);
		if (!shouldInclude && !item.childItems?.length) {
			return false;
		}

		const children = new Set(item.childItems || []);
		for (const span of item.spans) {
			const range = typeConverters.Range.fromTextSpan(span);
			const symbolInfo = TypeScriptDocumentSymbolProvider.convertSymbol(item, range);

			for (const child of children) {
				if (child.spans.some(span => !!range.intersection(typeConverters.Range.fromTextSpan(span)))) {
					const includedChild = TypeScriptDocumentSymbolProvider.convertNavTree(resource, symbolInfo.children, child);
					shouldInclude = shouldInclude || includedChild;
					children.delete(child);
				}
			}

			if (shouldInclude) {
				output.push(symbolInfo);
			}
		}

		return shouldInclude;
	}

	private static convertSymbol(item: Proto.NavigationTree, range: zycode.Range): zycode.DocumentSymbol {
		const selectionRange = item.nameSpan ? typeConverters.Range.fromTextSpan(item.nameSpan) : range;
		let label = item.text;

		switch (item.kind) {
			case PConst.Kind.memberGetAccessor: label = `(get) ${label}`; break;
			case PConst.Kind.memberSetAccessor: label = `(set) ${label}`; break;
		}

		const symbolInfo = new zycode.DocumentSymbol(
			label,
			'',
			getSymbolKind(item.kind),
			range,
			range.contains(selectionRange) ? selectionRange : range);


		const kindModifiers = parseKindModifier(item.kindModifiers);
		if (kindModifiers.has(PConst.KindModifiers.deprecated)) {
			symbolInfo.tags = [zycode.SymbolTag.Deprecated];
		}

		return symbolInfo;
	}

	private static shouldInclueEntry(item: Proto.NavigationTree | Proto.NavigationBarItem): boolean {
		if (item.kind === PConst.Kind.alias) {
			return false;
		}
		return !!(item.text && item.text !== '<function>' && item.text !== '<class>');
	}
}

export function register(
	selector: DocumentSelector,
	client: ITypeScriptServiceClient,
	cachedResponse: CachedResponse<Proto.NavTreeResponse>,
) {
	return zycode.languages.registerDocumentSymbolProvider(selector.syntax,
		new TypeScriptDocumentSymbolProvider(client, cachedResponse), { label: 'TypeScript' });
}
