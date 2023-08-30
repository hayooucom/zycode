/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as zycode from 'zycode';
import { memoize } from '../utils/memoize';
import { ILogDirectoryProvider } from './logDirectoryProvider';

export class NodeLogDirectoryProvider implements ILogDirectoryProvider {
	public constructor(
		private readonly context: zycode.ExtensionContext
	) { }

	public getNewLogDirectory(): zycode.Uri | undefined {
		const root = this.logDirectory();
		if (root) {
			try {
				return zycode.Uri.file(fs.mkdtempSync(path.join(root, `tsserver-log-`)));
			} catch (e) {
				return undefined;
			}
		}
		return undefined;
	}

	@memoize
	private logDirectory(): string | undefined {
		try {
			const path = this.context.logPath;
			if (!fs.existsSync(path)) {
				fs.mkdirSync(path);
			}
			return this.context.logPath;
		} catch {
			return undefined;
		}
	}
}
