/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as zycode from 'zycode';

export interface IMergeRegion {
	name: string;
	header: zycode.Range;
	content: zycode.Range;
	decoratorContent: zycode.Range;
}

export const enum CommitType {
	Current,
	Incoming,
	Both
}

export interface IExtensionConfiguration {
	enableCodeLens: boolean;
	enableDecorations: boolean;
	enableEditorOverview: boolean;
}

export interface IDocumentMergeConflict extends IDocumentMergeConflictDescriptor {
	commitEdit(type: CommitType, editor: zycode.TextEditor, edit?: zycode.TextEditorEdit): Thenable<boolean>;
	applyEdit(type: CommitType, document: zycode.TextDocument, edit: { replace(range: zycode.Range, newText: string): void }): void;
}

export interface IDocumentMergeConflictDescriptor {
	range: zycode.Range;
	current: IMergeRegion;
	incoming: IMergeRegion;
	commonAncestors: IMergeRegion[];
	splitter: zycode.Range;
}

export interface IDocumentMergeConflictTracker {
	getConflicts(document: zycode.TextDocument): PromiseLike<IDocumentMergeConflict[]>;
	isPending(document: zycode.TextDocument): boolean;
	forget(document: zycode.TextDocument): void;
}

export interface IDocumentMergeConflictTrackerService {
	createTracker(origin: string): IDocumentMergeConflictTracker;
	forget(document: zycode.TextDocument): void;
}
