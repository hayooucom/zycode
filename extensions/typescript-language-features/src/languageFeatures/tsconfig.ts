/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as jsonc from 'jsonc-parser';
import { posix } from 'path';
import * as zycode from 'zycode';
import { Utils } from 'zycode-uri';
import { coalesce } from '../utils/arrays';
import { exists, looksLikeAbsoluteWindowsPath } from '../utils/fs';

function mapChildren<R>(node: jsonc.Node | undefined, f: (x: jsonc.Node) => R): R[] {
	return node && node.type === 'array' && node.children
		? node.children.map(f)
		: [];
}

const openExtendsLinkCommandId = '_typescript.openExtendsLink';
type OpenExtendsLinkCommandArgs = {
	readonly resourceUri: zycode.Uri;
	readonly extendsValue: string;
};


class TsconfigLinkProvider implements zycode.DocumentLinkProvider {

	public provideDocumentLinks(
		document: zycode.TextDocument,
		_token: zycode.CancellationToken
	): zycode.DocumentLink[] {
		const root = jsonc.parseTree(document.getText());
		if (!root) {
			return [];
		}

		return coalesce([
			this.getExtendsLink(document, root),
			...this.getFilesLinks(document, root),
			...this.getReferencesLinks(document, root)
		]);
	}

	private getExtendsLink(document: zycode.TextDocument, root: jsonc.Node): zycode.DocumentLink | undefined {
		const node = jsonc.findNodeAtLocation(root, ['extends']);
		return node && this.tryCreateTsConfigLink(document, node);
	}

	private getReferencesLinks(document: zycode.TextDocument, root: jsonc.Node) {
		return mapChildren(
			jsonc.findNodeAtLocation(root, ['references']),
			child => {
				const pathNode = jsonc.findNodeAtLocation(child, ['path']);
				return pathNode && this.tryCreateTsConfigLink(document, pathNode);
			});
	}

	private tryCreateTsConfigLink(document: zycode.TextDocument, node: jsonc.Node): zycode.DocumentLink | undefined {
		if (!this.isPathValue(node)) {
			return undefined;
		}

		const args: OpenExtendsLinkCommandArgs = {
			resourceUri: { ...document.uri.toJSON(), $mid: undefined },
			extendsValue: node.value
		};

		const link = new zycode.DocumentLink(
			this.getRange(document, node),
			zycode.Uri.parse(`command:${openExtendsLinkCommandId}?${JSON.stringify(args)}`));
		link.tooltip = zycode.l10n.t("Follow link");
		return link;
	}

	private getFilesLinks(document: zycode.TextDocument, root: jsonc.Node) {
		return mapChildren(
			jsonc.findNodeAtLocation(root, ['files']),
			child => this.pathNodeToLink(document, child));
	}

	private pathNodeToLink(
		document: zycode.TextDocument,
		node: jsonc.Node | undefined
	): zycode.DocumentLink | undefined {
		return this.isPathValue(node)
			? new zycode.DocumentLink(this.getRange(document, node), this.getFileTarget(document, node))
			: undefined;
	}

	private isPathValue(node: jsonc.Node | undefined): node is jsonc.Node {
		return node
			&& node.type === 'string'
			&& node.value
			&& !(node.value as string).includes('*'); // don't treat globs as links.
	}

	private getFileTarget(document: zycode.TextDocument, node: jsonc.Node): zycode.Uri {
		return zycode.Uri.joinPath(Utils.dirname(document.uri), node.value);
	}

	private getRange(document: zycode.TextDocument, node: jsonc.Node) {
		const offset = node.offset;
		const start = document.positionAt(offset + 1);
		const end = document.positionAt(offset + (node.length - 1));
		return new zycode.Range(start, end);
	}
}

async function resolveNodeModulesPath(baseDirUri: zycode.Uri, pathCandidates: string[]): Promise<zycode.Uri | undefined> {
	let currentUri = baseDirUri;
	const baseCandidate = pathCandidates[0];
	const sepIndex = baseCandidate.startsWith('@') ? 2 : 1;
	const moduleBasePath = baseCandidate.split(posix.sep).slice(0, sepIndex).join(posix.sep);
	while (true) {
		const moduleAbsoluteUrl = zycode.Uri.joinPath(currentUri, 'node_modules', moduleBasePath);
		let moduleStat: zycode.FileStat | undefined;
		try {
			moduleStat = await zycode.workspace.fs.stat(moduleAbsoluteUrl);
		} catch (err) {
			// noop
		}

		if (moduleStat && (moduleStat.type & zycode.FileType.Directory)) {
			for (const uriCandidate of pathCandidates
				.map((relativePath) => relativePath.split(posix.sep).slice(sepIndex).join(posix.sep))
				// skip empty paths within module
				.filter(Boolean)
				.map((relativeModulePath) => zycode.Uri.joinPath(moduleAbsoluteUrl, relativeModulePath))
			) {
				if (await exists(uriCandidate)) {
					return uriCandidate;
				}
			}
			// Continue to looking for potentially another version
		}

		const oldUri = currentUri;
		currentUri = zycode.Uri.joinPath(currentUri, '..');

		// Can't go next. Reached the system root
		if (oldUri.path === currentUri.path) {
			return;
		}
	}
}

// Reference: https://github.com/microsoft/TypeScript/blob/febfd442cdba343771f478cf433b0892f213ad2f/src/compiler/commandLineParser.ts#L3005
/**
* @returns Returns undefined in case of lack of result while trying to resolve from node_modules
*/
async function getTsconfigPath(baseDirUri: zycode.Uri, pathValue: string): Promise<zycode.Uri | undefined> {
	async function resolve(absolutePath: zycode.Uri): Promise<zycode.Uri> {
		if (absolutePath.path.endsWith('.json') || await exists(absolutePath)) {
			return absolutePath;
		}
		return absolutePath.with({
			path: `${absolutePath.path}.json`
		});
	}

	const isRelativePath = ['./', '../'].some(str => pathValue.startsWith(str));
	if (isRelativePath) {
		return resolve(zycode.Uri.joinPath(baseDirUri, pathValue));
	}

	if (pathValue.startsWith('/') || looksLikeAbsoluteWindowsPath(pathValue)) {
		return resolve(zycode.Uri.file(pathValue));
	}

	// Otherwise resolve like a module
	return resolveNodeModulesPath(baseDirUri, [
		pathValue,
		...pathValue.endsWith('.json') ? [] : [
			`${pathValue}.json`,
			`${pathValue}/tsconfig.json`,
		]
	]);
}

export function register() {
	const patterns: zycode.GlobPattern[] = [
		'**/[jt]sconfig.json',
		'**/[jt]sconfig.*.json',
	];

	const languages = ['json', 'jsonc'];

	const selector: zycode.DocumentSelector =
		languages.map(language => patterns.map((pattern): zycode.DocumentFilter => ({ language, pattern })))
			.flat();

	return zycode.Disposable.from(
		zycode.commands.registerCommand(openExtendsLinkCommandId, async ({ resourceUri, extendsValue, }: OpenExtendsLinkCommandArgs) => {
			const tsconfigPath = await getTsconfigPath(Utils.dirname(zycode.Uri.from(resourceUri)), extendsValue);
			if (tsconfigPath === undefined) {
				zycode.window.showErrorMessage(zycode.l10n.t("Failed to resolve {0} as module", extendsValue));
				return;
			}
			// Will suggest to create a .json variant if it doesn't exist yet (but only for relative paths)
			await zycode.commands.executeCommand('zycode.open', tsconfigPath);
		}),
		zycode.languages.registerDocumentLinkProvider(selector, new TsconfigLinkProvider()),
	);
}
