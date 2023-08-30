/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import { MdLanguageClient } from '../client/client';
import * as proto from '../client/protocol';

enum OpenMarkdownLinks {
	beside = 'beside',
	currentGroup = 'currentGroup',
}

export class MdLinkOpener {

	constructor(
		private readonly _client: MdLanguageClient,
	) { }

	public async resolveDocumentLink(linkText: string, fromResource: zycode.Uri): Promise<proto.ResolvedDocumentLinkTarget> {
		return this._client.resolveLinkTarget(linkText, fromResource);
	}

	public async openDocumentLink(linkText: string, fromResource: zycode.Uri, viewColumn?: zycode.ViewColumn): Promise<void> {
		const resolved = await this._client.resolveLinkTarget(linkText, fromResource);
		if (!resolved) {
			return;
		}

		const uri = zycode.Uri.from(resolved.uri);
		switch (resolved.kind) {
			case 'external':
				return zycode.commands.executeCommand('zycode.open', uri);

			case 'folder':
				return zycode.commands.executeCommand('revealInExplorer', uri);

			case 'file': {
				// If no explicit viewColumn is given, check if the editor is already open in a tab
				if (typeof viewColumn === 'undefined') {
					for (const tab of zycode.window.tabGroups.all.flatMap(x => x.tabs)) {
						if (tab.input instanceof zycode.TabInputText) {
							if (tab.input.uri.fsPath === uri.fsPath) {
								viewColumn = tab.group.viewColumn;
								break;
							}
						}
					}
				}

				return zycode.commands.executeCommand('zycode.open', uri, <zycode.TextDocumentShowOptions>{
					selection: resolved.position ? new zycode.Range(resolved.position.line, resolved.position.character, resolved.position.line, resolved.position.character) : undefined,
					viewColumn: viewColumn ?? getViewColumn(fromResource),
				});
			}
		}
	}
}

function getViewColumn(resource: zycode.Uri): zycode.ViewColumn {
	const config = zycode.workspace.getConfiguration('markdown', resource);
	const openLinks = config.get<OpenMarkdownLinks>('links.openLocation', OpenMarkdownLinks.currentGroup);
	switch (openLinks) {
		case OpenMarkdownLinks.beside:
			return zycode.ViewColumn.Beside;
		case OpenMarkdownLinks.currentGroup:
		default:
			return zycode.ViewColumn.Active;
	}
}

