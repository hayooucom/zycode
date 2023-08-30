/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { asPromise } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ISignService } from 'vs/platform/sign/common/sign';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { DebugSessionUUID, ExtHostDebugServiceShape, IBreakpointsDeltaDto, IThreadFocusDto, IStackFrameFocusDto, IDebugSessionDto, IFunctionBreakpointDto, ISourceMultiBreakpointDto, MainContext, MainThreadDebugServiceShape } from 'vs/workbench/api/common/extHost.protocol';
import { IExtHostEditorTabs } from 'vs/workbench/api/common/extHostEditorTabs';
import { IExtHostExtensionService } from 'vs/workbench/api/common/extHostExtensionService';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import { Breakpoint, DataBreakpoint, DebugAdapterExecutable, DebugAdapterInlineImplementation, DebugAdapterNamedPipeServer, DebugAdapterServer, DebugConsoleMode, Disposable, FunctionBreakpoint, Location, Position, setBreakpointId, SourceBreakpoint, ThreadFocus, StackFrameFocus } from 'vs/workbench/api/common/extHostTypes';
import { IExtHostWorkspace } from 'vs/workbench/api/common/extHostWorkspace';
import { AbstractDebugAdapter } from 'vs/workbench/contrib/debug/common/abstractDebugAdapter';
import { IAdapterDescriptor, IConfig, IDebugAdapter, IDebugAdapterExecutable, IDebugAdapterNamedPipeServer, IDebugAdapterServer, IDebuggerContribution } from 'vs/workbench/contrib/debug/common/debug';
import { convertToDAPaths, convertToVSCPaths, isDebuggerMainContribution } from 'vs/workbench/contrib/debug/common/debugUtils';
import { ExtensionDescriptionRegistry } from 'vs/workbench/services/extensions/common/extensionDescriptionRegistry';
import { Dto } from 'vs/workbench/services/extensions/common/proxyIdentifier';
import type * as zycode from 'zycode';
import { IExtHostConfiguration } from '../common/extHostConfiguration';
import { IExtHostVariableResolverProvider } from './extHostVariableResolverService';

export const IExtHostDebugService = createDecorator<IExtHostDebugService>('IExtHostDebugService');

export interface IExtHostDebugService extends ExtHostDebugServiceShape {

	readonly _serviceBrand: undefined;

	onDidStartDebugSession: Event<zycode.DebugSession>;
	onDidTerminateDebugSession: Event<zycode.DebugSession>;
	onDidChangeActiveDebugSession: Event<zycode.DebugSession | undefined>;
	activeDebugSession: zycode.DebugSession | undefined;
	activeDebugConsole: zycode.DebugConsole;
	onDidReceiveDebugSessionCustomEvent: Event<zycode.DebugSessionCustomEvent>;
	onDidChangeBreakpoints: Event<zycode.BreakpointsChangeEvent>;
	breakpoints: zycode.Breakpoint[];
	onDidChangeStackFrameFocus: Event<zycode.ThreadFocus | zycode.StackFrameFocus | undefined>;
	stackFrameFocus: zycode.ThreadFocus | zycode.StackFrameFocus | undefined;

	addBreakpoints(breakpoints0: readonly zycode.Breakpoint[]): Promise<void>;
	removeBreakpoints(breakpoints0: readonly zycode.Breakpoint[]): Promise<void>;
	startDebugging(folder: zycode.WorkspaceFolder | undefined, nameOrConfig: string | zycode.DebugConfiguration, options: zycode.DebugSessionOptions): Promise<boolean>;
	stopDebugging(session?: zycode.DebugSession): Promise<void>;
	registerDebugConfigurationProvider(type: string, provider: zycode.DebugConfigurationProvider, trigger: zycode.DebugConfigurationProviderTriggerKind): zycode.Disposable;
	registerDebugAdapterDescriptorFactory(extension: IExtensionDescription, type: string, factory: zycode.DebugAdapterDescriptorFactory): zycode.Disposable;
	registerDebugAdapterTrackerFactory(type: string, factory: zycode.DebugAdapterTrackerFactory): zycode.Disposable;
	asDebugSourceUri(source: zycode.DebugProtocolSource, session?: zycode.DebugSession): zycode.Uri;
}

export abstract class ExtHostDebugServiceBase implements IExtHostDebugService, ExtHostDebugServiceShape {

	readonly _serviceBrand: undefined;

	private _configProviderHandleCounter: number;
	private _configProviders: ConfigProviderTuple[];

	private _adapterFactoryHandleCounter: number;
	private _adapterFactories: DescriptorFactoryTuple[];

	private _trackerFactoryHandleCounter: number;
	private _trackerFactories: TrackerFactoryTuple[];

	private _debugServiceProxy: MainThreadDebugServiceShape;
	private _debugSessions: Map<DebugSessionUUID, ExtHostDebugSession> = new Map<DebugSessionUUID, ExtHostDebugSession>();

	private readonly _onDidStartDebugSession: Emitter<zycode.DebugSession>;
	get onDidStartDebugSession(): Event<zycode.DebugSession> { return this._onDidStartDebugSession.event; }

	private readonly _onDidTerminateDebugSession: Emitter<zycode.DebugSession>;
	get onDidTerminateDebugSession(): Event<zycode.DebugSession> { return this._onDidTerminateDebugSession.event; }

	private readonly _onDidChangeActiveDebugSession: Emitter<zycode.DebugSession | undefined>;
	get onDidChangeActiveDebugSession(): Event<zycode.DebugSession | undefined> { return this._onDidChangeActiveDebugSession.event; }

	private _activeDebugSession: ExtHostDebugSession | undefined;
	get activeDebugSession(): ExtHostDebugSession | undefined { return this._activeDebugSession; }

	private readonly _onDidReceiveDebugSessionCustomEvent: Emitter<zycode.DebugSessionCustomEvent>;
	get onDidReceiveDebugSessionCustomEvent(): Event<zycode.DebugSessionCustomEvent> { return this._onDidReceiveDebugSessionCustomEvent.event; }

	private _activeDebugConsole: ExtHostDebugConsole;
	get activeDebugConsole(): zycode.DebugConsole { return this._activeDebugConsole.value; }

	private _breakpoints: Map<string, zycode.Breakpoint>;

	private readonly _onDidChangeBreakpoints: Emitter<zycode.BreakpointsChangeEvent>;

	private _stackFrameFocus: zycode.ThreadFocus | zycode.StackFrameFocus | undefined;
	private readonly _onDidChangeStackFrameFocus: Emitter<zycode.ThreadFocus | zycode.StackFrameFocus | undefined>;

	private _debugAdapters: Map<number, IDebugAdapter>;
	private _debugAdaptersTrackers: Map<number, zycode.DebugAdapterTracker>;

	private _signService: ISignService | undefined;

	constructor(
		@IExtHostRpcService extHostRpcService: IExtHostRpcService,
		@IExtHostWorkspace protected _workspaceService: IExtHostWorkspace,
		@IExtHostExtensionService private _extensionService: IExtHostExtensionService,
		@IExtHostConfiguration protected _configurationService: IExtHostConfiguration,
		@IExtHostEditorTabs protected _editorTabs: IExtHostEditorTabs,
		@IExtHostVariableResolverProvider private _variableResolver: IExtHostVariableResolverProvider,
	) {
		this._configProviderHandleCounter = 0;
		this._configProviders = [];

		this._adapterFactoryHandleCounter = 0;
		this._adapterFactories = [];

		this._trackerFactoryHandleCounter = 0;
		this._trackerFactories = [];

		this._debugAdapters = new Map();
		this._debugAdaptersTrackers = new Map();

		this._onDidStartDebugSession = new Emitter<zycode.DebugSession>();
		this._onDidTerminateDebugSession = new Emitter<zycode.DebugSession>();
		this._onDidChangeActiveDebugSession = new Emitter<zycode.DebugSession | undefined>();
		this._onDidReceiveDebugSessionCustomEvent = new Emitter<zycode.DebugSessionCustomEvent>();

		this._debugServiceProxy = extHostRpcService.getProxy(MainContext.MainThreadDebugService);

		this._onDidChangeBreakpoints = new Emitter<zycode.BreakpointsChangeEvent>();

		this._onDidChangeStackFrameFocus = new Emitter<zycode.ThreadFocus | zycode.StackFrameFocus | undefined>();

		this._activeDebugConsole = new ExtHostDebugConsole(this._debugServiceProxy);

		this._breakpoints = new Map<string, zycode.Breakpoint>();

		this._extensionService.getExtensionRegistry().then((extensionRegistry: ExtensionDescriptionRegistry) => {
			extensionRegistry.onDidChange(_ => {
				this.registerAllDebugTypes(extensionRegistry);
			});
			this.registerAllDebugTypes(extensionRegistry);
		});
	}

	public asDebugSourceUri(src: zycode.DebugProtocolSource, session?: zycode.DebugSession): URI {

		const source = <any>src;

		if (typeof source.sourceReference === 'number' && source.sourceReference > 0) {
			// src can be retrieved via DAP's "source" request

			let debug = `debug:${encodeURIComponent(source.path || '')}`;
			let sep = '?';

			if (session) {
				debug += `${sep}session=${encodeURIComponent(session.id)}`;
				sep = '&';
			}

			debug += `${sep}ref=${source.sourceReference}`;

			return URI.parse(debug);
		} else if (source.path) {
			// src is just a local file path
			return URI.file(source.path);
		} else {
			throw new Error(`cannot create uri from DAP 'source' object; properties 'path' and 'sourceReference' are both missing.`);
		}
	}

	private registerAllDebugTypes(extensionRegistry: ExtensionDescriptionRegistry) {

		const debugTypes: string[] = [];

		for (const ed of extensionRegistry.getAllExtensionDescriptions()) {
			if (ed.contributes) {
				const debuggers = <IDebuggerContribution[]>ed.contributes['debuggers'];
				if (debuggers && debuggers.length > 0) {
					for (const dbg of debuggers) {
						if (isDebuggerMainContribution(dbg)) {
							debugTypes.push(dbg.type);
						}
					}
				}
			}
		}

		this._debugServiceProxy.$registerDebugTypes(debugTypes);
	}

	// extension debug API


	get stackFrameFocus(): zycode.ThreadFocus | zycode.StackFrameFocus | undefined {
		return this._stackFrameFocus;
	}

	get onDidChangeStackFrameFocus(): Event<zycode.ThreadFocus | zycode.StackFrameFocus | undefined> {
		return this._onDidChangeStackFrameFocus.event;
	}

	get onDidChangeBreakpoints(): Event<zycode.BreakpointsChangeEvent> {
		return this._onDidChangeBreakpoints.event;
	}

	get breakpoints(): zycode.Breakpoint[] {
		const result: zycode.Breakpoint[] = [];
		this._breakpoints.forEach(bp => result.push(bp));
		return result;
	}

	public addBreakpoints(breakpoints0: zycode.Breakpoint[]): Promise<void> {
		// filter only new breakpoints
		const breakpoints = breakpoints0.filter(bp => {
			const id = bp.id;
			if (!this._breakpoints.has(id)) {
				this._breakpoints.set(id, bp);
				return true;
			}
			return false;
		});

		// send notification for added breakpoints
		this.fireBreakpointChanges(breakpoints, [], []);

		// convert added breakpoints to DTOs
		const dtos: Array<ISourceMultiBreakpointDto | IFunctionBreakpointDto> = [];
		const map = new Map<string, ISourceMultiBreakpointDto>();
		for (const bp of breakpoints) {
			if (bp instanceof SourceBreakpoint) {
				let dto = map.get(bp.location.uri.toString());
				if (!dto) {
					dto = <ISourceMultiBreakpointDto>{
						type: 'sourceMulti',
						uri: bp.location.uri,
						lines: []
					};
					map.set(bp.location.uri.toString(), dto);
					dtos.push(dto);
				}
				dto.lines.push({
					id: bp.id,
					enabled: bp.enabled,
					condition: bp.condition,
					hitCondition: bp.hitCondition,
					logMessage: bp.logMessage,
					line: bp.location.range.start.line,
					character: bp.location.range.start.character
				});
			} else if (bp instanceof FunctionBreakpoint) {
				dtos.push({
					type: 'function',
					id: bp.id,
					enabled: bp.enabled,
					hitCondition: bp.hitCondition,
					logMessage: bp.logMessage,
					condition: bp.condition,
					functionName: bp.functionName
				});
			}
		}

		// send DTOs to VS Code
		return this._debugServiceProxy.$registerBreakpoints(dtos);
	}

	public removeBreakpoints(breakpoints0: zycode.Breakpoint[]): Promise<void> {
		// remove from array
		const breakpoints = breakpoints0.filter(b => this._breakpoints.delete(b.id));

		// send notification
		this.fireBreakpointChanges([], breakpoints, []);

		// unregister with VS Code
		const ids = breakpoints.filter(bp => bp instanceof SourceBreakpoint).map(bp => bp.id);
		const fids = breakpoints.filter(bp => bp instanceof FunctionBreakpoint).map(bp => bp.id);
		const dids = breakpoints.filter(bp => bp instanceof DataBreakpoint).map(bp => bp.id);
		return this._debugServiceProxy.$unregisterBreakpoints(ids, fids, dids);
	}

	public startDebugging(folder: zycode.WorkspaceFolder | undefined, nameOrConfig: string | zycode.DebugConfiguration, options: zycode.DebugSessionOptions): Promise<boolean> {
		return this._debugServiceProxy.$startDebugging(folder ? folder.uri : undefined, nameOrConfig, {
			parentSessionID: options.parentSession ? options.parentSession.id : undefined,
			lifecycleManagedByParent: options.lifecycleManagedByParent,
			repl: options.consoleMode === DebugConsoleMode.MergeWithParent ? 'mergeWithParent' : 'separate',
			noDebug: options.noDebug,
			compact: options.compact,
			suppressSaveBeforeStart: options.suppressSaveBeforeStart,

			// Check debugUI for back-compat, #147264
			suppressDebugStatusbar: options.suppressDebugStatusbar ?? (options as any).debugUI?.simple,
			suppressDebugToolbar: options.suppressDebugToolbar ?? (options as any).debugUI?.simple,
			suppressDebugView: options.suppressDebugView ?? (options as any).debugUI?.simple,
		});
	}

	public stopDebugging(session?: zycode.DebugSession): Promise<void> {
		return this._debugServiceProxy.$stopDebugging(session ? session.id : undefined);
	}

	public registerDebugConfigurationProvider(type: string, provider: zycode.DebugConfigurationProvider, trigger: zycode.DebugConfigurationProviderTriggerKind): zycode.Disposable {

		if (!provider) {
			return new Disposable(() => { });
		}

		const handle = this._configProviderHandleCounter++;
		this._configProviders.push({ type, handle, provider });

		this._debugServiceProxy.$registerDebugConfigurationProvider(type, trigger,
			!!provider.provideDebugConfigurations,
			!!provider.resolveDebugConfiguration,
			!!provider.resolveDebugConfigurationWithSubstitutedVariables,
			handle);

		return new Disposable(() => {
			this._configProviders = this._configProviders.filter(p => p.provider !== provider);		// remove
			this._debugServiceProxy.$unregisterDebugConfigurationProvider(handle);
		});
	}

	public registerDebugAdapterDescriptorFactory(extension: IExtensionDescription, type: string, factory: zycode.DebugAdapterDescriptorFactory): zycode.Disposable {

		if (!factory) {
			return new Disposable(() => { });
		}

		// a DebugAdapterDescriptorFactory can only be registered in the extension that contributes the debugger
		if (!this.definesDebugType(extension, type)) {
			throw new Error(`a DebugAdapterDescriptorFactory can only be registered from the extension that defines the '${type}' debugger.`);
		}

		// make sure that only one factory for this type is registered
		if (this.getAdapterDescriptorFactoryByType(type)) {
			throw new Error(`a DebugAdapterDescriptorFactory can only be registered once per a type.`);
		}

		const handle = this._adapterFactoryHandleCounter++;
		this._adapterFactories.push({ type, handle, factory });

		this._debugServiceProxy.$registerDebugAdapterDescriptorFactory(type, handle);

		return new Disposable(() => {
			this._adapterFactories = this._adapterFactories.filter(p => p.factory !== factory);		// remove
			this._debugServiceProxy.$unregisterDebugAdapterDescriptorFactory(handle);
		});
	}

	public registerDebugAdapterTrackerFactory(type: string, factory: zycode.DebugAdapterTrackerFactory): zycode.Disposable {

		if (!factory) {
			return new Disposable(() => { });
		}

		const handle = this._trackerFactoryHandleCounter++;
		this._trackerFactories.push({ type, handle, factory });

		return new Disposable(() => {
			this._trackerFactories = this._trackerFactories.filter(p => p.factory !== factory);		// remove
		});
	}

	// RPC methods (ExtHostDebugServiceShape)

	public async $runInTerminal(args: DebugProtocol.RunInTerminalRequestArguments, sessionId: string): Promise<number | undefined> {
		return Promise.resolve(undefined);
	}

	public async $substituteVariables(folderUri: UriComponents | undefined, config: IConfig): Promise<IConfig> {
		let ws: IWorkspaceFolder | undefined;
		const folder = await this.getFolder(folderUri);
		if (folder) {
			ws = {
				uri: folder.uri,
				name: folder.name,
				index: folder.index,
				toResource: () => {
					throw new Error('Not implemented');
				}
			};
		}
		const variableResolver = await this._variableResolver.getResolver();
		return variableResolver.resolveAnyAsync(ws, config);
	}

	protected createDebugAdapter(adapter: IAdapterDescriptor, session: ExtHostDebugSession): AbstractDebugAdapter | undefined {
		if (adapter.type === 'implementation') {
			return new DirectDebugAdapter(adapter.implementation);
		}
		return undefined;
	}

	protected createSignService(): ISignService | undefined {
		return undefined;
	}

	public async $startDASession(debugAdapterHandle: number, sessionDto: IDebugSessionDto): Promise<void> {
		const mythis = this;

		const session = await this.getSession(sessionDto);

		return this.getAdapterDescriptor(this.getAdapterDescriptorFactoryByType(session.type), session).then(daDescriptor => {

			if (!daDescriptor) {
				throw new Error(`Couldn't find a debug adapter descriptor for debug type '${session.type}' (extension might have failed to activate)`);
			}

			const adapterDescriptor = this.convertToDto(daDescriptor);

			const da = this.createDebugAdapter(adapterDescriptor, session);
			if (!da) {
				throw new Error(`Couldn't create a debug adapter for type '${session.type}'.`);
			}

			const debugAdapter = da;

			this._debugAdapters.set(debugAdapterHandle, debugAdapter);

			return this.getDebugAdapterTrackers(session).then(tracker => {

				if (tracker) {
					this._debugAdaptersTrackers.set(debugAdapterHandle, tracker);
				}

				debugAdapter.onMessage(async message => {

					if (message.type === 'request' && (<DebugProtocol.Request>message).command === 'handshake') {

						const request = <DebugProtocol.Request>message;

						const response: DebugProtocol.Response = {
							type: 'response',
							seq: 0,
							command: request.command,
							request_seq: request.seq,
							success: true
						};

						if (!this._signService) {
							this._signService = this.createSignService();
						}

						try {
							if (this._signService) {
								const signature = await this._signService.sign(request.arguments.value);
								response.body = {
									signature: signature
								};
								debugAdapter.sendResponse(response);
							} else {
								throw new Error('no signer');
							}
						} catch (e) {
							response.success = false;
							response.message = e.message;
							debugAdapter.sendResponse(response);
						}
					} else {
						if (tracker && tracker.onDidSendMessage) {
							tracker.onDidSendMessage(message);
						}

						// DA -> VS Code
						message = convertToVSCPaths(message, true);

						mythis._debugServiceProxy.$acceptDAMessage(debugAdapterHandle, message);
					}
				});
				debugAdapter.onError(err => {
					if (tracker && tracker.onError) {
						tracker.onError(err);
					}
					this._debugServiceProxy.$acceptDAError(debugAdapterHandle, err.name, err.message, err.stack);
				});
				debugAdapter.onExit((code: number | null) => {
					if (tracker && tracker.onExit) {
						tracker.onExit(code ?? undefined, undefined);
					}
					this._debugServiceProxy.$acceptDAExit(debugAdapterHandle, code ?? undefined, undefined);
				});

				if (tracker && tracker.onWillStartSession) {
					tracker.onWillStartSession();
				}

				return debugAdapter.startSession();
			});
		});
	}

	public $sendDAMessage(debugAdapterHandle: number, message: DebugProtocol.ProtocolMessage): void {

		// VS Code -> DA
		message = convertToDAPaths(message, false);

		const tracker = this._debugAdaptersTrackers.get(debugAdapterHandle);	// TODO@AW: same handle?
		if (tracker && tracker.onWillReceiveMessage) {
			tracker.onWillReceiveMessage(message);
		}

		const da = this._debugAdapters.get(debugAdapterHandle);
		da?.sendMessage(message);
	}

	public $stopDASession(debugAdapterHandle: number): Promise<void> {

		const tracker = this._debugAdaptersTrackers.get(debugAdapterHandle);
		this._debugAdaptersTrackers.delete(debugAdapterHandle);
		if (tracker && tracker.onWillStopSession) {
			tracker.onWillStopSession();
		}

		const da = this._debugAdapters.get(debugAdapterHandle);
		this._debugAdapters.delete(debugAdapterHandle);
		if (da) {
			return da.stopSession();
		} else {
			return Promise.resolve(void 0);
		}
	}

	public $acceptBreakpointsDelta(delta: IBreakpointsDeltaDto): void {

		const a: zycode.Breakpoint[] = [];
		const r: zycode.Breakpoint[] = [];
		const c: zycode.Breakpoint[] = [];

		if (delta.added) {
			for (const bpd of delta.added) {
				const id = bpd.id;
				if (id && !this._breakpoints.has(id)) {
					let bp: Breakpoint;
					if (bpd.type === 'function') {
						bp = new FunctionBreakpoint(bpd.functionName, bpd.enabled, bpd.condition, bpd.hitCondition, bpd.logMessage);
					} else if (bpd.type === 'data') {
						bp = new DataBreakpoint(bpd.label, bpd.dataId, bpd.canPersist, bpd.enabled, bpd.hitCondition, bpd.condition, bpd.logMessage);
					} else {
						const uri = URI.revive(bpd.uri);
						bp = new SourceBreakpoint(new Location(uri, new Position(bpd.line, bpd.character)), bpd.enabled, bpd.condition, bpd.hitCondition, bpd.logMessage);
					}
					setBreakpointId(bp, id);
					this._breakpoints.set(id, bp);
					a.push(bp);
				}
			}
		}

		if (delta.removed) {
			for (const id of delta.removed) {
				const bp = this._breakpoints.get(id);
				if (bp) {
					this._breakpoints.delete(id);
					r.push(bp);
				}
			}
		}

		if (delta.changed) {
			for (const bpd of delta.changed) {
				if (bpd.id) {
					const bp = this._breakpoints.get(bpd.id);
					if (bp) {
						if (bp instanceof FunctionBreakpoint && bpd.type === 'function') {
							const fbp = <any>bp;
							fbp.enabled = bpd.enabled;
							fbp.condition = bpd.condition;
							fbp.hitCondition = bpd.hitCondition;
							fbp.logMessage = bpd.logMessage;
							fbp.functionName = bpd.functionName;
						} else if (bp instanceof SourceBreakpoint && bpd.type === 'source') {
							const sbp = <any>bp;
							sbp.enabled = bpd.enabled;
							sbp.condition = bpd.condition;
							sbp.hitCondition = bpd.hitCondition;
							sbp.logMessage = bpd.logMessage;
							sbp.location = new Location(URI.revive(bpd.uri), new Position(bpd.line, bpd.character));
						}
						c.push(bp);
					}
				}
			}
		}

		this.fireBreakpointChanges(a, r, c);
	}

	public async $acceptStackFrameFocus(focusDto: IThreadFocusDto | IStackFrameFocusDto): Promise<void> {
		let focus: ThreadFocus | StackFrameFocus;
		const session = focusDto.sessionId ? await this.getSession(focusDto.sessionId) : undefined;
		if (!session) {
			throw new Error('no DebugSession found for debug focus context');
		}

		if (focusDto.kind === 'thread') {
			focus = new ThreadFocus(session, focusDto.threadId);
		} else {
			focus = new StackFrameFocus(session, focusDto.threadId, focusDto.frameId);
		}

		this._stackFrameFocus = <zycode.ThreadFocus | zycode.StackFrameFocus>focus;
		this._onDidChangeStackFrameFocus.fire(this._stackFrameFocus);
	}

	public $provideDebugConfigurations(configProviderHandle: number, folderUri: UriComponents | undefined, token: CancellationToken): Promise<zycode.DebugConfiguration[]> {
		return asPromise(async () => {
			const provider = this.getConfigProviderByHandle(configProviderHandle);
			if (!provider) {
				throw new Error('no DebugConfigurationProvider found');
			}
			if (!provider.provideDebugConfigurations) {
				throw new Error('DebugConfigurationProvider has no method provideDebugConfigurations');
			}
			const folder = await this.getFolder(folderUri);
			return provider.provideDebugConfigurations(folder, token);
		}).then(debugConfigurations => {
			if (!debugConfigurations) {
				throw new Error('nothing returned from DebugConfigurationProvider.provideDebugConfigurations');
			}
			return debugConfigurations;
		});
	}

	public $resolveDebugConfiguration(configProviderHandle: number, folderUri: UriComponents | undefined, debugConfiguration: zycode.DebugConfiguration, token: CancellationToken): Promise<zycode.DebugConfiguration | null | undefined> {
		return asPromise(async () => {
			const provider = this.getConfigProviderByHandle(configProviderHandle);
			if (!provider) {
				throw new Error('no DebugConfigurationProvider found');
			}
			if (!provider.resolveDebugConfiguration) {
				throw new Error('DebugConfigurationProvider has no method resolveDebugConfiguration');
			}
			const folder = await this.getFolder(folderUri);
			return provider.resolveDebugConfiguration(folder, debugConfiguration, token);
		});
	}

	public $resolveDebugConfigurationWithSubstitutedVariables(configProviderHandle: number, folderUri: UriComponents | undefined, debugConfiguration: zycode.DebugConfiguration, token: CancellationToken): Promise<zycode.DebugConfiguration | null | undefined> {
		return asPromise(async () => {
			const provider = this.getConfigProviderByHandle(configProviderHandle);
			if (!provider) {
				throw new Error('no DebugConfigurationProvider found');
			}
			if (!provider.resolveDebugConfigurationWithSubstitutedVariables) {
				throw new Error('DebugConfigurationProvider has no method resolveDebugConfigurationWithSubstitutedVariables');
			}
			const folder = await this.getFolder(folderUri);
			return provider.resolveDebugConfigurationWithSubstitutedVariables(folder, debugConfiguration, token);
		});
	}

	public async $provideDebugAdapter(adapterFactoryHandle: number, sessionDto: IDebugSessionDto): Promise<Dto<IAdapterDescriptor>> {
		const adapterDescriptorFactory = this.getAdapterDescriptorFactoryByHandle(adapterFactoryHandle);
		if (!adapterDescriptorFactory) {
			return Promise.reject(new Error('no adapter descriptor factory found for handle'));
		}
		const session = await this.getSession(sessionDto);
		return this.getAdapterDescriptor(adapterDescriptorFactory, session).then(adapterDescriptor => {
			if (!adapterDescriptor) {
				throw new Error(`Couldn't find a debug adapter descriptor for debug type '${session.type}'`);
			}
			return this.convertToDto(adapterDescriptor);
		});
	}

	public async $acceptDebugSessionStarted(sessionDto: IDebugSessionDto): Promise<void> {
		const session = await this.getSession(sessionDto);
		this._onDidStartDebugSession.fire(session);
	}

	public async $acceptDebugSessionTerminated(sessionDto: IDebugSessionDto): Promise<void> {
		const session = await this.getSession(sessionDto);
		if (session) {
			this._onDidTerminateDebugSession.fire(session);
			this._debugSessions.delete(session.id);
		}
	}

	public async $acceptDebugSessionActiveChanged(sessionDto: IDebugSessionDto | undefined): Promise<void> {
		this._activeDebugSession = sessionDto ? await this.getSession(sessionDto) : undefined;
		this._onDidChangeActiveDebugSession.fire(this._activeDebugSession);
	}

	public async $acceptDebugSessionNameChanged(sessionDto: IDebugSessionDto, name: string): Promise<void> {
		const session = await this.getSession(sessionDto);
		session?._acceptNameChanged(name);
	}

	public async $acceptDebugSessionCustomEvent(sessionDto: IDebugSessionDto, event: any): Promise<void> {
		const session = await this.getSession(sessionDto);
		const ee: zycode.DebugSessionCustomEvent = {
			session: session,
			event: event.event,
			body: event.body
		};
		this._onDidReceiveDebugSessionCustomEvent.fire(ee);
	}

	// private & dto helpers

	private convertToDto(x: zycode.DebugAdapterDescriptor): Dto<IAdapterDescriptor> {

		if (x instanceof DebugAdapterExecutable) {
			return <IDebugAdapterExecutable>{
				type: 'executable',
				command: x.command,
				args: x.args,
				options: x.options
			};
		} else if (x instanceof DebugAdapterServer) {
			return <IDebugAdapterServer>{
				type: 'server',
				port: x.port,
				host: x.host
			};
		} else if (x instanceof DebugAdapterNamedPipeServer) {
			return <IDebugAdapterNamedPipeServer>{
				type: 'pipeServer',
				path: x.path
			};
		} else if (x instanceof DebugAdapterInlineImplementation) {
			return <Dto<IAdapterDescriptor>>{
				type: 'implementation',
				implementation: x.implementation
			};
		} else {
			throw new Error('convertToDto unexpected type');
		}
	}

	private getAdapterDescriptorFactoryByType(type: string): zycode.DebugAdapterDescriptorFactory | undefined {
		const results = this._adapterFactories.filter(p => p.type === type);
		if (results.length > 0) {
			return results[0].factory;
		}
		return undefined;
	}

	private getAdapterDescriptorFactoryByHandle(handle: number): zycode.DebugAdapterDescriptorFactory | undefined {
		const results = this._adapterFactories.filter(p => p.handle === handle);
		if (results.length > 0) {
			return results[0].factory;
		}
		return undefined;
	}

	private getConfigProviderByHandle(handle: number): zycode.DebugConfigurationProvider | undefined {
		const results = this._configProviders.filter(p => p.handle === handle);
		if (results.length > 0) {
			return results[0].provider;
		}
		return undefined;
	}

	private definesDebugType(ed: IExtensionDescription, type: string) {
		if (ed.contributes) {
			const debuggers = <IDebuggerContribution[]>ed.contributes['debuggers'];
			if (debuggers && debuggers.length > 0) {
				for (const dbg of debuggers) {
					// only debugger contributions with a "label" are considered a "defining" debugger contribution
					if (dbg.label && dbg.type) {
						if (dbg.type === type) {
							return true;
						}
					}
				}
			}
		}
		return false;
	}

	private getDebugAdapterTrackers(session: ExtHostDebugSession): Promise<zycode.DebugAdapterTracker | undefined> {

		const config = session.configuration;
		const type = config.type;

		const promises = this._trackerFactories
			.filter(tuple => tuple.type === type || tuple.type === '*')
			.map(tuple => asPromise<zycode.ProviderResult<zycode.DebugAdapterTracker>>(() => tuple.factory.createDebugAdapterTracker(session)).then(p => p, err => null));

		return Promise.race([
			Promise.all(promises).then(result => {
				const trackers = <zycode.DebugAdapterTracker[]>result.filter(t => !!t);	// filter null
				if (trackers.length > 0) {
					return new MultiTracker(trackers);
				}
				return undefined;
			}),
			new Promise<undefined>(resolve => setTimeout(() => resolve(undefined), 1000)),
		]).catch(err => {
			// ignore errors
			return undefined;
		});
	}

	private async getAdapterDescriptor(adapterDescriptorFactory: zycode.DebugAdapterDescriptorFactory | undefined, session: ExtHostDebugSession): Promise<zycode.DebugAdapterDescriptor | undefined> {

		// a "debugServer" attribute in the launch config takes precedence
		const serverPort = session.configuration.debugServer;
		if (typeof serverPort === 'number') {
			return Promise.resolve(new DebugAdapterServer(serverPort));
		}

		if (adapterDescriptorFactory) {
			const extensionRegistry = await this._extensionService.getExtensionRegistry();
			return asPromise(() => adapterDescriptorFactory.createDebugAdapterDescriptor(session, this.daExecutableFromPackage(session, extensionRegistry))).then(daDescriptor => {
				if (daDescriptor) {
					return daDescriptor;
				}
				return undefined;
			});
		}

		// fallback: use executable information from package.json
		const extensionRegistry = await this._extensionService.getExtensionRegistry();
		return Promise.resolve(this.daExecutableFromPackage(session, extensionRegistry));
	}

	protected daExecutableFromPackage(session: ExtHostDebugSession, extensionRegistry: ExtensionDescriptionRegistry): DebugAdapterExecutable | undefined {
		return undefined;
	}

	private fireBreakpointChanges(added: zycode.Breakpoint[], removed: zycode.Breakpoint[], changed: zycode.Breakpoint[]) {
		if (added.length > 0 || removed.length > 0 || changed.length > 0) {
			this._onDidChangeBreakpoints.fire(Object.freeze({
				added,
				removed,
				changed,
			}));
		}
	}

	private async getSession(dto: IDebugSessionDto): Promise<ExtHostDebugSession> {
		if (dto) {
			if (typeof dto === 'string') {
				const ds = this._debugSessions.get(dto);
				if (ds) {
					return ds;
				}
			} else {
				let ds = this._debugSessions.get(dto.id);
				if (!ds) {
					const folder = await this.getFolder(dto.folderUri);
					const parent = dto.parent ? this._debugSessions.get(dto.parent) : undefined;
					ds = new ExtHostDebugSession(this._debugServiceProxy, dto.id, dto.type, dto.name, folder, dto.configuration, parent);
					this._debugSessions.set(ds.id, ds);
					this._debugServiceProxy.$sessionCached(ds.id);
				}
				return ds;
			}
		}
		throw new Error('cannot find session');
	}

	private getFolder(_folderUri: UriComponents | undefined): Promise<zycode.WorkspaceFolder | undefined> {
		if (_folderUri) {
			const folderURI = URI.revive(_folderUri);
			return this._workspaceService.resolveWorkspaceFolder(folderURI);
		}
		return Promise.resolve(undefined);
	}
}

export class ExtHostDebugSession implements zycode.DebugSession {

	constructor(
		private _debugServiceProxy: MainThreadDebugServiceShape,
		private _id: DebugSessionUUID,
		private _type: string,
		private _name: string,
		private _workspaceFolder: zycode.WorkspaceFolder | undefined,
		private _configuration: zycode.DebugConfiguration,
		private _parentSession: zycode.DebugSession | undefined) {
	}

	public get id(): string {
		return this._id;
	}

	public get type(): string {
		return this._type;
	}

	public get name(): string {
		return this._name;
	}
	public set name(name: string) {
		this._name = name;
		this._debugServiceProxy.$setDebugSessionName(this._id, name);
	}

	public get parentSession(): zycode.DebugSession | undefined {
		return this._parentSession;
	}

	_acceptNameChanged(name: string) {
		this._name = name;
	}

	public get workspaceFolder(): zycode.WorkspaceFolder | undefined {
		return this._workspaceFolder;
	}

	public get configuration(): zycode.DebugConfiguration {
		return this._configuration;
	}

	public customRequest(command: string, args: any): Promise<any> {
		return this._debugServiceProxy.$customDebugAdapterRequest(this._id, command, args);
	}

	public getDebugProtocolBreakpoint(breakpoint: zycode.Breakpoint): Promise<zycode.DebugProtocolBreakpoint | undefined> {
		return this._debugServiceProxy.$getDebugProtocolBreakpoint(this._id, breakpoint.id);
	}
}

export class ExtHostDebugConsole {

	readonly value: zycode.DebugConsole;

	constructor(proxy: MainThreadDebugServiceShape) {

		this.value = Object.freeze({
			append(value: string): void {
				proxy.$appendDebugConsole(value);
			},
			appendLine(value: string): void {
				this.append(value + '\n');
			}
		});
	}
}

interface ConfigProviderTuple {
	type: string;
	handle: number;
	provider: zycode.DebugConfigurationProvider;
}

interface DescriptorFactoryTuple {
	type: string;
	handle: number;
	factory: zycode.DebugAdapterDescriptorFactory;
}

interface TrackerFactoryTuple {
	type: string;
	handle: number;
	factory: zycode.DebugAdapterTrackerFactory;
}

class MultiTracker implements zycode.DebugAdapterTracker {

	constructor(private trackers: zycode.DebugAdapterTracker[]) {
	}

	onWillStartSession(): void {
		this.trackers.forEach(t => t.onWillStartSession ? t.onWillStartSession() : undefined);
	}

	onWillReceiveMessage(message: any): void {
		this.trackers.forEach(t => t.onWillReceiveMessage ? t.onWillReceiveMessage(message) : undefined);
	}

	onDidSendMessage(message: any): void {
		this.trackers.forEach(t => t.onDidSendMessage ? t.onDidSendMessage(message) : undefined);
	}

	onWillStopSession(): void {
		this.trackers.forEach(t => t.onWillStopSession ? t.onWillStopSession() : undefined);
	}

	onError(error: Error): void {
		this.trackers.forEach(t => t.onError ? t.onError(error) : undefined);
	}

	onExit(code: number, signal: string): void {
		this.trackers.forEach(t => t.onExit ? t.onExit(code, signal) : undefined);
	}
}

/*
 * Call directly into a debug adapter implementation
 */
class DirectDebugAdapter extends AbstractDebugAdapter {

	constructor(private implementation: zycode.DebugAdapter) {
		super();

		implementation.onDidSendMessage((message: zycode.DebugProtocolMessage) => {
			this.acceptMessage(message as DebugProtocol.ProtocolMessage);
		});
	}

	startSession(): Promise<void> {
		return Promise.resolve(undefined);
	}

	sendMessage(message: DebugProtocol.ProtocolMessage): void {
		this.implementation.handleMessage(message);
	}

	stopSession(): Promise<void> {
		this.implementation.dispose();
		return Promise.resolve(undefined);
	}
}


export class WorkerExtHostDebugService extends ExtHostDebugServiceBase {
	constructor(
		@IExtHostRpcService extHostRpcService: IExtHostRpcService,
		@IExtHostWorkspace workspaceService: IExtHostWorkspace,
		@IExtHostExtensionService extensionService: IExtHostExtensionService,
		@IExtHostConfiguration configurationService: IExtHostConfiguration,
		@IExtHostEditorTabs editorTabs: IExtHostEditorTabs,
		@IExtHostVariableResolverProvider variableResolver: IExtHostVariableResolverProvider
	) {
		super(extHostRpcService, workspaceService, extensionService, configurationService, editorTabs, variableResolver);
	}
}
