/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import { Utils } from 'zycode-uri';
import { Command } from '../commandManager';
import { createUriListSnippet, mediaFileExtensions } from '../languageFeatures/copyFiles/shared';
import { coalesce } from '../util/arrays';
import { getParentDocumentUri } from '../util/document';
import { Schemes } from '../util/schemes';


export class InsertLinkFromWorkspace implements Command {
	public readonly id = 'markdown.editor.insertLinkFromWorkspace';

	public async execute(resources?: zycode.Uri[]) {
		const activeEditor = zycode.window.activeTextEditor;
		if (!activeEditor) {
			return;
		}

		resources ??= await zycode.window.showOpenDialog({
			canSelectFiles: true,
			canSelectFolders: false,
			canSelectMany: true,
			openLabel: zycode.l10n.t("Insert link"),
			title: zycode.l10n.t("Insert link"),
			defaultUri: getDefaultUri(activeEditor.document),
		});

		return insertLink(activeEditor, resources ?? [], false);
	}
}

export class InsertImageFromWorkspace implements Command {
	public readonly id = 'markdown.editor.insertImageFromWorkspace';

	public async execute(resources?: zycode.Uri[]) {
		const activeEditor = zycode.window.activeTextEditor;
		if (!activeEditor) {
			return;
		}

		resources ??= await zycode.window.showOpenDialog({
			canSelectFiles: true,
			canSelectFolders: false,
			canSelectMany: true,
			filters: {
				[zycode.l10n.t("Media")]: Array.from(mediaFileExtensions.keys())
			},
			openLabel: zycode.l10n.t("Insert image"),
			title: zycode.l10n.t("Insert image"),
			defaultUri: getDefaultUri(activeEditor.document),
		});

		return insertLink(activeEditor, resources ?? [], true);
	}
}

function getDefaultUri(document: zycode.TextDocument) {
	const docUri = getParentDocumentUri(document.uri);
	if (docUri.scheme === Schemes.untitled) {
		return zycode.workspace.workspaceFolders?.[0]?.uri;
	}
	return Utils.dirname(docUri);
}

async function insertLink(activeEditor: zycode.TextEditor, selectedFiles: zycode.Uri[], insertAsImage: boolean): Promise<void> {
	if (!selectedFiles.length) {
		return;
	}

	const edit = createInsertLinkEdit(activeEditor, selectedFiles, insertAsImage);
	await zycode.workspace.applyEdit(edit);
}

function createInsertLinkEdit(activeEditor: zycode.TextEditor, selectedFiles: zycode.Uri[], insertAsMedia: boolean, title = '', placeholderValue = 0, pasteAsMarkdownLink = true, isExternalLink = false) {
	const snippetEdits = coalesce(activeEditor.selections.map((selection, i): zycode.SnippetTextEdit | undefined => {
		const selectionText = activeEditor.document.getText(selection);
		const snippet = createUriListSnippet(activeEditor.document, selectedFiles, [], title, placeholderValue, pasteAsMarkdownLink, isExternalLink, {
			insertAsMedia,
			placeholderText: selectionText,
			placeholderStartIndex: (i + 1) * selectedFiles.length,
			separator: insertAsMedia ? '\n' : ' ',
		});

		return snippet ? new zycode.SnippetTextEdit(selection, snippet.snippet) : undefined;
	}));

	const edit = new zycode.WorkspaceEdit();
	edit.set(activeEditor.document.uri, snippetEdits);
	return edit;
}
