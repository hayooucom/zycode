/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as picomatch from 'picomatch';
import * as zycode from 'zycode';
import { Utils } from 'zycode-uri';
import { getParentDocumentUri } from '../../util/document';

type OverwriteBehavior = 'overwrite' | 'nameIncrementally';

interface CopyFileConfiguration {
	readonly destination: Record<string, string>;
	readonly overwriteBehavior: OverwriteBehavior;
}

function getCopyFileConfiguration(document: zycode.TextDocument): CopyFileConfiguration {
	const config = zycode.workspace.getConfiguration('markdown', document);
	return {
		destination: config.get<Record<string, string>>('copyFiles.destination') ?? {},
		overwriteBehavior: readOverwriteBehavior(config),
	};
}

function readOverwriteBehavior(config: zycode.WorkspaceConfiguration): OverwriteBehavior {
	switch (config.get('copyFiles.overwriteBehavior')) {
		case 'overwrite': return 'overwrite';
		default: return 'nameIncrementally';
	}
}

export class NewFilePathGenerator {

	private readonly _usedPaths = new Set<string>();

	async getNewFilePath(
		document: zycode.TextDocument,
		file: zycode.DataTransferFile,
		token: zycode.CancellationToken,
	): Promise<{ readonly uri: zycode.Uri; readonly overwrite: boolean } | undefined> {
		const config = getCopyFileConfiguration(document);
		const desiredPath = getDesiredNewFilePath(config, document, file);

		const root = Utils.dirname(desiredPath);
		const ext = Utils.extname(desiredPath);
		let baseName = Utils.basename(desiredPath);
		baseName = baseName.slice(0, baseName.length - ext.length);
		for (let i = 0; ; ++i) {
			if (token.isCancellationRequested) {
				return undefined;
			}

			const name = i === 0 ? baseName : `${baseName}-${i}`;
			const uri = zycode.Uri.joinPath(root, name + ext);
			if (this._wasPathAlreadyUsed(uri)) {
				continue;
			}

			// Try overwriting if it already exists
			if (config.overwriteBehavior === 'overwrite') {
				this._usedPaths.add(uri.toString());
				return { uri, overwrite: true };
			}

			// Otherwise we need to check the fs to see if it exists
			try {
				await zycode.workspace.fs.stat(uri);
			} catch {
				if (!this._wasPathAlreadyUsed(uri)) {
					// Does not exist
					this._usedPaths.add(uri.toString());
					return { uri, overwrite: false };
				}
			}
		}
	}

	private _wasPathAlreadyUsed(uri: zycode.Uri) {
		return this._usedPaths.has(uri.toString());
	}
}

function getDesiredNewFilePath(config: CopyFileConfiguration, document: zycode.TextDocument, file: zycode.DataTransferFile): zycode.Uri {
	const docUri = getParentDocumentUri(document.uri);
	for (const [rawGlob, rawDest] of Object.entries(config.destination)) {
		for (const glob of parseGlob(rawGlob)) {
			if (picomatch.isMatch(docUri.path, glob, { dot: true })) {
				return resolveCopyDestination(docUri, file.name, rawDest, uri => zycode.workspace.getWorkspaceFolder(uri)?.uri);
			}
		}
	}

	// Default to next to current file
	return zycode.Uri.joinPath(Utils.dirname(docUri), file.name);
}

function parseGlob(rawGlob: string): Iterable<string> {
	if (rawGlob.startsWith('/')) {
		// Anchor to workspace folders
		return (zycode.workspace.workspaceFolders ?? []).map(folder => zycode.Uri.joinPath(folder.uri, rawGlob).path);
	}

	// Relative path, so implicitly track on ** to match everything
	if (!rawGlob.startsWith('**')) {
		return ['**/' + rawGlob];
	}

	return [rawGlob];
}

type GetWorkspaceFolder = (documentUri: zycode.Uri) => zycode.Uri | undefined;

export function resolveCopyDestination(documentUri: zycode.Uri, fileName: string, dest: string, getWorkspaceFolder: GetWorkspaceFolder): zycode.Uri {
	const resolvedDest = resolveCopyDestinationSetting(documentUri, fileName, dest, getWorkspaceFolder);

	if (resolvedDest.startsWith('/')) {
		// Absolute path
		return Utils.resolvePath(documentUri, resolvedDest);
	}

	// Relative to document
	const dirName = Utils.dirname(documentUri);
	return Utils.resolvePath(dirName, resolvedDest);
}


function resolveCopyDestinationSetting(documentUri: zycode.Uri, fileName: string, dest: string, getWorkspaceFolder: GetWorkspaceFolder): string {
	let outDest = dest.trim();
	if (!outDest) {
		outDest = '${fileName}';
	}

	// Destination that start with `/` implicitly means go to workspace root
	if (outDest.startsWith('/')) {
		outDest = '${documentWorkspaceFolder}/' + outDest.slice(1);
	}

	// Destination that ends with `/` implicitly needs a fileName
	if (outDest.endsWith('/')) {
		outDest += '${fileName}';
	}

	const documentDirName = Utils.dirname(documentUri);
	const documentBaseName = Utils.basename(documentUri);
	const documentExtName = Utils.extname(documentUri);

	const workspaceFolder = getWorkspaceFolder(documentUri);

	const vars = new Map<string, string>([
		['documentDirName', documentDirName.path], //  Parent directory path
		['documentFileName', documentBaseName], // Full filename: file.md
		['documentBaseName', documentBaseName.slice(0, documentBaseName.length - documentExtName.length)], // Just the name: file
		['documentExtName', documentExtName.replace('.', '')], // Just the file ext: md

		// Workspace
		['documentWorkspaceFolder', (workspaceFolder ?? documentDirName).path],

		// File
		['fileName', fileName],// Full file name
	]);

	return outDest.replaceAll(/\$\{(\w+)(?:\/([^\}]+?)\/([^\}]+?)\/)?\}/g, (_, name, pattern, replacement) => {
		const entry = vars.get(name);
		if (!entry) {
			return '';
		}

		if (pattern && replacement) {
			return entry.replace(new RegExp(pattern), replacement);
		}

		return entry;
	});
}
