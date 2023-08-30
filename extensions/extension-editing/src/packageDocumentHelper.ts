/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import { getLocation, Location } from 'jsonc-parser';


export class PackageDocument {

	constructor(private document: zycode.TextDocument) { }

	public provideCompletionItems(position: zycode.Position, _token: zycode.CancellationToken): zycode.ProviderResult<zycode.CompletionItem[]> {
		const location = getLocation(this.document.getText(), this.document.offsetAt(position));

		if (location.path.length >= 2 && location.path[1] === 'configurationDefaults') {
			return this.provideLanguageOverridesCompletionItems(location, position);
		}

		return undefined;
	}

	private provideLanguageOverridesCompletionItems(location: Location, position: zycode.Position): zycode.ProviderResult<zycode.CompletionItem[]> {
		let range = this.getReplaceRange(location, position);
		const text = this.document.getText(range);

		if (location.path.length === 2) {

			let snippet = '"[${1:language}]": {\n\t"$0"\n}';

			// Suggestion model word matching includes quotes,
			// hence exclude the starting quote from the snippet and the range
			// ending quote gets replaced
			if (text && text.startsWith('"')) {
				range = new zycode.Range(new zycode.Position(range.start.line, range.start.character + 1), range.end);
				snippet = snippet.substring(1);
			}

			return Promise.resolve([this.newSnippetCompletionItem({
				label: zycode.l10n.t("Language specific editor settings"),
				documentation: zycode.l10n.t("Override editor settings for language"),
				snippet,
				range
			})]);
		}

		if (location.path.length === 3 && location.previousNode && typeof location.previousNode.value === 'string' && location.previousNode.value.startsWith('[')) {

			// Suggestion model word matching includes starting quote and open sqaure bracket
			// Hence exclude them from the proposal range
			range = new zycode.Range(new zycode.Position(range.start.line, range.start.character + 2), range.end);

			return zycode.languages.getLanguages().then(languages => {
				return languages.map(l => {

					// Suggestion model word matching includes closed sqaure bracket and ending quote
					// Hence include them in the proposal to replace
					return this.newSimpleCompletionItem(l, range, '', l + ']"');
				});
			});
		}
		return Promise.resolve([]);
	}

	private getReplaceRange(location: Location, position: zycode.Position) {
		const node = location.previousNode;
		if (node) {
			const nodeStart = this.document.positionAt(node.offset), nodeEnd = this.document.positionAt(node.offset + node.length);
			if (nodeStart.isBeforeOrEqual(position) && nodeEnd.isAfterOrEqual(position)) {
				return new zycode.Range(nodeStart, nodeEnd);
			}
		}
		return new zycode.Range(position, position);
	}

	private newSimpleCompletionItem(text: string, range: zycode.Range, description?: string, insertText?: string): zycode.CompletionItem {
		const item = new zycode.CompletionItem(text);
		item.kind = zycode.CompletionItemKind.Value;
		item.detail = description;
		item.insertText = insertText ? insertText : text;
		item.range = range;
		return item;
	}

	private newSnippetCompletionItem(o: { label: string; documentation?: string; snippet: string; range: zycode.Range }): zycode.CompletionItem {
		const item = new zycode.CompletionItem(o.label);
		item.kind = zycode.CompletionItemKind.Value;
		item.documentation = o.documentation;
		item.insertText = new zycode.SnippetString(o.snippet);
		item.range = o.range;
		return item;
	}
}
