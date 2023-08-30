/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Severity from 'vs/base/common/severity';
import type * as zycode from 'zycode';
import { MainContext, MainThreadMessageServiceShape, MainThreadMessageOptions, IMainContext } from './extHost.protocol';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { checkProposedApiEnabled } from 'vs/workbench/services/extensions/common/extensions';

function isMessageItem(item: any): item is zycode.MessageItem {
	return item && item.title;
}

export class ExtHostMessageService {

	private _proxy: MainThreadMessageServiceShape;

	constructor(
		mainContext: IMainContext,
		@ILogService private readonly _logService: ILogService
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadMessageService);
	}


	showMessage(extension: IExtensionDescription, severity: Severity, message: string, optionsOrFirstItem: zycode.MessageOptions | string | undefined, rest: string[]): Promise<string | undefined>;
	showMessage(extension: IExtensionDescription, severity: Severity, message: string, optionsOrFirstItem: zycode.MessageOptions | zycode.MessageItem | undefined, rest: zycode.MessageItem[]): Promise<zycode.MessageItem | undefined>;
	showMessage(extension: IExtensionDescription, severity: Severity, message: string, optionsOrFirstItem: zycode.MessageOptions | zycode.MessageItem | string | undefined, rest: Array<zycode.MessageItem | string>): Promise<string | zycode.MessageItem | undefined>;
	showMessage(extension: IExtensionDescription, severity: Severity, message: string, optionsOrFirstItem: zycode.MessageOptions | string | zycode.MessageItem | undefined, rest: Array<string | zycode.MessageItem>): Promise<string | zycode.MessageItem | undefined> {

		const options: MainThreadMessageOptions = {
			source: { identifier: extension.identifier, label: extension.displayName || extension.name }
		};
		let items: (string | zycode.MessageItem)[];

		if (typeof optionsOrFirstItem === 'string' || isMessageItem(optionsOrFirstItem)) {
			items = [optionsOrFirstItem, ...rest];
		} else {
			options.modal = optionsOrFirstItem?.modal;
			options.useCustom = optionsOrFirstItem?.useCustom;
			options.detail = optionsOrFirstItem?.detail;
			items = rest;
		}

		if (options.useCustom) {
			checkProposedApiEnabled(extension, 'resolvers');
		}

		const commands: { title: string; isCloseAffordance: boolean; handle: number }[] = [];

		for (let handle = 0; handle < items.length; handle++) {
			const command = items[handle];
			if (typeof command === 'string') {
				commands.push({ title: command, handle, isCloseAffordance: false });
			} else if (typeof command === 'object') {
				const { title, isCloseAffordance } = command;
				commands.push({ title, isCloseAffordance: !!isCloseAffordance, handle });
			} else {
				this._logService.warn('Invalid message item:', command);
			}
		}

		return this._proxy.$showMessage(severity, message, options, commands).then(handle => {
			if (typeof handle === 'number') {
				return items[handle];
			}
			return undefined;
		});
	}
}
