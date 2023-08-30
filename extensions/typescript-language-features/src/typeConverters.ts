/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Helpers for converting FROM zycode types TO ts types
 */

import * as zycode from 'zycode';
import type * as Proto from './tsServer/protocol/protocol';
import * as PConst from './tsServer/protocol/protocol.const';
import { ITypeScriptServiceClient } from './typescriptService';

export namespace Range {
	export const fromTextSpan = (span: Proto.TextSpan): zycode.Range =>
		fromLocations(span.start, span.end);

	export const toTextSpan = (range: zycode.Range): Proto.TextSpan => ({
		start: Position.toLocation(range.start),
		end: Position.toLocation(range.end)
	});

	export const fromLocations = (start: Proto.Location, end: Proto.Location): zycode.Range =>
		new zycode.Range(
			Math.max(0, start.line - 1), Math.max(start.offset - 1, 0),
			Math.max(0, end.line - 1), Math.max(0, end.offset - 1));

	export const toFileRangeRequestArgs = (file: string, range: zycode.Range): Proto.FileRangeRequestArgs => ({
		file,
		startLine: range.start.line + 1,
		startOffset: range.start.character + 1,
		endLine: range.end.line + 1,
		endOffset: range.end.character + 1
	});

	export const toFormattingRequestArgs = (file: string, range: zycode.Range): Proto.FormatRequestArgs => ({
		file,
		line: range.start.line + 1,
		offset: range.start.character + 1,
		endLine: range.end.line + 1,
		endOffset: range.end.character + 1
	});
}

export namespace Position {
	export const fromLocation = (tslocation: Proto.Location): zycode.Position =>
		new zycode.Position(tslocation.line - 1, tslocation.offset - 1);

	export const toLocation = (vsPosition: zycode.Position): Proto.Location => ({
		line: vsPosition.line + 1,
		offset: vsPosition.character + 1,
	});

	export const toFileLocationRequestArgs = (file: string, position: zycode.Position): Proto.FileLocationRequestArgs => ({
		file,
		line: position.line + 1,
		offset: position.character + 1,
	});
}

export namespace Location {
	export const fromTextSpan = (resource: zycode.Uri, tsTextSpan: Proto.TextSpan): zycode.Location =>
		new zycode.Location(resource, Range.fromTextSpan(tsTextSpan));
}

export namespace TextEdit {
	export const fromCodeEdit = (edit: Proto.CodeEdit): zycode.TextEdit =>
		new zycode.TextEdit(
			Range.fromTextSpan(edit),
			edit.newText);
}

export namespace WorkspaceEdit {
	export function fromFileCodeEdits(
		client: ITypeScriptServiceClient,
		edits: Iterable<Proto.FileCodeEdits>
	): zycode.WorkspaceEdit {
		return withFileCodeEdits(new zycode.WorkspaceEdit(), client, edits);
	}

	export function withFileCodeEdits(
		workspaceEdit: zycode.WorkspaceEdit,
		client: ITypeScriptServiceClient,
		edits: Iterable<Proto.FileCodeEdits>
	): zycode.WorkspaceEdit {
		for (const edit of edits) {
			const resource = client.toResource(edit.fileName);
			for (const textChange of edit.textChanges) {
				workspaceEdit.replace(resource,
					Range.fromTextSpan(textChange),
					textChange.newText);
			}
		}

		return workspaceEdit;
	}
}

export namespace SymbolKind {
	export function fromProtocolScriptElementKind(kind: Proto.ScriptElementKind) {
		switch (kind) {
			case PConst.Kind.module: return zycode.SymbolKind.Module;
			case PConst.Kind.class: return zycode.SymbolKind.Class;
			case PConst.Kind.enum: return zycode.SymbolKind.Enum;
			case PConst.Kind.enumMember: return zycode.SymbolKind.EnumMember;
			case PConst.Kind.interface: return zycode.SymbolKind.Interface;
			case PConst.Kind.indexSignature: return zycode.SymbolKind.Method;
			case PConst.Kind.callSignature: return zycode.SymbolKind.Method;
			case PConst.Kind.method: return zycode.SymbolKind.Method;
			case PConst.Kind.memberVariable: return zycode.SymbolKind.Property;
			case PConst.Kind.memberGetAccessor: return zycode.SymbolKind.Property;
			case PConst.Kind.memberSetAccessor: return zycode.SymbolKind.Property;
			case PConst.Kind.variable: return zycode.SymbolKind.Variable;
			case PConst.Kind.let: return zycode.SymbolKind.Variable;
			case PConst.Kind.const: return zycode.SymbolKind.Variable;
			case PConst.Kind.localVariable: return zycode.SymbolKind.Variable;
			case PConst.Kind.alias: return zycode.SymbolKind.Variable;
			case PConst.Kind.function: return zycode.SymbolKind.Function;
			case PConst.Kind.localFunction: return zycode.SymbolKind.Function;
			case PConst.Kind.constructSignature: return zycode.SymbolKind.Constructor;
			case PConst.Kind.constructorImplementation: return zycode.SymbolKind.Constructor;
			case PConst.Kind.typeParameter: return zycode.SymbolKind.TypeParameter;
			case PConst.Kind.string: return zycode.SymbolKind.String;
			default: return zycode.SymbolKind.Variable;
		}
	}
}

export namespace CompletionTriggerKind {
	export function toProtocolCompletionTriggerKind(kind: zycode.CompletionTriggerKind): Proto.CompletionTriggerKind {
		switch (kind) {
			case zycode.CompletionTriggerKind.Invoke: return 1;
			case zycode.CompletionTriggerKind.TriggerCharacter: return 2;
			case zycode.CompletionTriggerKind.TriggerForIncompleteCompletions: return 3;
		}
	}
}

export namespace OrganizeImportsMode {
	export function toProtocolOrganizeImportsMode(mode: PConst.OrganizeImportsMode): Proto.OrganizeImportsMode {
		switch (mode) {
			case PConst.OrganizeImportsMode.All: return 'All' as Proto.OrganizeImportsMode.All;
			case PConst.OrganizeImportsMode.SortAndCombine: return 'SortAndCombine' as Proto.OrganizeImportsMode.SortAndCombine;
			case PConst.OrganizeImportsMode.RemoveUnused: return 'RemoveUnused' as Proto.OrganizeImportsMode.RemoveUnused;
		}
	}
}
