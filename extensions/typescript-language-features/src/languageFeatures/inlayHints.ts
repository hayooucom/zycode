/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import { DocumentSelector } from '../configuration/documentSelector';
import { LanguageDescription } from '../configuration/languageDescription';
import { TelemetryReporter } from '../logging/telemetry';
import { API } from '../tsServer/api';
import type * as Proto from '../tsServer/protocol/protocol';
import { Location, Position } from '../typeConverters';
import { ClientCapability, ITypeScriptServiceClient } from '../typescriptService';
import { Disposable } from '../utils/dispose';
import FileConfigurationManager, { InlayHintSettingNames, getInlayHintsPreferences } from './fileConfigurationManager';
import { conditionalRegistration, requireMinVersion, requireSomeCapability } from './util/dependentRegistration';


const inlayHintSettingNames = Object.freeze([
	InlayHintSettingNames.parameterNamesSuppressWhenArgumentMatchesName,
	InlayHintSettingNames.parameterNamesEnabled,
	InlayHintSettingNames.variableTypesEnabled,
	InlayHintSettingNames.variableTypesSuppressWhenTypeMatchesName,
	InlayHintSettingNames.propertyDeclarationTypesEnabled,
	InlayHintSettingNames.functionLikeReturnTypesEnabled,
	InlayHintSettingNames.enumMemberValuesEnabled,
]);

class TypeScriptInlayHintsProvider extends Disposable implements zycode.InlayHintsProvider {

	public static readonly minVersion = API.v440;

	private readonly _onDidChangeInlayHints = this._register(new zycode.EventEmitter<void>());
	public readonly onDidChangeInlayHints = this._onDidChangeInlayHints.event;

	private hasReportedTelemetry = false;

	constructor(
		private readonly language: LanguageDescription,
		private readonly client: ITypeScriptServiceClient,
		private readonly fileConfigurationManager: FileConfigurationManager,
		private readonly telemetryReporter: TelemetryReporter,
	) {
		super();

		this._register(zycode.workspace.onDidChangeConfiguration(e => {
			if (inlayHintSettingNames.some(settingName => e.affectsConfiguration(language.id + '.' + settingName))) {
				this._onDidChangeInlayHints.fire();
			}
		}));

		// When a JS/TS file changes, change inlay hints for all visible editors
		// since changes in one file can effect the hints the others.
		this._register(zycode.workspace.onDidChangeTextDocument(e => {
			if (language.languageIds.includes(e.document.languageId)) {
				this._onDidChangeInlayHints.fire();
			}
		}));
	}

	async provideInlayHints(model: zycode.TextDocument, range: zycode.Range, token: zycode.CancellationToken): Promise<zycode.InlayHint[] | undefined> {
		const filepath = this.client.toOpenTsFilePath(model);
		if (!filepath) {
			return;
		}

		if (!areInlayHintsEnabledForFile(this.language, model)) {
			return;
		}

		const start = model.offsetAt(range.start);
		const length = model.offsetAt(range.end) - start;

		await this.fileConfigurationManager.ensureConfigurationForDocument(model, token);
		if (token.isCancellationRequested) {
			return;
		}

		if (!this.hasReportedTelemetry) {
			this.hasReportedTelemetry = true;
			/* __GDPR__
				"inlayHints.provide" : {
					"owner": "mjbvz",
					"${include}": [
						"${TypeScriptCommonProperties}"
					]
				}
			*/
			this.telemetryReporter.logTelemetry('inlayHints.provide', {});
		}

		const response = await this.client.execute('provideInlayHints', { file: filepath, start, length }, token);
		if (response.type !== 'response' || !response.success || !response.body) {
			return;
		}

		return response.body.map(hint => {
			const result = new zycode.InlayHint(
				Position.fromLocation(hint.position),
				this.convertInlayHintText(hint),
				fromProtocolInlayHintKind(hint.kind)
			);
			result.paddingLeft = hint.whitespaceBefore;
			result.paddingRight = hint.whitespaceAfter;
			return result;
		});
	}

	private convertInlayHintText(tsHint: Proto.InlayHintItem): string | zycode.InlayHintLabelPart[] {
		if (tsHint.displayParts) {
			return tsHint.displayParts.map((part): zycode.InlayHintLabelPart => {
				const out = new zycode.InlayHintLabelPart(part.text);
				if (part.span) {
					out.location = Location.fromTextSpan(this.client.toResource(part.span.file), part.span);
				}
				return out;
			});
		}

		return tsHint.text;
	}
}

function fromProtocolInlayHintKind(kind: Proto.InlayHintKind): zycode.InlayHintKind | undefined {
	switch (kind) {
		case 'Parameter': return zycode.InlayHintKind.Parameter;
		case 'Type': return zycode.InlayHintKind.Type;
		case 'Enum': return undefined;
		default: return undefined;
	}
}

function areInlayHintsEnabledForFile(language: LanguageDescription, document: zycode.TextDocument) {
	const config = zycode.workspace.getConfiguration(language.id, document);
	const preferences = getInlayHintsPreferences(config);

	return preferences.includeInlayParameterNameHints === 'literals' ||
		preferences.includeInlayParameterNameHints === 'all' ||
		preferences.includeInlayEnumMemberValueHints ||
		preferences.includeInlayFunctionLikeReturnTypeHints ||
		preferences.includeInlayFunctionParameterTypeHints ||
		preferences.includeInlayPropertyDeclarationTypeHints ||
		preferences.includeInlayVariableTypeHints;
}

export function register(
	selector: DocumentSelector,
	language: LanguageDescription,
	client: ITypeScriptServiceClient,
	fileConfigurationManager: FileConfigurationManager,
	telemetryReporter: TelemetryReporter,
) {
	return conditionalRegistration([
		requireMinVersion(client, TypeScriptInlayHintsProvider.minVersion),
		requireSomeCapability(client, ClientCapability.Semantic),
	], () => {
		const provider = new TypeScriptInlayHintsProvider(language, client, fileConfigurationManager, telemetryReporter);
		return zycode.languages.registerInlayHintsProvider(selector.semantic, provider);
	});
}
