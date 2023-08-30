/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getLocation, JSONPath, parse, visit, Location } from 'jsonc-parser';
import * as zycode from 'zycode';
import { SettingsDocument } from './settingsDocumentHelper';
import { provideInstalledExtensionProposals } from './extensionsProposals';
import './importExportProfiles';

export function activate(context: zycode.ExtensionContext): void {
	//settings.json suggestions
	context.subscriptions.push(registerSettingsCompletions());

	//extensions suggestions
	context.subscriptions.push(...registerExtensionsCompletions());

	// launch.json variable suggestions
	context.subscriptions.push(registerVariableCompletions('**/launch.json'));

	// task.json variable suggestions
	context.subscriptions.push(registerVariableCompletions('**/tasks.json'));

	// Workspace file launch/tasks variable completions
	context.subscriptions.push(registerVariableCompletions('**/*.code-workspace'));

	// keybindings.json/package.json context key suggestions
	context.subscriptions.push(registerContextKeyCompletions());
}

function registerSettingsCompletions(): zycode.Disposable {
	return zycode.languages.registerCompletionItemProvider({ language: 'jsonc', pattern: '**/settings.json' }, {
		provideCompletionItems(document, position, token) {
			return new SettingsDocument(document).provideCompletionItems(position, token);
		}
	});
}

function registerVariableCompletions(pattern: string): zycode.Disposable {
	return zycode.languages.registerCompletionItemProvider({ language: 'jsonc', pattern }, {
		provideCompletionItems(document, position, _token) {
			const location = getLocation(document.getText(), document.offsetAt(position));
			if (isCompletingInsidePropertyStringValue(document, location, position)) {
				if (document.fileName.endsWith('.code-workspace') && !isLocationInsideTopLevelProperty(location, ['launch', 'tasks'])) {
					return [];
				}

				let range = document.getWordRangeAtPosition(position, /\$\{[^"\}]*\}?/);
				if (!range || range.start.isEqual(position) || range.end.isEqual(position) && document.getText(range).endsWith('}')) {
					range = new zycode.Range(position, position);
				}

				return [
					{ label: 'workspaceFolder', detail: zycode.l10n.t("The path of the folder opened in VS Code") },
					{ label: 'workspaceFolderBasename', detail: zycode.l10n.t("The name of the folder opened in VS Code without any slashes (/)") },
					{ label: 'relativeFile', detail: zycode.l10n.t("The current opened file relative to ${workspaceFolder}") },
					{ label: 'relativeFileDirname', detail: zycode.l10n.t("The current opened file's dirname relative to ${workspaceFolder}") },
					{ label: 'file', detail: zycode.l10n.t("The current opened file") },
					{ label: 'cwd', detail: zycode.l10n.t("The task runner's current working directory on startup") },
					{ label: 'lineNumber', detail: zycode.l10n.t("The current selected line number in the active file") },
					{ label: 'selectedText', detail: zycode.l10n.t("The current selected text in the active file") },
					{ label: 'fileDirname', detail: zycode.l10n.t("The current opened file's dirname") },
					{ label: 'fileExtname', detail: zycode.l10n.t("The current opened file's extension") },
					{ label: 'fileBasename', detail: zycode.l10n.t("The current opened file's basename") },
					{ label: 'fileBasenameNoExtension', detail: zycode.l10n.t("The current opened file's basename with no file extension") },
					{ label: 'defaultBuildTask', detail: zycode.l10n.t("The name of the default build task. If there is not a single default build task then a quick pick is shown to choose the build task.") },
					{ label: 'pathSeparator', detail: zycode.l10n.t("The character used by the operating system to separate components in file paths") },
					{ label: 'extensionInstallFolder', detail: zycode.l10n.t("The path where an an extension is installed."), param: 'publisher.extension' },
				].map(variable => ({
					label: `\${${variable.label}}`,
					range,
					insertText: variable.param ? new zycode.SnippetString(`\${${variable.label}:`).appendPlaceholder(variable.param).appendText('}') : (`\${${variable.label}}`),
					detail: variable.detail
				}));
			}

			return [];
		}
	});
}

function isCompletingInsidePropertyStringValue(document: zycode.TextDocument, location: Location, pos: zycode.Position) {
	if (location.isAtPropertyKey) {
		return false;
	}
	const previousNode = location.previousNode;
	if (previousNode && previousNode.type === 'string') {
		const offset = document.offsetAt(pos);
		return offset > previousNode.offset && offset < previousNode.offset + previousNode.length;
	}
	return false;
}

function isLocationInsideTopLevelProperty(location: Location, values: string[]) {
	return values.includes(location.path[0] as string);
}

interface IExtensionsContent {
	recommendations: string[];
}

function registerExtensionsCompletions(): zycode.Disposable[] {
	return [registerExtensionsCompletionsInExtensionsDocument(), registerExtensionsCompletionsInWorkspaceConfigurationDocument()];
}

function registerExtensionsCompletionsInExtensionsDocument(): zycode.Disposable {
	return zycode.languages.registerCompletionItemProvider({ pattern: '**/extensions.json' }, {
		provideCompletionItems(document, position, _token) {
			const location = getLocation(document.getText(), document.offsetAt(position));
			if (location.path[0] === 'recommendations') {
				const range = getReplaceRange(document, location, position);
				const extensionsContent = <IExtensionsContent>parse(document.getText());
				return provideInstalledExtensionProposals(extensionsContent && extensionsContent.recommendations || [], '', range, false);
			}
			return [];
		}
	});
}

function registerExtensionsCompletionsInWorkspaceConfigurationDocument(): zycode.Disposable {
	return zycode.languages.registerCompletionItemProvider({ pattern: '**/*.code-workspace' }, {
		provideCompletionItems(document, position, _token) {
			const location = getLocation(document.getText(), document.offsetAt(position));
			if (location.path[0] === 'extensions' && location.path[1] === 'recommendations') {
				const range = getReplaceRange(document, location, position);
				const extensionsContent = <IExtensionsContent>parse(document.getText())['extensions'];
				return provideInstalledExtensionProposals(extensionsContent && extensionsContent.recommendations || [], '', range, false);
			}
			return [];
		}
	});
}

function getReplaceRange(document: zycode.TextDocument, location: Location, position: zycode.Position) {
	const node = location.previousNode;
	if (node) {
		const nodeStart = document.positionAt(node.offset), nodeEnd = document.positionAt(node.offset + node.length);
		if (nodeStart.isBeforeOrEqual(position) && nodeEnd.isAfterOrEqual(position)) {
			return new zycode.Range(nodeStart, nodeEnd);
		}
	}
	return new zycode.Range(position, position);
}

zycode.languages.registerDocumentSymbolProvider({ pattern: '**/launch.json', language: 'jsonc' }, {
	provideDocumentSymbols(document: zycode.TextDocument, _token: zycode.CancellationToken): zycode.ProviderResult<zycode.SymbolInformation[]> {
		const result: zycode.SymbolInformation[] = [];
		let name: string = '';
		let lastProperty = '';
		let startOffset = 0;
		let depthInObjects = 0;

		visit(document.getText(), {
			onObjectProperty: (property, _offset, _length) => {
				lastProperty = property;
			},
			onLiteralValue: (value: any, _offset: number, _length: number) => {
				if (lastProperty === 'name') {
					name = value;
				}
			},
			onObjectBegin: (offset: number, _length: number) => {
				depthInObjects++;
				if (depthInObjects === 2) {
					startOffset = offset;
				}
			},
			onObjectEnd: (offset: number, _length: number) => {
				if (name && depthInObjects === 2) {
					result.push(new zycode.SymbolInformation(name, zycode.SymbolKind.Object, new zycode.Range(document.positionAt(startOffset), document.positionAt(offset))));
				}
				depthInObjects--;
			},
		});

		return result;
	}
}, { label: 'Launch Targets' });

function registerContextKeyCompletions(): zycode.Disposable {
	type ContextKeyInfo = { key: string; type?: string; description?: string };

	const paths = new Map<zycode.DocumentFilter, JSONPath[]>([
		[{ language: 'jsonc', pattern: '**/keybindings.json' }, [
			['*', 'when']
		]],
		[{ language: 'json', pattern: '**/package.json' }, [
			['contributes', 'menus', '*', '*', 'when'],
			['contributes', 'views', '*', '*', 'when'],
			['contributes', 'viewsWelcome', '*', 'when'],
			['contributes', 'keybindings', '*', 'when'],
			['contributes', 'keybindings', 'when'],
		]]
	]);

	return zycode.languages.registerCompletionItemProvider(
		[...paths.keys()],
		{
			async provideCompletionItems(document: zycode.TextDocument, position: zycode.Position, token: zycode.CancellationToken) {

				const location = getLocation(document.getText(), document.offsetAt(position));

				if (location.isAtPropertyKey) {
					return;
				}

				let isValidLocation = false;
				for (const [key, value] of paths) {
					if (zycode.languages.match(key, document)) {
						if (value.some(location.matches.bind(location))) {
							isValidLocation = true;
							break;
						}
					}
				}

				if (!isValidLocation || !isCompletingInsidePropertyStringValue(document, location, position)) {
					return;
				}

				const replacing = document.getWordRangeAtPosition(position, /[a-zA-Z.]+/) || new zycode.Range(position, position);
				const inserting = replacing.with(undefined, position);

				const data = await zycode.commands.executeCommand<ContextKeyInfo[]>('getContextKeyInfo');
				if (token.isCancellationRequested || !data) {
					return;
				}

				const result = new zycode.CompletionList();
				for (const item of data) {
					const completion = new zycode.CompletionItem(item.key, zycode.CompletionItemKind.Constant);
					completion.detail = item.type;
					completion.range = { replacing, inserting };
					completion.documentation = item.description;
					result.items.push(completion);
				}
				return result;
			}
		}
	);
}
