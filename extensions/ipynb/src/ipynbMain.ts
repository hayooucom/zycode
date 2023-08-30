/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import { NotebookSerializer } from './notebookSerializer';
import { ensureAllNewCellsHaveCellIds } from './cellIdService';
import { notebookImagePasteSetup } from './notebookImagePaste';
import { AttachmentCleaner } from './notebookAttachmentCleaner';

// From {nbformat.INotebookMetadata} in @jupyterlab/coreutils
type NotebookMetadata = {
	kernelspec?: {
		name: string;
		display_name: string;
		[propName: string]: unknown;
	};
	language_info?: {
		name: string;
		codemirror_mode?: string | {};
		file_extension?: string;
		mimetype?: string;
		pygments_lexer?: string;
		[propName: string]: unknown;
	};
	orig_nbformat: number;
	[propName: string]: unknown;
};

export function activate(context: zycode.ExtensionContext) {
	const serializer = new NotebookSerializer(context);
	ensureAllNewCellsHaveCellIds(context);
	context.subscriptions.push(zycode.workspace.registerNotebookSerializer('jupyter-notebook', serializer, {
		transientOutputs: false,
		transientCellMetadata: {
			breakpointMargin: true,
			custom: false,
			attachments: false
		},
		cellContentMetadata: {
			attachments: true
		}
	} as zycode.NotebookDocumentContentOptions));

	context.subscriptions.push(zycode.workspace.registerNotebookSerializer('interactive', serializer, {
		transientOutputs: false,
		transientCellMetadata: {
			breakpointMargin: true,
			custom: false,
			attachments: false
		},
		cellContentMetadata: {
			attachments: true
		}
	} as zycode.NotebookDocumentContentOptions));

	zycode.languages.registerCodeLensProvider({ pattern: '**/*.ipynb' }, {
		provideCodeLenses: (document) => {
			if (
				document.uri.scheme === 'zycode-notebook-cell' ||
				document.uri.scheme === 'zycode-notebook-cell-metadata' ||
				document.uri.scheme === 'zycode-notebook-cell-output'
			) {
				return [];
			}
			const codelens = new zycode.CodeLens(new zycode.Range(0, 0, 0, 0), { title: 'Open in Notebook Editor', command: 'ipynb.openIpynbInNotebookEditor', arguments: [document.uri] });
			return [codelens];
		}
	});

	context.subscriptions.push(zycode.commands.registerCommand('ipynb.newUntitledIpynb', async () => {
		const language = 'python';
		const cell = new zycode.NotebookCellData(zycode.NotebookCellKind.Code, '', language);
		const data = new zycode.NotebookData([cell]);
		data.metadata = {
			custom: {
				cells: [],
				metadata: {
					orig_nbformat: 4
				},
				nbformat: 4,
				nbformat_minor: 2
			}
		};
		const doc = await zycode.workspace.openNotebookDocument('jupyter-notebook', data);
		await zycode.window.showNotebookDocument(doc);
	}));

	context.subscriptions.push(zycode.commands.registerCommand('ipynb.openIpynbInNotebookEditor', async (uri: zycode.Uri) => {
		if (zycode.window.activeTextEditor?.document.uri.toString() === uri.toString()) {
			await zycode.commands.executeCommand('workbench.action.closeActiveEditor');
		}
		const document = await zycode.workspace.openNotebookDocument(uri);
		await zycode.window.showNotebookDocument(document);
	}));

	context.subscriptions.push(notebookImagePasteSetup());

	const enabled = zycode.workspace.getConfiguration('ipynb').get('pasteImagesAsAttachments.enabled', false);
	if (enabled) {
		const cleaner = new AttachmentCleaner();
		context.subscriptions.push(cleaner);
	}

	// Update new file contribution
	zycode.extensions.onDidChange(() => {
		zycode.commands.executeCommand('setContext', 'jupyterEnabled', zycode.extensions.getExtension('ms-toolsai.jupyter'));
	});
	zycode.commands.executeCommand('setContext', 'jupyterEnabled', zycode.extensions.getExtension('ms-toolsai.jupyter'));


	return {
		exportNotebook: (notebook: zycode.NotebookData): string => {
			return exportNotebook(notebook, serializer);
		},
		setNotebookMetadata: async (resource: zycode.Uri, metadata: Partial<NotebookMetadata>): Promise<boolean> => {
			const document = zycode.workspace.notebookDocuments.find(doc => doc.uri.toString() === resource.toString());
			if (!document) {
				return false;
			}

			const edit = new zycode.WorkspaceEdit();
			edit.set(resource, [zycode.NotebookEdit.updateNotebookMetadata({
				...document.metadata,
				custom: {
					...(document.metadata.custom ?? {}),
					metadata: <NotebookMetadata>{
						...(document.metadata.custom?.metadata ?? {}),
						...metadata
					},
				}
			})]);
			return zycode.workspace.applyEdit(edit);
		},
	};
}

function exportNotebook(notebook: zycode.NotebookData, serializer: NotebookSerializer): string {
	return serializer.serializeNotebookToString(notebook);
}

export function deactivate() { }
