/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import { CommandManager } from '../commandManager';


// Copied from markdown language service
export enum DiagnosticCode {
	link_noSuchReferences = 'link.no-such-reference',
	link_noSuchHeaderInOwnFile = 'link.no-such-header-in-own-file',
	link_noSuchFile = 'link.no-such-file',
	link_noSuchHeaderInFile = 'link.no-such-header-in-file',
}


class AddToIgnoreLinksQuickFixProvider implements zycode.CodeActionProvider {

	private static readonly _addToIgnoreLinksCommandId = '_markdown.addToIgnoreLinks';

	private static readonly _metadata: zycode.CodeActionProviderMetadata = {
		providedCodeActionKinds: [
			zycode.CodeActionKind.QuickFix
		],
	};

	public static register(selector: zycode.DocumentSelector, commandManager: CommandManager): zycode.Disposable {
		const reg = zycode.languages.registerCodeActionsProvider(selector, new AddToIgnoreLinksQuickFixProvider(), AddToIgnoreLinksQuickFixProvider._metadata);
		const commandReg = commandManager.register({
			id: AddToIgnoreLinksQuickFixProvider._addToIgnoreLinksCommandId,
			execute(resource: zycode.Uri, path: string) {
				const settingId = 'validate.ignoredLinks';
				const config = zycode.workspace.getConfiguration('markdown', resource);
				const paths = new Set(config.get<string[]>(settingId, []));
				paths.add(path);
				config.update(settingId, [...paths], zycode.ConfigurationTarget.WorkspaceFolder);
			}
		});
		return zycode.Disposable.from(reg, commandReg);
	}

	provideCodeActions(document: zycode.TextDocument, _range: zycode.Range | zycode.Selection, context: zycode.CodeActionContext, _token: zycode.CancellationToken): zycode.ProviderResult<(zycode.CodeAction | zycode.Command)[]> {
		const fixes: zycode.CodeAction[] = [];

		for (const diagnostic of context.diagnostics) {
			switch (diagnostic.code) {
				case DiagnosticCode.link_noSuchReferences:
				case DiagnosticCode.link_noSuchHeaderInOwnFile:
				case DiagnosticCode.link_noSuchFile:
				case DiagnosticCode.link_noSuchHeaderInFile: {
					const hrefText = (diagnostic as any).data?.hrefText;
					if (hrefText) {
						const fix = new zycode.CodeAction(
							zycode.l10n.t("Exclude '{0}' from link validation.", hrefText),
							zycode.CodeActionKind.QuickFix);

						fix.command = {
							command: AddToIgnoreLinksQuickFixProvider._addToIgnoreLinksCommandId,
							title: '',
							arguments: [document.uri, hrefText],
						};
						fixes.push(fix);
					}
					break;
				}
			}
		}

		return fixes;
	}
}


export function registerDiagnosticSupport(
	selector: zycode.DocumentSelector,
	commandManager: CommandManager,
): zycode.Disposable {
	return AddToIgnoreLinksQuickFixProvider.register(selector, commandManager);
}
