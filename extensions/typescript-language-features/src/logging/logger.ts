/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import { memoize } from '../utils/memoize';

export class Logger {

	@memoize
	private get output(): zycode.LogOutputChannel {
		return zycode.window.createOutputChannel('TypeScript', { log: true });
	}

	public get logLevel(): zycode.LogLevel {
		return this.output.logLevel;
	}

	public info(message: string, ...args: any[]): void {
		this.output.info(message, ...args);
	}

	public trace(message: string, ...args: any[]): void {
		this.output.trace(message, ...args);
	}

	public error(message: string, data?: any): void {
		// See https://github.com/microsoft/TypeScript/issues/10496
		if (data && data.message === 'No content available.') {
			return;
		}
		this.output.error(message, ...(data ? [data] : []));
	}
}
