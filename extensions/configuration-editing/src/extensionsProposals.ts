/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';


export async function provideInstalledExtensionProposals(existing: string[], additionalText: string, range: zycode.Range, includeBuiltinExtensions: boolean): Promise<zycode.CompletionItem[] | zycode.CompletionList> {
	if (Array.isArray(existing)) {
		const extensions = includeBuiltinExtensions ? zycode.extensions.all : zycode.extensions.all.filter(e => !(e.id.startsWith('zycode.') || e.id === 'Microsoft.zycode-markdown'));
		const knownExtensionProposals = extensions.filter(e => existing.indexOf(e.id) === -1);
		if (knownExtensionProposals.length) {
			return knownExtensionProposals.map(e => {
				const item = new zycode.CompletionItem(e.id);
				const insertText = `"${e.id}"${additionalText}`;
				item.kind = zycode.CompletionItemKind.Value;
				item.insertText = insertText;
				item.range = range;
				item.filterText = insertText;
				return item;
			});
		} else {
			const example = new zycode.CompletionItem(zycode.l10n.t("Example"));
			example.insertText = '"zycode.csharp"';
			example.kind = zycode.CompletionItemKind.Value;
			example.range = range;
			return [example];
		}
	}
	return [];
}

export async function provideWorkspaceTrustExtensionProposals(existing: string[], range: zycode.Range): Promise<zycode.CompletionItem[] | zycode.CompletionList> {
	if (Array.isArray(existing)) {
		const extensions = zycode.extensions.all.filter(e => e.packageJSON.main);
		const extensionProposals = extensions.filter(e => existing.indexOf(e.id) === -1);
		if (extensionProposals.length) {
			return extensionProposals.map(e => {
				const item = new zycode.CompletionItem(e.id);
				const insertText = `"${e.id}": {\n\t"supported": false,\n\t"version": "${e.packageJSON.version}"\n}`;
				item.kind = zycode.CompletionItemKind.Value;
				item.insertText = insertText;
				item.range = range;
				item.filterText = insertText;
				return item;
			});
		} else {
			const example = new zycode.CompletionItem(zycode.l10n.t("Example"));
			example.insertText = '"zycode.csharp: {\n\t"supported": false,\n\t"version": "0.0.0"\n}`;"';
			example.kind = zycode.CompletionItemKind.Value;
			example.range = range;
			return [example];
		}
	}

	return [];
}
