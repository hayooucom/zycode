/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import { Environment, EnvironmentParameters } from '@azure/ms-rest-azure-env';
import { AzureActiveDirectoryService, IStoredSession } from './AADHelper';
import { BetterTokenStorage } from './betterSecretStorage';
import { UriEventHandler } from './UriEventHandler';
import TelemetryReporter from '@zycode/extension-telemetry';

async function initMicrosoftSovereignCloudAuthProvider(context: zycode.ExtensionContext, telemetryReporter: TelemetryReporter, uriHandler: UriEventHandler, tokenStorage: BetterTokenStorage<IStoredSession>): Promise<zycode.Disposable | undefined> {
	const environment = zycode.workspace.getConfiguration('microsoft-sovereign-cloud').get<string | undefined>('environment');
	let authProviderName: string | undefined;
	if (!environment) {
		return undefined;
	}

	if (environment === 'custom') {
		const customEnv = zycode.workspace.getConfiguration('microsoft-sovereign-cloud').get<EnvironmentParameters>('customEnvironment');
		if (!customEnv) {
			const res = await zycode.window.showErrorMessage(zycode.l10n.t('You must also specify a custom environment in order to use the custom environment auth provider.'), zycode.l10n.t('Open settings'));
			if (res) {
				await zycode.commands.executeCommand('workbench.action.openSettingsJson', 'microsoft-sovereign-cloud.customEnvironment');
			}
			return undefined;
		}
		try {
			Environment.add(customEnv);
		} catch (e) {
			const res = await zycode.window.showErrorMessage(zycode.l10n.t('Error validating custom environment setting: {0}', e.message), zycode.l10n.t('Open settings'));
			if (res) {
				await zycode.commands.executeCommand('workbench.action.openSettings', 'microsoft-sovereign-cloud.customEnvironment');
			}
			return undefined;
		}
		authProviderName = customEnv.name;
	} else {
		authProviderName = environment;
	}

	const env = Environment.get(authProviderName);
	if (!env) {
		const res = await zycode.window.showErrorMessage(zycode.l10n.t('The environment `{0}` is not a valid environment.', authProviderName), zycode.l10n.t('Open settings'));
		return undefined;
	}

	const aadService = new AzureActiveDirectoryService(
		zycode.window.createOutputChannel(zycode.l10n.t('Microsoft Sovereign Cloud Authentication'), { log: true }),
		context,
		uriHandler,
		tokenStorage,
		telemetryReporter,
		env);
	await aadService.initialize();

	const disposable = zycode.authentication.registerAuthenticationProvider('microsoft-sovereign-cloud', authProviderName, {
		onDidChangeSessions: aadService.onDidChangeSessions,
		getSessions: (scopes: string[]) => aadService.getSessions(scopes),
		createSession: async (scopes: string[]) => {
			try {
				/* __GDPR__
					"login" : {
						"owner": "TylerLeonhardt",
						"comment": "Used to determine the usage of the Microsoft Sovereign Cloud Auth Provider.",
						"scopes": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight", "comment": "Used to determine what scope combinations are being requested." }
					}
				*/
				telemetryReporter.sendTelemetryEvent('loginMicrosoftSovereignCloud', {
					// Get rid of guids from telemetry.
					scopes: JSON.stringify(scopes.map(s => s.replace(/[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/i, '{guid}'))),
				});

				return await aadService.createSession(scopes.sort());
			} catch (e) {
				/* __GDPR__
					"loginFailed" : { "owner": "TylerLeonhardt", "comment": "Used to determine how often users run into issues with the login flow." }
				*/
				telemetryReporter.sendTelemetryEvent('loginMicrosoftSovereignCloudFailed');

				throw e;
			}
		},
		removeSession: async (id: string) => {
			try {
				/* __GDPR__
					"logout" : { "owner": "TylerLeonhardt", "comment": "Used to determine how often users log out." }
				*/
				telemetryReporter.sendTelemetryEvent('logoutMicrosoftSovereignCloud');

				await aadService.removeSessionById(id);
			} catch (e) {
				/* __GDPR__
					"logoutFailed" : { "owner": "TylerLeonhardt", "comment": "Used to determine how often fail to log out." }
				*/
				telemetryReporter.sendTelemetryEvent('logoutMicrosoftSovereignCloudFailed');
			}
		}
	}, { supportsMultipleAccounts: true });

	context.subscriptions.push(disposable);
	return disposable;
}

export async function activate(context: zycode.ExtensionContext) {
	const aiKey: string = context.extension.packageJSON.aiKey;
	const telemetryReporter = new TelemetryReporter(aiKey);

	const uriHandler = new UriEventHandler();
	context.subscriptions.push(uriHandler);
	context.subscriptions.push(zycode.window.registerUriHandler(uriHandler));
	const betterSecretStorage = new BetterTokenStorage<IStoredSession>('microsoft.login.keylist', context);

	const loginService = new AzureActiveDirectoryService(
		zycode.window.createOutputChannel(zycode.l10n.t('Microsoft Authentication'), { log: true }),
		context,
		uriHandler,
		betterSecretStorage,
		telemetryReporter,
		Environment.AzureCloud);
	await loginService.initialize();

	context.subscriptions.push(zycode.authentication.registerAuthenticationProvider('microsoft', 'Microsoft', {
		onDidChangeSessions: loginService.onDidChangeSessions,
		getSessions: (scopes: string[]) => loginService.getSessions(scopes),
		createSession: async (scopes: string[]) => {
			try {
				/* __GDPR__
					"login" : {
						"owner": "TylerLeonhardt",
						"comment": "Used to determine the usage of the Microsoft Auth Provider.",
						"scopes": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight", "comment": "Used to determine what scope combinations are being requested." }
					}
				*/
				telemetryReporter.sendTelemetryEvent('login', {
					// Get rid of guids from telemetry.
					scopes: JSON.stringify(scopes.map(s => s.replace(/[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/i, '{guid}'))),
				});

				return await loginService.createSession(scopes.sort());
			} catch (e) {
				/* __GDPR__
					"loginFailed" : { "owner": "TylerLeonhardt", "comment": "Used to determine how often users run into issues with the login flow." }
				*/
				telemetryReporter.sendTelemetryEvent('loginFailed');

				throw e;
			}
		},
		removeSession: async (id: string) => {
			try {
				/* __GDPR__
					"logout" : { "owner": "TylerLeonhardt", "comment": "Used to determine how often users log out." }
				*/
				telemetryReporter.sendTelemetryEvent('logout');

				await loginService.removeSessionById(id);
			} catch (e) {
				/* __GDPR__
					"logoutFailed" : { "owner": "TylerLeonhardt", "comment": "Used to determine how often fail to log out." }
				*/
				telemetryReporter.sendTelemetryEvent('logoutFailed');
			}
		}
	}, { supportsMultipleAccounts: true }));

	let microsoftSovereignCloudAuthProviderDisposable = await initMicrosoftSovereignCloudAuthProvider(context, telemetryReporter, uriHandler, betterSecretStorage);

	context.subscriptions.push(zycode.workspace.onDidChangeConfiguration(async e => {
		if (e.affectsConfiguration('microsoft-sovereign-cloud')) {
			microsoftSovereignCloudAuthProviderDisposable?.dispose();
			microsoftSovereignCloudAuthProviderDisposable = await initMicrosoftSovereignCloudAuthProvider(context, telemetryReporter, uriHandler, betterSecretStorage);
		}
	}));

	return;
}

// this method is called when your extension is deactivated
export function deactivate() { }
