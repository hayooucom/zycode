/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { setUnexpectedErrorHandler, errorHandler } from 'vs/base/common/errors';
import { URI } from 'vs/base/common/uri';
import { Event } from 'vs/base/common/event';
import * as types from 'vs/workbench/api/common/extHostTypes';
import { createTextModel } from 'vs/editor/test/common/testTextModel';
import { TestRPCProtocol } from 'vs/workbench/api/test/common/testRPCProtocol';
import { MarkerService } from 'vs/platform/markers/common/markerService';
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { ICommandService, CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IModelService } from 'vs/editor/common/services/model';
import { ExtHostLanguageFeatures } from 'vs/workbench/api/common/extHostLanguageFeatures';
import { MainThreadLanguageFeatures } from 'vs/workbench/api/browser/mainThreadLanguageFeatures';
import { ExtHostApiCommands } from 'vs/workbench/api/common/extHostApiCommands';
import { ExtHostCommands } from 'vs/workbench/api/common/extHostCommands';
import { MainThreadCommands } from 'vs/workbench/api/browser/mainThreadCommands';
import { ExtHostDocuments } from 'vs/workbench/api/common/extHostDocuments';
import { ExtHostDocumentsAndEditors } from 'vs/workbench/api/common/extHostDocumentsAndEditors';
import { MainContext, ExtHostContext } from 'vs/workbench/api/common/extHost.protocol';
import { ExtHostDiagnostics } from 'vs/workbench/api/common/extHostDiagnostics';
import type * as zycode from 'zycode';
import 'vs/workbench/contrib/search/browser/search.contribution';
import { ILogService, NullLogService } from 'vs/platform/log/common/log';
import { ITextModel } from 'vs/editor/common/model';
import { nullExtensionDescription, IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { dispose, ImmortalReference } from 'vs/base/common/lifecycle';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { mock } from 'vs/base/test/common/mock';
import { NullApiDeprecationService } from 'vs/workbench/api/common/extHostApiDeprecationService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { IResolvedTextEditorModel, ITextModelService } from 'vs/editor/common/services/resolverService';
import { IExtHostFileSystemInfo } from 'vs/workbench/api/common/extHostFileSystemInfo';
import { URITransformerService } from 'vs/workbench/api/common/extHostUriTransformerService';
import { IOutlineModelService, OutlineModelService } from 'vs/editor/contrib/documentSymbols/browser/outlineModel';
import { ILanguageFeatureDebounceService, LanguageFeatureDebounceService } from 'vs/editor/common/services/languageFeatureDebounce';

import 'vs/editor/contrib/codeAction/browser/codeAction';
import 'vs/editor/contrib/codelens/browser/codelens';
import 'vs/editor/contrib/colorPicker/browser/color';
import 'vs/editor/contrib/format/browser/format';
import 'vs/editor/contrib/gotoSymbol/browser/goToCommands';
import 'vs/editor/contrib/documentSymbols/browser/documentSymbols';
import 'vs/editor/contrib/hover/browser/getHover';
import 'vs/editor/contrib/links/browser/getLinks';
import 'vs/editor/contrib/parameterHints/browser/provideSignatureHelp';
import 'vs/editor/contrib/smartSelect/browser/smartSelect';
import 'vs/editor/contrib/suggest/browser/suggest';
import 'vs/editor/contrib/rename/browser/rename';
import 'vs/editor/contrib/inlayHints/browser/inlayHintsController';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { LanguageFeaturesService } from 'vs/editor/common/services/languageFeaturesService';
import { assertType } from 'vs/base/common/types';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { IExtHostTelemetry } from 'vs/workbench/api/common/extHostTelemetry';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

function assertRejects(fn: () => Promise<any>, message: string = 'Expected rejection') {
	return fn().then(() => assert.ok(false, message), _err => assert.ok(true));
}

function isLocation(value: zycode.Location | zycode.LocationLink): value is zycode.Location {
	const candidate = value as zycode.Location;
	return candidate && candidate.uri instanceof URI && candidate.range instanceof types.Range;
}

suite('ExtHostLanguageFeatureCommands', function () {
	const defaultSelector = { scheme: 'far' };
	let model: ITextModel;

	let rpcProtocol: TestRPCProtocol;
	let extHost: ExtHostLanguageFeatures;
	let mainThread: MainThreadLanguageFeatures;
	let commands: ExtHostCommands;
	let disposables: zycode.Disposable[] = [];

	let originalErrorHandler: (e: any) => any;

	suiteSetup(() => {
		model = createTextModel(
			[
				'This is the first line',
				'This is the second line',
				'This is the third line',
			].join('\n'),
			undefined,
			undefined,
			URI.parse('far://testing/file.b'));
		originalErrorHandler = errorHandler.getUnexpectedErrorHandler();
		setUnexpectedErrorHandler(() => { });

		// Use IInstantiationService to get typechecking when instantiating
		rpcProtocol = new TestRPCProtocol();
		const services = new ServiceCollection();
		services.set(IUriIdentityService, new class extends mock<IUriIdentityService>() {
			override asCanonicalUri(uri: URI): URI {
				return uri;
			}
		});
		services.set(ILanguageFeaturesService, new SyncDescriptor(LanguageFeaturesService));
		services.set(IExtensionService, new class extends mock<IExtensionService>() {
			override async activateByEvent() {

			}
			override activationEventIsDone(activationEvent: string): boolean {
				return true;
			}
		});
		services.set(ICommandService, new SyncDescriptor(class extends mock<ICommandService>() {

			override executeCommand(id: string, ...args: any): any {
				const command = CommandsRegistry.getCommands().get(id);
				if (!command) {
					return Promise.reject(new Error(id + ' NOT known'));
				}
				const { handler } = command;
				return Promise.resolve(insta.invokeFunction(handler, ...args));
			}
		}));
		services.set(IEnvironmentService, new class extends mock<IEnvironmentService>() {
			override isBuilt: boolean = true;
			override isExtensionDevelopment: boolean = false;
		});
		services.set(IMarkerService, new MarkerService());
		services.set(ILogService, new SyncDescriptor(NullLogService));
		services.set(ILanguageFeatureDebounceService, new SyncDescriptor(LanguageFeatureDebounceService));
		services.set(IModelService, new class extends mock<IModelService>() {
			override getModel() { return model; }
			override onModelRemoved = Event.None;
		});
		services.set(ITextModelService, new class extends mock<ITextModelService>() {
			override async createModelReference() {
				return new ImmortalReference<IResolvedTextEditorModel>(new class extends mock<IResolvedTextEditorModel>() {
					override textEditorModel = model;
				});
			}
		});
		services.set(IEditorWorkerService, new class extends mock<IEditorWorkerService>() {
			override async computeMoreMinimalEdits(_uri: any, edits: any) {
				return edits || undefined;
			}
		});
		services.set(ILanguageFeatureDebounceService, new SyncDescriptor(LanguageFeatureDebounceService));
		services.set(IOutlineModelService, new SyncDescriptor(OutlineModelService));
		services.set(IConfigurationService, new TestConfigurationService());

		const insta = new InstantiationService(services);

		const extHostDocumentsAndEditors = new ExtHostDocumentsAndEditors(rpcProtocol, new NullLogService());
		extHostDocumentsAndEditors.$acceptDocumentsAndEditorsDelta({
			addedDocuments: [{
				isDirty: false,
				versionId: model.getVersionId(),
				languageId: model.getLanguageId(),
				uri: model.uri,
				lines: model.getValue().split(model.getEOL()),
				EOL: model.getEOL(),
			}]
		});
		const extHostDocuments = new ExtHostDocuments(rpcProtocol, extHostDocumentsAndEditors);
		rpcProtocol.set(ExtHostContext.ExtHostDocuments, extHostDocuments);

		commands = new ExtHostCommands(rpcProtocol, new NullLogService(), new class extends mock<IExtHostTelemetry>() {
			override onExtensionError(): boolean {
				return true;
			}
		});
		rpcProtocol.set(ExtHostContext.ExtHostCommands, commands);
		rpcProtocol.set(MainContext.MainThreadCommands, insta.createInstance(MainThreadCommands, rpcProtocol));
		ExtHostApiCommands.register(commands);

		const diagnostics = new ExtHostDiagnostics(rpcProtocol, new NullLogService(), new class extends mock<IExtHostFileSystemInfo>() { }, extHostDocumentsAndEditors);
		rpcProtocol.set(ExtHostContext.ExtHostDiagnostics, diagnostics);

		extHost = new ExtHostLanguageFeatures(rpcProtocol, new URITransformerService(null), extHostDocuments, commands, diagnostics, new NullLogService(), NullApiDeprecationService, new class extends mock<IExtHostTelemetry>() {
			override onExtensionError(): boolean {
				return true;
			}
		});
		rpcProtocol.set(ExtHostContext.ExtHostLanguageFeatures, extHost);

		mainThread = rpcProtocol.set(MainContext.MainThreadLanguageFeatures, insta.createInstance(MainThreadLanguageFeatures, rpcProtocol));

		return rpcProtocol.sync();
	});

	suiteTeardown(() => {
		setUnexpectedErrorHandler(originalErrorHandler);
		model.dispose();
		mainThread.dispose();
	});

	teardown(() => {
		disposables = dispose(disposables);
		return rpcProtocol.sync();
	});

	// --- workspace symbols

	test('WorkspaceSymbols, invalid arguments', function () {
		const promises = [
			assertRejects(() => commands.executeCommand('zycode.executeWorkspaceSymbolProvider')),
			assertRejects(() => commands.executeCommand('zycode.executeWorkspaceSymbolProvider', null)),
			assertRejects(() => commands.executeCommand('zycode.executeWorkspaceSymbolProvider', undefined)),
			assertRejects(() => commands.executeCommand('zycode.executeWorkspaceSymbolProvider', true))
		];
		return Promise.all(promises);
	});

	test('WorkspaceSymbols, back and forth', function () {

		disposables.push(extHost.registerWorkspaceSymbolProvider(nullExtensionDescription, <zycode.WorkspaceSymbolProvider>{
			provideWorkspaceSymbols(query): any {
				return [
					new types.SymbolInformation(query, types.SymbolKind.Array, new types.Range(0, 0, 1, 1), URI.parse('far://testing/first')),
					new types.SymbolInformation(query, types.SymbolKind.Array, new types.Range(0, 0, 1, 1), URI.parse('far://testing/second'))
				];
			}
		}));

		disposables.push(extHost.registerWorkspaceSymbolProvider(nullExtensionDescription, <zycode.WorkspaceSymbolProvider>{
			provideWorkspaceSymbols(query): any {
				return [
					new types.SymbolInformation(query, types.SymbolKind.Array, new types.Range(0, 0, 1, 1), URI.parse('far://testing/first'))
				];
			}
		}));

		return rpcProtocol.sync().then(() => {
			return commands.executeCommand<zycode.SymbolInformation[]>('zycode.executeWorkspaceSymbolProvider', 'testing').then(value => {

				assert.strictEqual(value.length, 2); // de-duped
				for (const info of value) {
					assert.strictEqual(info instanceof types.SymbolInformation, true);
					assert.strictEqual(info.name, 'testing');
					assert.strictEqual(info.kind, types.SymbolKind.Array);
				}
			});
		});
	});

	test('executeWorkspaceSymbolProvider should accept empty string, #39522', async function () {

		disposables.push(extHost.registerWorkspaceSymbolProvider(nullExtensionDescription, {
			provideWorkspaceSymbols(): zycode.SymbolInformation[] {
				return [new types.SymbolInformation('hello', types.SymbolKind.Array, new types.Range(0, 0, 0, 0), URI.parse('foo:bar')) as zycode.SymbolInformation];
			}
		}));

		await rpcProtocol.sync();
		let symbols = await commands.executeCommand<zycode.SymbolInformation[]>('zycode.executeWorkspaceSymbolProvider', '');
		assert.strictEqual(symbols.length, 1);

		await rpcProtocol.sync();
		symbols = await commands.executeCommand<zycode.SymbolInformation[]>('zycode.executeWorkspaceSymbolProvider', '*');
		assert.strictEqual(symbols.length, 1);
	});

	// --- formatting
	test('executeFormatDocumentProvider, back and forth', async function () {

		disposables.push(extHost.registerDocumentFormattingEditProvider(nullExtensionDescription, defaultSelector, new class implements zycode.DocumentFormattingEditProvider {
			provideDocumentFormattingEdits() {
				return [types.TextEdit.insert(new types.Position(0, 0), '42')];
			}
		}));

		await rpcProtocol.sync();
		const edits = await commands.executeCommand<zycode.SymbolInformation[]>('zycode.executeFormatDocumentProvider', model.uri);
		assert.strictEqual(edits.length, 1);
	});


	// --- rename
	test('zycode.prepareRename', async function () {
		disposables.push(extHost.registerRenameProvider(nullExtensionDescription, defaultSelector, new class implements zycode.RenameProvider {

			prepareRename(document: zycode.TextDocument, position: zycode.Position) {
				return {
					range: new types.Range(0, 12, 0, 24),
					placeholder: 'foooPlaceholder'
				};
			}

			provideRenameEdits(document: zycode.TextDocument, position: zycode.Position, newName: string) {
				const edit = new types.WorkspaceEdit();
				edit.insert(document.uri, <types.Position>position, newName);
				return edit;
			}
		}));

		await rpcProtocol.sync();

		const data = await commands.executeCommand<{ range: zycode.Range; placeholder: string }>('zycode.prepareRename', model.uri, new types.Position(0, 12));

		assert.ok(data);
		assert.strictEqual(data.placeholder, 'foooPlaceholder');
		assert.strictEqual(data.range.start.line, 0);
		assert.strictEqual(data.range.start.character, 12);
		assert.strictEqual(data.range.end.line, 0);
		assert.strictEqual(data.range.end.character, 24);

	});

	test('zycode.executeDocumentRenameProvider', async function () {
		disposables.push(extHost.registerRenameProvider(nullExtensionDescription, defaultSelector, new class implements zycode.RenameProvider {
			provideRenameEdits(document: zycode.TextDocument, position: zycode.Position, newName: string) {
				const edit = new types.WorkspaceEdit();
				edit.insert(document.uri, <types.Position>position, newName);
				return edit;
			}
		}));

		await rpcProtocol.sync();

		const edit = await commands.executeCommand<zycode.WorkspaceEdit>('zycode.executeDocumentRenameProvider', model.uri, new types.Position(0, 12), 'newNameOfThis');

		assert.ok(edit);
		assert.strictEqual(edit.has(model.uri), true);
		const textEdits = edit.get(model.uri);
		assert.strictEqual(textEdits.length, 1);
		assert.strictEqual(textEdits[0].newText, 'newNameOfThis');
	});

	// --- definition

	test('Definition, invalid arguments', function () {
		const promises = [
			assertRejects(() => commands.executeCommand('zycode.executeDefinitionProvider')),
			assertRejects(() => commands.executeCommand('zycode.executeDefinitionProvider', null)),
			assertRejects(() => commands.executeCommand('zycode.executeDefinitionProvider', undefined)),
			assertRejects(() => commands.executeCommand('zycode.executeDefinitionProvider', true, false))
		];

		return Promise.all(promises);
	});

	test('Definition, back and forth', function () {

		disposables.push(extHost.registerDefinitionProvider(nullExtensionDescription, defaultSelector, <zycode.DefinitionProvider>{
			provideDefinition(doc: any): any {
				return new types.Location(doc.uri, new types.Range(1, 0, 0, 0));
			}
		}));
		disposables.push(extHost.registerDefinitionProvider(nullExtensionDescription, defaultSelector, <zycode.DefinitionProvider>{
			provideDefinition(doc: any): any {
				// duplicate result will get removed
				return new types.Location(doc.uri, new types.Range(1, 0, 0, 0));
			}
		}));
		disposables.push(extHost.registerDefinitionProvider(nullExtensionDescription, defaultSelector, <zycode.DefinitionProvider>{
			provideDefinition(doc: any): any {
				return [
					new types.Location(doc.uri, new types.Range(2, 0, 0, 0)),
					new types.Location(doc.uri, new types.Range(3, 0, 0, 0)),
					new types.Location(doc.uri, new types.Range(4, 0, 0, 0)),
				];
			}
		}));

		return rpcProtocol.sync().then(() => {
			return commands.executeCommand<zycode.Location[]>('zycode.executeDefinitionProvider', model.uri, new types.Position(0, 0)).then(values => {
				assert.strictEqual(values.length, 4);
				for (const v of values) {
					assert.ok(v.uri instanceof URI);
					assert.ok(v.range instanceof types.Range);
				}
			});
		});
	});


	test('Definition, back and forth (sorting & de-deduping)', function () {

		disposables.push(extHost.registerDefinitionProvider(nullExtensionDescription, defaultSelector, <zycode.DefinitionProvider>{
			provideDefinition(doc: any): any {
				return new types.Location(URI.parse('file:///b'), new types.Range(1, 0, 0, 0));
			}
		}));
		disposables.push(extHost.registerDefinitionProvider(nullExtensionDescription, defaultSelector, <zycode.DefinitionProvider>{
			provideDefinition(doc: any): any {
				// duplicate result will get removed
				return new types.Location(URI.parse('file:///b'), new types.Range(1, 0, 0, 0));
			}
		}));
		disposables.push(extHost.registerDefinitionProvider(nullExtensionDescription, defaultSelector, <zycode.DefinitionProvider>{
			provideDefinition(doc: any): any {
				return [
					new types.Location(URI.parse('file:///a'), new types.Range(2, 0, 0, 0)),
					new types.Location(URI.parse('file:///c'), new types.Range(3, 0, 0, 0)),
					new types.Location(URI.parse('file:///d'), new types.Range(4, 0, 0, 0)),
				];
			}
		}));

		return rpcProtocol.sync().then(() => {
			return commands.executeCommand<zycode.Location[]>('zycode.executeDefinitionProvider', model.uri, new types.Position(0, 0)).then(values => {
				assert.strictEqual(values.length, 4);

				assert.strictEqual(values[0].uri.path, '/a');
				assert.strictEqual(values[1].uri.path, '/b');
				assert.strictEqual(values[2].uri.path, '/c');
				assert.strictEqual(values[3].uri.path, '/d');
			});
		});
	});

	test('Definition Link', () => {
		disposables.push(extHost.registerDefinitionProvider(nullExtensionDescription, defaultSelector, <zycode.DefinitionProvider>{
			provideDefinition(doc: any): (zycode.Location | zycode.LocationLink)[] {
				return [
					new types.Location(doc.uri, new types.Range(0, 0, 0, 0)),
					{ targetUri: doc.uri, targetRange: new types.Range(1, 0, 0, 0), targetSelectionRange: new types.Range(1, 1, 1, 1), originSelectionRange: new types.Range(2, 2, 2, 2) }
				];
			}
		}));

		return rpcProtocol.sync().then(() => {
			return commands.executeCommand<(zycode.Location | zycode.LocationLink)[]>('zycode.executeDefinitionProvider', model.uri, new types.Position(0, 0)).then(values => {
				assert.strictEqual(values.length, 2);
				for (const v of values) {
					if (isLocation(v)) {
						assert.ok(v.uri instanceof URI);
						assert.ok(v.range instanceof types.Range);
					} else {
						assert.ok(v.targetUri instanceof URI);
						assert.ok(v.targetRange instanceof types.Range);
						assert.ok(v.targetSelectionRange instanceof types.Range);
						assert.ok(v.originSelectionRange instanceof types.Range);
					}
				}
			});
		});
	});

	// --- declaration

	test('Declaration, back and forth', function () {

		disposables.push(extHost.registerDeclarationProvider(nullExtensionDescription, defaultSelector, <zycode.DeclarationProvider>{
			provideDeclaration(doc: any): any {
				return new types.Location(doc.uri, new types.Range(1, 0, 0, 0));
			}
		}));
		disposables.push(extHost.registerDeclarationProvider(nullExtensionDescription, defaultSelector, <zycode.DeclarationProvider>{
			provideDeclaration(doc: any): any {
				// duplicate result will get removed
				return new types.Location(doc.uri, new types.Range(1, 0, 0, 0));
			}
		}));
		disposables.push(extHost.registerDeclarationProvider(nullExtensionDescription, defaultSelector, <zycode.DeclarationProvider>{
			provideDeclaration(doc: any): any {
				return [
					new types.Location(doc.uri, new types.Range(2, 0, 0, 0)),
					new types.Location(doc.uri, new types.Range(3, 0, 0, 0)),
					new types.Location(doc.uri, new types.Range(4, 0, 0, 0)),
				];
			}
		}));

		return rpcProtocol.sync().then(() => {
			return commands.executeCommand<zycode.Location[]>('zycode.executeDeclarationProvider', model.uri, new types.Position(0, 0)).then(values => {
				assert.strictEqual(values.length, 4);
				for (const v of values) {
					assert.ok(v.uri instanceof URI);
					assert.ok(v.range instanceof types.Range);
				}
			});
		});
	});

	test('Declaration Link', () => {
		disposables.push(extHost.registerDeclarationProvider(nullExtensionDescription, defaultSelector, <zycode.DeclarationProvider>{
			provideDeclaration(doc: any): (zycode.Location | zycode.LocationLink)[] {
				return [
					new types.Location(doc.uri, new types.Range(0, 0, 0, 0)),
					{ targetUri: doc.uri, targetRange: new types.Range(1, 0, 0, 0), targetSelectionRange: new types.Range(1, 1, 1, 1), originSelectionRange: new types.Range(2, 2, 2, 2) }
				];
			}
		}));

		return rpcProtocol.sync().then(() => {
			return commands.executeCommand<(zycode.Location | zycode.LocationLink)[]>('zycode.executeDeclarationProvider', model.uri, new types.Position(0, 0)).then(values => {
				assert.strictEqual(values.length, 2);
				for (const v of values) {
					if (isLocation(v)) {
						assert.ok(v.uri instanceof URI);
						assert.ok(v.range instanceof types.Range);
					} else {
						assert.ok(v.targetUri instanceof URI);
						assert.ok(v.targetRange instanceof types.Range);
						assert.ok(v.targetSelectionRange instanceof types.Range);
						assert.ok(v.originSelectionRange instanceof types.Range);
					}
				}
			});
		});
	});

	// --- type definition

	test('Type Definition, invalid arguments', function () {
		const promises = [
			assertRejects(() => commands.executeCommand('zycode.executeTypeDefinitionProvider')),
			assertRejects(() => commands.executeCommand('zycode.executeTypeDefinitionProvider', null)),
			assertRejects(() => commands.executeCommand('zycode.executeTypeDefinitionProvider', undefined)),
			assertRejects(() => commands.executeCommand('zycode.executeTypeDefinitionProvider', true, false))
		];

		return Promise.all(promises);
	});

	test('Type Definition, back and forth', function () {

		disposables.push(extHost.registerTypeDefinitionProvider(nullExtensionDescription, defaultSelector, <zycode.TypeDefinitionProvider>{
			provideTypeDefinition(doc: any): any {
				return new types.Location(doc.uri, new types.Range(1, 0, 0, 0));
			}
		}));
		disposables.push(extHost.registerTypeDefinitionProvider(nullExtensionDescription, defaultSelector, <zycode.TypeDefinitionProvider>{
			provideTypeDefinition(doc: any): any {
				// duplicate result will get removed
				return new types.Location(doc.uri, new types.Range(1, 0, 0, 0));
			}
		}));
		disposables.push(extHost.registerTypeDefinitionProvider(nullExtensionDescription, defaultSelector, <zycode.TypeDefinitionProvider>{
			provideTypeDefinition(doc: any): any {
				return [
					new types.Location(doc.uri, new types.Range(2, 0, 0, 0)),
					new types.Location(doc.uri, new types.Range(3, 0, 0, 0)),
					new types.Location(doc.uri, new types.Range(4, 0, 0, 0)),
				];
			}
		}));

		return rpcProtocol.sync().then(() => {
			return commands.executeCommand<zycode.Location[]>('zycode.executeTypeDefinitionProvider', model.uri, new types.Position(0, 0)).then(values => {
				assert.strictEqual(values.length, 4);
				for (const v of values) {
					assert.ok(v.uri instanceof URI);
					assert.ok(v.range instanceof types.Range);
				}
			});
		});
	});

	test('Type Definition Link', () => {
		disposables.push(extHost.registerTypeDefinitionProvider(nullExtensionDescription, defaultSelector, <zycode.TypeDefinitionProvider>{
			provideTypeDefinition(doc: any): (zycode.Location | zycode.LocationLink)[] {
				return [
					new types.Location(doc.uri, new types.Range(0, 0, 0, 0)),
					{ targetUri: doc.uri, targetRange: new types.Range(1, 0, 0, 0), targetSelectionRange: new types.Range(1, 1, 1, 1), originSelectionRange: new types.Range(2, 2, 2, 2) }
				];
			}
		}));

		return rpcProtocol.sync().then(() => {
			return commands.executeCommand<(zycode.Location | zycode.LocationLink)[]>('zycode.executeTypeDefinitionProvider', model.uri, new types.Position(0, 0)).then(values => {
				assert.strictEqual(values.length, 2);
				for (const v of values) {
					if (isLocation(v)) {
						assert.ok(v.uri instanceof URI);
						assert.ok(v.range instanceof types.Range);
					} else {
						assert.ok(v.targetUri instanceof URI);
						assert.ok(v.targetRange instanceof types.Range);
						assert.ok(v.targetSelectionRange instanceof types.Range);
						assert.ok(v.originSelectionRange instanceof types.Range);
					}
				}
			});
		});
	});

	// --- implementation

	test('Implementation, invalid arguments', function () {
		const promises = [
			assertRejects(() => commands.executeCommand('zycode.executeImplementationProvider')),
			assertRejects(() => commands.executeCommand('zycode.executeImplementationProvider', null)),
			assertRejects(() => commands.executeCommand('zycode.executeImplementationProvider', undefined)),
			assertRejects(() => commands.executeCommand('zycode.executeImplementationProvider', true, false))
		];

		return Promise.all(promises);
	});

	test('Implementation, back and forth', function () {

		disposables.push(extHost.registerImplementationProvider(nullExtensionDescription, defaultSelector, <zycode.ImplementationProvider>{
			provideImplementation(doc: any): any {
				return new types.Location(doc.uri, new types.Range(1, 0, 0, 0));
			}
		}));
		disposables.push(extHost.registerImplementationProvider(nullExtensionDescription, defaultSelector, <zycode.ImplementationProvider>{
			provideImplementation(doc: any): any {
				// duplicate result will get removed
				return new types.Location(doc.uri, new types.Range(1, 0, 0, 0));
			}
		}));
		disposables.push(extHost.registerImplementationProvider(nullExtensionDescription, defaultSelector, <zycode.ImplementationProvider>{
			provideImplementation(doc: any): any {
				return [
					new types.Location(doc.uri, new types.Range(2, 0, 0, 0)),
					new types.Location(doc.uri, new types.Range(3, 0, 0, 0)),
					new types.Location(doc.uri, new types.Range(4, 0, 0, 0)),
				];
			}
		}));

		return rpcProtocol.sync().then(() => {
			return commands.executeCommand<zycode.Location[]>('zycode.executeImplementationProvider', model.uri, new types.Position(0, 0)).then(values => {
				assert.strictEqual(values.length, 4);
				for (const v of values) {
					assert.ok(v.uri instanceof URI);
					assert.ok(v.range instanceof types.Range);
				}
			});
		});
	});

	test('Implementation Definition Link', () => {
		disposables.push(extHost.registerImplementationProvider(nullExtensionDescription, defaultSelector, <zycode.ImplementationProvider>{
			provideImplementation(doc: any): (zycode.Location | zycode.LocationLink)[] {
				return [
					new types.Location(doc.uri, new types.Range(0, 0, 0, 0)),
					{ targetUri: doc.uri, targetRange: new types.Range(1, 0, 0, 0), targetSelectionRange: new types.Range(1, 1, 1, 1), originSelectionRange: new types.Range(2, 2, 2, 2) }
				];
			}
		}));

		return rpcProtocol.sync().then(() => {
			return commands.executeCommand<(zycode.Location | zycode.LocationLink)[]>('zycode.executeImplementationProvider', model.uri, new types.Position(0, 0)).then(values => {
				assert.strictEqual(values.length, 2);
				for (const v of values) {
					if (isLocation(v)) {
						assert.ok(v.uri instanceof URI);
						assert.ok(v.range instanceof types.Range);
					} else {
						assert.ok(v.targetUri instanceof URI);
						assert.ok(v.targetRange instanceof types.Range);
						assert.ok(v.targetSelectionRange instanceof types.Range);
						assert.ok(v.originSelectionRange instanceof types.Range);
					}
				}
			});
		});
	});

	// --- references

	test('reference search, back and forth', function () {

		disposables.push(extHost.registerReferenceProvider(nullExtensionDescription, defaultSelector, <zycode.ReferenceProvider>{
			provideReferences() {
				return [
					new types.Location(URI.parse('some:uri/path'), new types.Range(0, 1, 0, 5))
				];
			}
		}));

		return commands.executeCommand<zycode.Location[]>('zycode.executeReferenceProvider', model.uri, new types.Position(0, 0)).then(values => {
			assert.strictEqual(values.length, 1);
			const [first] = values;
			assert.strictEqual(first.uri.toString(), 'some:uri/path');
			assert.strictEqual(first.range.start.line, 0);
			assert.strictEqual(first.range.start.character, 1);
			assert.strictEqual(first.range.end.line, 0);
			assert.strictEqual(first.range.end.character, 5);
		});
	});

	// --- outline

	test('Outline, back and forth', function () {
		disposables.push(extHost.registerDocumentSymbolProvider(nullExtensionDescription, defaultSelector, <zycode.DocumentSymbolProvider>{
			provideDocumentSymbols(): any {
				return [
					new types.SymbolInformation('testing1', types.SymbolKind.Enum, new types.Range(1, 0, 1, 0)),
					new types.SymbolInformation('testing2', types.SymbolKind.Enum, new types.Range(0, 1, 0, 3)),
				];
			}
		}));

		return rpcProtocol.sync().then(() => {
			return commands.executeCommand<zycode.SymbolInformation[]>('zycode.executeDocumentSymbolProvider', model.uri).then(values => {
				assert.strictEqual(values.length, 2);
				const [first, second] = values;
				assert.strictEqual(first instanceof types.SymbolInformation, true);
				assert.strictEqual(second instanceof types.SymbolInformation, true);
				assert.strictEqual(first.name, 'testing2');
				assert.strictEqual(second.name, 'testing1');
			});
		});
	});

	test('zycode.executeDocumentSymbolProvider command only returns SymbolInformation[] rather than DocumentSymbol[] #57984', function () {
		disposables.push(extHost.registerDocumentSymbolProvider(nullExtensionDescription, defaultSelector, <zycode.DocumentSymbolProvider>{
			provideDocumentSymbols(): any {
				return [
					new types.SymbolInformation('SymbolInformation', types.SymbolKind.Enum, new types.Range(1, 0, 1, 0))
				];
			}
		}));
		disposables.push(extHost.registerDocumentSymbolProvider(nullExtensionDescription, defaultSelector, <zycode.DocumentSymbolProvider>{
			provideDocumentSymbols(): any {
				const root = new types.DocumentSymbol('DocumentSymbol', 'DocumentSymbol#detail', types.SymbolKind.Enum, new types.Range(1, 0, 1, 0), new types.Range(1, 0, 1, 0));
				root.children = [new types.DocumentSymbol('DocumentSymbol#child', 'DocumentSymbol#detail#child', types.SymbolKind.Enum, new types.Range(1, 0, 1, 0), new types.Range(1, 0, 1, 0))];
				return [root];
			}
		}));

		return rpcProtocol.sync().then(() => {
			return commands.executeCommand<(zycode.SymbolInformation & zycode.DocumentSymbol)[]>('zycode.executeDocumentSymbolProvider', model.uri).then(values => {
				assert.strictEqual(values.length, 2);
				const [first, second] = values;
				assert.strictEqual(first instanceof types.SymbolInformation, true);
				assert.strictEqual(first instanceof types.DocumentSymbol, false);
				assert.strictEqual(second instanceof types.SymbolInformation, true);
				assert.strictEqual(first.name, 'DocumentSymbol');
				assert.strictEqual(first.children.length, 1);
				assert.strictEqual(second.name, 'SymbolInformation');
			});
		});
	});

	// --- suggest

	test('triggerCharacter is null when completion provider is called programmatically #159914', async function () {

		let actualContext: zycode.CompletionContext | undefined;

		disposables.push(extHost.registerCompletionItemProvider(nullExtensionDescription, defaultSelector, <zycode.CompletionItemProvider>{
			provideCompletionItems(_doc, _pos, _tok, context): any {
				actualContext = context;
				return [];
			}
		}, []));

		await rpcProtocol.sync();

		await commands.executeCommand<zycode.CompletionList>('zycode.executeCompletionItemProvider', model.uri, new types.Position(0, 4));

		assert.ok(actualContext);
		assert.deepStrictEqual(actualContext, { triggerKind: types.CompletionTriggerKind.Invoke, triggerCharacter: undefined });
	});

	test('Suggest, back and forth', function () {
		disposables.push(extHost.registerCompletionItemProvider(nullExtensionDescription, defaultSelector, <zycode.CompletionItemProvider>{
			provideCompletionItems(): any {
				const a = new types.CompletionItem('item1');
				a.documentation = new types.MarkdownString('hello_md_string');
				const b = new types.CompletionItem('item2');
				b.textEdit = types.TextEdit.replace(new types.Range(0, 4, 0, 8), 'foo'); // overwite after
				const c = new types.CompletionItem('item3');
				c.textEdit = types.TextEdit.replace(new types.Range(0, 1, 0, 6), 'foobar'); // overwite before & after

				// snippet string!
				const d = new types.CompletionItem('item4');
				d.range = new types.Range(0, 1, 0, 4);// overwite before
				d.insertText = new types.SnippetString('foo$0bar');
				return [a, b, c, d];
			}
		}, []));

		return rpcProtocol.sync().then(() => {
			return commands.executeCommand<zycode.CompletionList>('zycode.executeCompletionItemProvider', model.uri, new types.Position(0, 4)).then(list => {

				assert.ok(list instanceof types.CompletionList);
				const values = list.items;
				assert.ok(Array.isArray(values));
				assert.strictEqual(values.length, 4);
				const [first, second, third, fourth] = values;
				assert.strictEqual(first.label, 'item1');
				assert.strictEqual(first.textEdit, undefined);// no text edit, default ranges
				assert.ok(!types.Range.isRange(first.range));
				assert.strictEqual((<types.MarkdownString>first.documentation).value, 'hello_md_string');

				assert.strictEqual(second.label, 'item2');
				assert.strictEqual(second.textEdit!.newText, 'foo');
				assert.strictEqual(second.textEdit!.range.start.line, 0);
				assert.strictEqual(second.textEdit!.range.start.character, 4);
				assert.strictEqual(second.textEdit!.range.end.line, 0);
				assert.strictEqual(second.textEdit!.range.end.character, 8);

				assert.strictEqual(third.label, 'item3');
				assert.strictEqual(third.textEdit!.newText, 'foobar');
				assert.strictEqual(third.textEdit!.range.start.line, 0);
				assert.strictEqual(third.textEdit!.range.start.character, 1);
				assert.strictEqual(third.textEdit!.range.end.line, 0);
				assert.strictEqual(third.textEdit!.range.end.character, 6);

				assert.strictEqual(fourth.label, 'item4');
				assert.strictEqual(fourth.textEdit, undefined);

				const range: any = fourth.range!;
				assert.ok(types.Range.isRange(range));
				assert.strictEqual(range.start.line, 0);
				assert.strictEqual(range.start.character, 1);
				assert.strictEqual(range.end.line, 0);
				assert.strictEqual(range.end.character, 4);
				assert.ok(fourth.insertText instanceof types.SnippetString);
				assert.strictEqual((<types.SnippetString>fourth.insertText).value, 'foo$0bar');
			});
		});
	});

	test('Suggest, return CompletionList !array', function () {
		disposables.push(extHost.registerCompletionItemProvider(nullExtensionDescription, defaultSelector, <zycode.CompletionItemProvider>{
			provideCompletionItems(): any {
				const a = new types.CompletionItem('item1');
				const b = new types.CompletionItem('item2');
				return new types.CompletionList(<any>[a, b], true);
			}
		}, []));

		return rpcProtocol.sync().then(() => {
			return commands.executeCommand<zycode.CompletionList>('zycode.executeCompletionItemProvider', model.uri, new types.Position(0, 4)).then(list => {
				assert.ok(list instanceof types.CompletionList);
				assert.strictEqual(list.isIncomplete, true);
			});
		});
	});

	test('Suggest, resolve completion items', async function () {

		let resolveCount = 0;

		disposables.push(extHost.registerCompletionItemProvider(nullExtensionDescription, defaultSelector, <zycode.CompletionItemProvider>{
			provideCompletionItems(): any {
				const a = new types.CompletionItem('item1');
				const b = new types.CompletionItem('item2');
				const c = new types.CompletionItem('item3');
				const d = new types.CompletionItem('item4');
				return new types.CompletionList([a, b, c, d], false);
			},
			resolveCompletionItem(item) {
				resolveCount += 1;
				return item;
			}
		}, []));

		await rpcProtocol.sync();

		const list = await commands.executeCommand<zycode.CompletionList>(
			'zycode.executeCompletionItemProvider',
			model.uri,
			new types.Position(0, 4),
			undefined,
			2 // maxItemsToResolve
		);

		assert.ok(list instanceof types.CompletionList);
		assert.strictEqual(resolveCount, 2);

	});

	test('"zycode.executeCompletionItemProvider" doesnot return a preselect field #53749', async function () {
		disposables.push(extHost.registerCompletionItemProvider(nullExtensionDescription, defaultSelector, <zycode.CompletionItemProvider>{
			provideCompletionItems(): any {
				const a = new types.CompletionItem('item1');
				a.preselect = true;
				const b = new types.CompletionItem('item2');
				const c = new types.CompletionItem('item3');
				c.preselect = true;
				const d = new types.CompletionItem('item4');
				return new types.CompletionList([a, b, c, d], false);
			}
		}, []));

		await rpcProtocol.sync();

		const list = await commands.executeCommand<zycode.CompletionList>(
			'zycode.executeCompletionItemProvider',
			model.uri,
			new types.Position(0, 4),
			undefined
		);

		assert.ok(list instanceof types.CompletionList);
		assert.strictEqual(list.items.length, 4);

		const [a, b, c, d] = list.items;
		assert.strictEqual(a.preselect, true);
		assert.strictEqual(b.preselect, undefined);
		assert.strictEqual(c.preselect, true);
		assert.strictEqual(d.preselect, undefined);
	});

	test('executeCompletionItemProvider doesn\'t capture commitCharacters #58228', async function () {
		disposables.push(extHost.registerCompletionItemProvider(nullExtensionDescription, defaultSelector, <zycode.CompletionItemProvider>{
			provideCompletionItems(): any {
				const a = new types.CompletionItem('item1');
				a.commitCharacters = ['a', 'b'];
				const b = new types.CompletionItem('item2');
				return new types.CompletionList([a, b], false);
			}
		}, []));

		await rpcProtocol.sync();

		const list = await commands.executeCommand<zycode.CompletionList>(
			'zycode.executeCompletionItemProvider',
			model.uri,
			new types.Position(0, 4),
			undefined
		);

		assert.ok(list instanceof types.CompletionList);
		assert.strictEqual(list.items.length, 2);

		const [a, b] = list.items;
		assert.deepStrictEqual(a.commitCharacters, ['a', 'b']);
		assert.strictEqual(b.commitCharacters, undefined);
	});

	test('zycode.executeCompletionItemProvider returns the wrong CompletionItemKinds in insiders #95715', async function () {
		disposables.push(extHost.registerCompletionItemProvider(nullExtensionDescription, defaultSelector, <zycode.CompletionItemProvider>{
			provideCompletionItems(): any {
				return [
					new types.CompletionItem('My Method', types.CompletionItemKind.Method),
					new types.CompletionItem('My Property', types.CompletionItemKind.Property),
				];
			}
		}, []));

		await rpcProtocol.sync();

		const list = await commands.executeCommand<zycode.CompletionList>(
			'zycode.executeCompletionItemProvider',
			model.uri,
			new types.Position(0, 4),
			undefined
		);

		assert.ok(list instanceof types.CompletionList);
		assert.strictEqual(list.items.length, 2);

		const [a, b] = list.items;
		assert.strictEqual(a.kind, types.CompletionItemKind.Method);
		assert.strictEqual(b.kind, types.CompletionItemKind.Property);
	});

	// --- signatureHelp

	test('Parameter Hints, back and forth', async () => {
		disposables.push(extHost.registerSignatureHelpProvider(nullExtensionDescription, defaultSelector, new class implements zycode.SignatureHelpProvider {
			provideSignatureHelp(_document: zycode.TextDocument, _position: zycode.Position, _token: zycode.CancellationToken, context: zycode.SignatureHelpContext): zycode.SignatureHelp {
				return {
					activeSignature: 0,
					activeParameter: 1,
					signatures: [
						{
							label: 'abc',
							documentation: `${context.triggerKind === 1 /* zycode.SignatureHelpTriggerKind.Invoke */ ? 'invoked' : 'unknown'} ${context.triggerCharacter}`,
							parameters: []
						}
					]
				};
			}
		}, []));

		await rpcProtocol.sync();

		const firstValue = await commands.executeCommand<zycode.SignatureHelp>('zycode.executeSignatureHelpProvider', model.uri, new types.Position(0, 1), ',');
		assert.strictEqual(firstValue.activeSignature, 0);
		assert.strictEqual(firstValue.activeParameter, 1);
		assert.strictEqual(firstValue.signatures.length, 1);
		assert.strictEqual(firstValue.signatures[0].label, 'abc');
		assert.strictEqual(firstValue.signatures[0].documentation, 'invoked ,');
	});

	// --- quickfix

	test('QuickFix, back and forth', function () {
		disposables.push(extHost.registerCodeActionProvider(nullExtensionDescription, defaultSelector, {
			provideCodeActions(): zycode.Command[] {
				return [{ command: 'testing', title: 'Title', arguments: [1, 2, true] }];
			}
		}));

		return rpcProtocol.sync().then(() => {
			return commands.executeCommand<zycode.Command[]>('zycode.executeCodeActionProvider', model.uri, new types.Range(0, 0, 1, 1)).then(value => {
				assert.strictEqual(value.length, 1);
				const [first] = value;
				assert.strictEqual(first.title, 'Title');
				assert.strictEqual(first.command, 'testing');
				assert.deepStrictEqual(first.arguments, [1, 2, true]);
			});
		});
	});

	test('zycode.executeCodeActionProvider results seem to be missing their `command` property #45124', function () {
		disposables.push(extHost.registerCodeActionProvider(nullExtensionDescription, defaultSelector, {
			provideCodeActions(document, range): zycode.CodeAction[] {
				return [{
					command: {
						arguments: [document, range],
						command: 'command',
						title: 'command_title',
					},
					kind: types.CodeActionKind.Empty.append('foo'),
					title: 'title',
				}];
			}
		}));

		return rpcProtocol.sync().then(() => {
			return commands.executeCommand<zycode.CodeAction[]>('zycode.executeCodeActionProvider', model.uri, new types.Range(0, 0, 1, 1)).then(value => {
				assert.strictEqual(value.length, 1);
				const [first] = value;
				assert.ok(first.command);
				assert.strictEqual(first.command!.command, 'command');
				assert.strictEqual(first.command!.title, 'command_title');
				assert.strictEqual(first.kind!.value, 'foo');
				assert.strictEqual(first.title, 'title');

			});
		});
	});

	test('zycode.executeCodeActionProvider passes Range to provider although Selection is passed in #77997', function () {
		disposables.push(extHost.registerCodeActionProvider(nullExtensionDescription, defaultSelector, {
			provideCodeActions(document, rangeOrSelection): zycode.CodeAction[] {
				return [{
					command: {
						arguments: [document, rangeOrSelection],
						command: 'command',
						title: 'command_title',
					},
					kind: types.CodeActionKind.Empty.append('foo'),
					title: 'title',
				}];
			}
		}));

		const selection = new types.Selection(0, 0, 1, 1);

		return rpcProtocol.sync().then(() => {
			return commands.executeCommand<zycode.CodeAction[]>('zycode.executeCodeActionProvider', model.uri, selection).then(value => {
				assert.strictEqual(value.length, 1);
				const [first] = value;
				assert.ok(first.command);
				assert.ok(first.command!.arguments![1] instanceof types.Selection);
				assert.ok(first.command!.arguments![1].isEqual(selection));
			});
		});
	});

	test('zycode.executeCodeActionProvider results seem to be missing their `isPreferred` property #78098', function () {
		disposables.push(extHost.registerCodeActionProvider(nullExtensionDescription, defaultSelector, {
			provideCodeActions(document, rangeOrSelection): zycode.CodeAction[] {
				return [{
					command: {
						arguments: [document, rangeOrSelection],
						command: 'command',
						title: 'command_title',
					},
					kind: types.CodeActionKind.Empty.append('foo'),
					title: 'title',
					isPreferred: true
				}];
			}
		}));

		const selection = new types.Selection(0, 0, 1, 1);

		return rpcProtocol.sync().then(() => {
			return commands.executeCommand<zycode.CodeAction[]>('zycode.executeCodeActionProvider', model.uri, selection).then(value => {
				assert.strictEqual(value.length, 1);
				const [first] = value;
				assert.strictEqual(first.isPreferred, true);
			});
		});
	});

	test('resolving code action', async function () {

		let didCallResolve = 0;
		class MyAction extends types.CodeAction { }

		disposables.push(extHost.registerCodeActionProvider(nullExtensionDescription, defaultSelector, {
			provideCodeActions(document, rangeOrSelection): zycode.CodeAction[] {
				return [new MyAction('title', types.CodeActionKind.Empty.append('foo'))];
			},
			resolveCodeAction(action): zycode.CodeAction {
				assert.ok(action instanceof MyAction);

				didCallResolve += 1;
				action.title = 'resolved title';
				action.edit = new types.WorkspaceEdit();
				return action;
			}
		}));

		const selection = new types.Selection(0, 0, 1, 1);

		await rpcProtocol.sync();

		const value = await commands.executeCommand<zycode.CodeAction[]>('zycode.executeCodeActionProvider', model.uri, selection, undefined, 1000);
		assert.strictEqual(didCallResolve, 1);
		assert.strictEqual(value.length, 1);

		const [first] = value;
		assert.strictEqual(first.title, 'title'); // does NOT change
		assert.ok(first.edit); // is set
	});

	// --- code lens

	test('CodeLens, back and forth', function () {

		const complexArg = {
			foo() { },
			bar() { },
			big: extHost
		};

		disposables.push(extHost.registerCodeLensProvider(nullExtensionDescription, defaultSelector, <zycode.CodeLensProvider>{
			provideCodeLenses(): any {
				return [new types.CodeLens(new types.Range(0, 0, 1, 1), { title: 'Title', command: 'cmd', arguments: [1, true, complexArg] })];
			}
		}));

		return rpcProtocol.sync().then(() => {
			return commands.executeCommand<zycode.CodeLens[]>('zycode.executeCodeLensProvider', model.uri).then(value => {
				assert.strictEqual(value.length, 1);
				const [first] = value;

				assert.strictEqual(first.command!.title, 'Title');
				assert.strictEqual(first.command!.command, 'cmd');
				assert.strictEqual(first.command!.arguments![0], 1);
				assert.strictEqual(first.command!.arguments![1], true);
				assert.strictEqual(first.command!.arguments![2], complexArg);
			});
		});
	});

	test('CodeLens, resolve', async function () {

		let resolveCount = 0;

		disposables.push(extHost.registerCodeLensProvider(nullExtensionDescription, defaultSelector, <zycode.CodeLensProvider>{
			provideCodeLenses(): any {
				return [
					new types.CodeLens(new types.Range(0, 0, 1, 1)),
					new types.CodeLens(new types.Range(0, 0, 1, 1)),
					new types.CodeLens(new types.Range(0, 0, 1, 1)),
					new types.CodeLens(new types.Range(0, 0, 1, 1), { title: 'Already resolved', command: 'fff' })
				];
			},
			resolveCodeLens(codeLens: types.CodeLens) {
				codeLens.command = { title: resolveCount.toString(), command: 'resolved' };
				resolveCount += 1;
				return codeLens;
			}
		}));

		await rpcProtocol.sync();

		let value = await commands.executeCommand<zycode.CodeLens[]>('zycode.executeCodeLensProvider', model.uri, 2);

		assert.strictEqual(value.length, 3); // the resolve argument defines the number of results being returned
		assert.strictEqual(resolveCount, 2);

		resolveCount = 0;
		value = await commands.executeCommand<zycode.CodeLens[]>('zycode.executeCodeLensProvider', model.uri);

		assert.strictEqual(value.length, 4);
		assert.strictEqual(resolveCount, 0);
	});

	test('Links, back and forth', function () {

		disposables.push(extHost.registerDocumentLinkProvider(nullExtensionDescription, defaultSelector, <zycode.DocumentLinkProvider>{
			provideDocumentLinks(): any {
				return [new types.DocumentLink(new types.Range(0, 0, 0, 20), URI.parse('foo:bar'))];
			}
		}));

		return rpcProtocol.sync().then(() => {
			return commands.executeCommand<zycode.DocumentLink[]>('zycode.executeLinkProvider', model.uri).then(value => {
				assert.strictEqual(value.length, 1);
				const [first] = value;

				assert.strictEqual(first.target + '', 'foo:bar');
				assert.strictEqual(first.range.start.line, 0);
				assert.strictEqual(first.range.start.character, 0);
				assert.strictEqual(first.range.end.line, 0);
				assert.strictEqual(first.range.end.character, 20);
			});
		});
	});

	test('What\'s the condition for DocumentLink target to be undefined? #106308', async function () {
		disposables.push(extHost.registerDocumentLinkProvider(nullExtensionDescription, defaultSelector, <zycode.DocumentLinkProvider>{
			provideDocumentLinks(): any {
				return [new types.DocumentLink(new types.Range(0, 0, 0, 20), undefined)];
			},
			resolveDocumentLink(link) {
				link.target = URI.parse('foo:bar');
				return link;
			}
		}));

		await rpcProtocol.sync();

		const links1 = await commands.executeCommand<zycode.DocumentLink[]>('zycode.executeLinkProvider', model.uri);
		assert.strictEqual(links1.length, 1);
		assert.strictEqual(links1[0].target, undefined);

		const links2 = await commands.executeCommand<zycode.DocumentLink[]>('zycode.executeLinkProvider', model.uri, 1000);
		assert.strictEqual(links2.length, 1);
		assert.strictEqual(links2[0].target!.toString(), URI.parse('foo:bar').toString());

	});


	test('Color provider', function () {

		disposables.push(extHost.registerColorProvider(nullExtensionDescription, defaultSelector, <zycode.DocumentColorProvider>{
			provideDocumentColors(): zycode.ColorInformation[] {
				return [new types.ColorInformation(new types.Range(0, 0, 0, 20), new types.Color(0.1, 0.2, 0.3, 0.4))];
			},
			provideColorPresentations(): zycode.ColorPresentation[] {
				const cp = new types.ColorPresentation('#ABC');
				cp.textEdit = types.TextEdit.replace(new types.Range(1, 0, 1, 20), '#ABC');
				cp.additionalTextEdits = [types.TextEdit.insert(new types.Position(2, 20), '*')];
				return [cp];
			}
		}));

		return rpcProtocol.sync().then(() => {
			return commands.executeCommand<zycode.ColorInformation[]>('zycode.executeDocumentColorProvider', model.uri).then(value => {
				assert.strictEqual(value.length, 1);
				const [first] = value;

				assert.strictEqual(first.color.red, 0.1);
				assert.strictEqual(first.color.green, 0.2);
				assert.strictEqual(first.color.blue, 0.3);
				assert.strictEqual(first.color.alpha, 0.4);
				assert.strictEqual(first.range.start.line, 0);
				assert.strictEqual(first.range.start.character, 0);
				assert.strictEqual(first.range.end.line, 0);
				assert.strictEqual(first.range.end.character, 20);
			});
		}).then(() => {
			const color = new types.Color(0.5, 0.6, 0.7, 0.8);
			const range = new types.Range(0, 0, 0, 20);
			return commands.executeCommand<zycode.ColorPresentation[]>('zycode.executeColorPresentationProvider', color, { uri: model.uri, range }).then(value => {
				assert.strictEqual(value.length, 1);
				const [first] = value;

				assert.strictEqual(first.label, '#ABC');
				assert.strictEqual(first.textEdit!.newText, '#ABC');
				assert.strictEqual(first.textEdit!.range.start.line, 1);
				assert.strictEqual(first.textEdit!.range.start.character, 0);
				assert.strictEqual(first.textEdit!.range.end.line, 1);
				assert.strictEqual(first.textEdit!.range.end.character, 20);
				assert.strictEqual(first.additionalTextEdits!.length, 1);
				assert.strictEqual(first.additionalTextEdits![0].range.start.line, 2);
				assert.strictEqual(first.additionalTextEdits![0].range.start.character, 20);
				assert.strictEqual(first.additionalTextEdits![0].range.end.line, 2);
				assert.strictEqual(first.additionalTextEdits![0].range.end.character, 20);
			});
		});
	});

	test('"TypeError: e.onCancellationRequested is not a function" calling hover provider in Insiders #54174', function () {

		disposables.push(extHost.registerHoverProvider(nullExtensionDescription, defaultSelector, <zycode.HoverProvider>{
			provideHover(): any {
				return new types.Hover('fofofofo');
			}
		}));

		return rpcProtocol.sync().then(() => {
			return commands.executeCommand<zycode.Hover[]>('zycode.executeHoverProvider', model.uri, new types.Position(1, 1)).then(value => {
				assert.strictEqual(value.length, 1);
				assert.strictEqual(value[0].contents.length, 1);
			});
		});
	});

	// --- inline hints

	test('Inlay Hints, back and forth', async function () {
		disposables.push(extHost.registerInlayHintsProvider(nullExtensionDescription, defaultSelector, <zycode.InlayHintsProvider>{
			provideInlayHints() {
				return [new types.InlayHint(new types.Position(0, 1), 'Foo')];
			}
		}));

		await rpcProtocol.sync();

		const value = await commands.executeCommand<zycode.InlayHint[]>('zycode.executeInlayHintProvider', model.uri, new types.Range(0, 0, 20, 20));
		assert.strictEqual(value.length, 1);

		const [first] = value;
		assert.strictEqual(first.label, 'Foo');
		assert.strictEqual(first.position.line, 0);
		assert.strictEqual(first.position.character, 1);
	});

	test('Inline Hints, merge', async function () {
		disposables.push(extHost.registerInlayHintsProvider(nullExtensionDescription, defaultSelector, <zycode.InlayHintsProvider>{
			provideInlayHints() {
				const part = new types.InlayHintLabelPart('Bar');
				part.tooltip = 'part_tooltip';
				part.command = { command: 'cmd', title: 'part' };
				const hint = new types.InlayHint(new types.Position(10, 11), [part]);
				hint.tooltip = 'hint_tooltip';
				hint.paddingLeft = true;
				hint.paddingRight = false;
				return [hint];
			}
		}));

		disposables.push(extHost.registerInlayHintsProvider(nullExtensionDescription, defaultSelector, <zycode.InlayHintsProvider>{
			provideInlayHints() {
				const hint = new types.InlayHint(new types.Position(0, 1), 'Foo', types.InlayHintKind.Parameter);
				hint.textEdits = [types.TextEdit.insert(new types.Position(0, 0), 'Hello')];
				return [hint];
			}
		}));

		await rpcProtocol.sync();

		const value = await commands.executeCommand<zycode.InlayHint[]>('zycode.executeInlayHintProvider', model.uri, new types.Range(0, 0, 20, 20));
		assert.strictEqual(value.length, 2);

		const [first, second] = value;
		assert.strictEqual(first.label, 'Foo');
		assert.strictEqual(first.position.line, 0);
		assert.strictEqual(first.position.character, 1);
		assert.strictEqual(first.textEdits?.length, 1);
		assert.strictEqual(first.textEdits![0].newText, 'Hello');

		assert.strictEqual(second.position.line, 10);
		assert.strictEqual(second.position.character, 11);
		assert.strictEqual(second.paddingLeft, true);
		assert.strictEqual(second.paddingRight, false);
		assert.strictEqual(second.tooltip, 'hint_tooltip');

		const label = (<types.InlayHintLabelPart[]>second.label)[0];
		assertType(label instanceof types.InlayHintLabelPart);
		assert.strictEqual(label.value, 'Bar');
		assert.strictEqual(label.tooltip, 'part_tooltip');
		assert.strictEqual(label.command?.command, 'cmd');
		assert.strictEqual(label.command?.title, 'part');
	});

	test('Inline Hints, bad provider', async function () {
		disposables.push(extHost.registerInlayHintsProvider(nullExtensionDescription, defaultSelector, <zycode.InlayHintsProvider>{
			provideInlayHints() {
				return [new types.InlayHint(new types.Position(0, 1), 'Foo')];
			}
		}));
		disposables.push(extHost.registerInlayHintsProvider(nullExtensionDescription, defaultSelector, <zycode.InlayHintsProvider>{
			provideInlayHints() {
				throw new Error();
			}
		}));

		await rpcProtocol.sync();

		const value = await commands.executeCommand<zycode.InlayHint[]>('zycode.executeInlayHintProvider', model.uri, new types.Range(0, 0, 20, 20));
		assert.strictEqual(value.length, 1);

		const [first] = value;
		assert.strictEqual(first.label, 'Foo');
		assert.strictEqual(first.position.line, 0);
		assert.strictEqual(first.position.character, 1);
	});

	// --- selection ranges

	test('Selection Range, back and forth', async function () {

		disposables.push(extHost.registerSelectionRangeProvider(nullExtensionDescription, defaultSelector, <zycode.SelectionRangeProvider>{
			provideSelectionRanges() {
				return [
					new types.SelectionRange(new types.Range(0, 10, 0, 18), new types.SelectionRange(new types.Range(0, 2, 0, 20))),
				];
			}
		}));

		await rpcProtocol.sync();
		const value = await commands.executeCommand<zycode.SelectionRange[]>('zycode.executeSelectionRangeProvider', model.uri, [new types.Position(0, 10)]);
		assert.strictEqual(value.length, 1);
		assert.ok(value[0].parent);
	});

	// --- call hierarchy

	test('CallHierarchy, back and forth', async function () {

		disposables.push(extHost.registerCallHierarchyProvider(nullExtensionDescription, defaultSelector, new class implements zycode.CallHierarchyProvider {

			prepareCallHierarchy(document: zycode.TextDocument, position: zycode.Position,): zycode.ProviderResult<zycode.CallHierarchyItem> {
				return new types.CallHierarchyItem(types.SymbolKind.Constant, 'ROOT', 'ROOT', document.uri, new types.Range(0, 0, 0, 0), new types.Range(0, 0, 0, 0));
			}

			provideCallHierarchyIncomingCalls(item: zycode.CallHierarchyItem, token: zycode.CancellationToken): zycode.ProviderResult<zycode.CallHierarchyIncomingCall[]> {

				return [new types.CallHierarchyIncomingCall(
					new types.CallHierarchyItem(types.SymbolKind.Constant, 'INCOMING', 'INCOMING', item.uri, new types.Range(0, 0, 0, 0), new types.Range(0, 0, 0, 0)),
					[new types.Range(0, 0, 0, 0)]
				)];
			}

			provideCallHierarchyOutgoingCalls(item: zycode.CallHierarchyItem, token: zycode.CancellationToken): zycode.ProviderResult<zycode.CallHierarchyOutgoingCall[]> {
				return [new types.CallHierarchyOutgoingCall(
					new types.CallHierarchyItem(types.SymbolKind.Constant, 'OUTGOING', 'OUTGOING', item.uri, new types.Range(0, 0, 0, 0), new types.Range(0, 0, 0, 0)),
					[new types.Range(0, 0, 0, 0)]
				)];
			}
		}));

		await rpcProtocol.sync();

		const root = await commands.executeCommand<zycode.CallHierarchyItem[]>('zycode.prepareCallHierarchy', model.uri, new types.Position(0, 0));

		assert.ok(Array.isArray(root));
		assert.strictEqual(root.length, 1);
		assert.strictEqual(root[0].name, 'ROOT');

		const incoming = await commands.executeCommand<zycode.CallHierarchyIncomingCall[]>('zycode.provideIncomingCalls', root[0]);
		assert.strictEqual(incoming.length, 1);
		assert.strictEqual(incoming[0].from.name, 'INCOMING');

		const outgoing = await commands.executeCommand<zycode.CallHierarchyOutgoingCall[]>('zycode.provideOutgoingCalls', root[0]);
		assert.strictEqual(outgoing.length, 1);
		assert.strictEqual(outgoing[0].to.name, 'OUTGOING');
	});

	test('prepareCallHierarchy throws TypeError if clangd returns empty result #137415', async function () {

		disposables.push(extHost.registerCallHierarchyProvider(nullExtensionDescription, defaultSelector, new class implements zycode.CallHierarchyProvider {
			prepareCallHierarchy(document: zycode.TextDocument, position: zycode.Position,): zycode.ProviderResult<zycode.CallHierarchyItem[]> {
				return [];
			}
			provideCallHierarchyIncomingCalls(item: zycode.CallHierarchyItem, token: zycode.CancellationToken): zycode.ProviderResult<zycode.CallHierarchyIncomingCall[]> {
				return [];
			}
			provideCallHierarchyOutgoingCalls(item: zycode.CallHierarchyItem, token: zycode.CancellationToken): zycode.ProviderResult<zycode.CallHierarchyOutgoingCall[]> {
				return [];
			}
		}));

		await rpcProtocol.sync();

		const root = await commands.executeCommand<zycode.CallHierarchyItem[]>('zycode.prepareCallHierarchy', model.uri, new types.Position(0, 0));

		assert.ok(Array.isArray(root));
		assert.strictEqual(root.length, 0);
	});

	// --- type hierarchy

	test('TypeHierarchy, back and forth', async function () {


		disposables.push(extHost.registerTypeHierarchyProvider(nullExtensionDescription, defaultSelector, new class implements zycode.TypeHierarchyProvider {
			prepareTypeHierarchy(document: zycode.TextDocument, position: zycode.Position, token: zycode.CancellationToken): zycode.ProviderResult<zycode.TypeHierarchyItem[]> {
				return [new types.TypeHierarchyItem(types.SymbolKind.Constant, 'ROOT', 'ROOT', document.uri, new types.Range(0, 0, 0, 0), new types.Range(0, 0, 0, 0))];
			}
			provideTypeHierarchySupertypes(item: zycode.TypeHierarchyItem, token: zycode.CancellationToken): zycode.ProviderResult<zycode.TypeHierarchyItem[]> {
				return [new types.TypeHierarchyItem(types.SymbolKind.Constant, 'SUPER', 'SUPER', item.uri, new types.Range(0, 0, 0, 0), new types.Range(0, 0, 0, 0))];
			}
			provideTypeHierarchySubtypes(item: zycode.TypeHierarchyItem, token: zycode.CancellationToken): zycode.ProviderResult<zycode.TypeHierarchyItem[]> {
				return [new types.TypeHierarchyItem(types.SymbolKind.Constant, 'SUB', 'SUB', item.uri, new types.Range(0, 0, 0, 0), new types.Range(0, 0, 0, 0))];
			}
		}));

		await rpcProtocol.sync();

		const root = await commands.executeCommand<zycode.TypeHierarchyItem[]>('zycode.prepareTypeHierarchy', model.uri, new types.Position(0, 0));

		assert.ok(Array.isArray(root));
		assert.strictEqual(root.length, 1);
		assert.strictEqual(root[0].name, 'ROOT');

		const incoming = await commands.executeCommand<zycode.TypeHierarchyItem[]>('zycode.provideSupertypes', root[0]);
		assert.strictEqual(incoming.length, 1);
		assert.strictEqual(incoming[0].name, 'SUPER');

		const outgoing = await commands.executeCommand<zycode.TypeHierarchyItem[]>('zycode.provideSubtypes', root[0]);
		assert.strictEqual(outgoing.length, 1);
		assert.strictEqual(outgoing[0].name, 'SUB');
	});

	test('selectionRangeProvider on inner array always returns outer array #91852', async function () {

		disposables.push(extHost.registerSelectionRangeProvider(nullExtensionDescription, defaultSelector, <zycode.SelectionRangeProvider>{
			provideSelectionRanges(_doc, positions) {
				const [first] = positions;
				return [
					new types.SelectionRange(new types.Range(first.line, first.character, first.line, first.character)),
				];
			}
		}));

		await rpcProtocol.sync();
		const value = await commands.executeCommand<zycode.SelectionRange[]>('zycode.executeSelectionRangeProvider', model.uri, [new types.Position(0, 10)]);
		assert.strictEqual(value.length, 1);
		assert.strictEqual(value[0].range.start.line, 0);
		assert.strictEqual(value[0].range.start.character, 10);
		assert.strictEqual(value[0].range.end.line, 0);
		assert.strictEqual(value[0].range.end.character, 10);
	});

	test('more element test of selectionRangeProvider on inner array always returns outer array #91852', async function () {

		disposables.push(extHost.registerSelectionRangeProvider(nullExtensionDescription, defaultSelector, <zycode.SelectionRangeProvider>{
			provideSelectionRanges(_doc, positions) {
				const [first, second] = positions;
				return [
					new types.SelectionRange(new types.Range(first.line, first.character, first.line, first.character)),
					new types.SelectionRange(new types.Range(second.line, second.character, second.line, second.character)),
				];
			}
		}));

		await rpcProtocol.sync();
		const value = await commands.executeCommand<zycode.SelectionRange[]>(
			'zycode.executeSelectionRangeProvider',
			model.uri,
			[new types.Position(0, 0), new types.Position(0, 10)]
		);
		assert.strictEqual(value.length, 2);
		assert.strictEqual(value[0].range.start.line, 0);
		assert.strictEqual(value[0].range.start.character, 0);
		assert.strictEqual(value[0].range.end.line, 0);
		assert.strictEqual(value[0].range.end.character, 0);
		assert.strictEqual(value[1].range.start.line, 0);
		assert.strictEqual(value[1].range.start.character, 10);
		assert.strictEqual(value[1].range.end.line, 0);
		assert.strictEqual(value[1].range.end.character, 10);
	});
});
