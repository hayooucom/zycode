/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';

export interface TSConfig {
	readonly uri: zycode.Uri;
	readonly fsPath: string;
	readonly posixPath: string;
	readonly workspaceFolder?: zycode.WorkspaceFolder;
}

export class TsConfigProvider {
	public async getConfigsForWorkspace(token: zycode.CancellationToken): Promise<Iterable<TSConfig>> {
		if (!zycode.workspace.workspaceFolders) {
			return [];
		}

		const configs = new Map<string, TSConfig>();
		for (const config of await this.findConfigFiles(token)) {
			const root = zycode.workspace.getWorkspaceFolder(config);
			if (root) {
				configs.set(config.fsPath, {
					uri: config,
					fsPath: config.fsPath,
					posixPath: config.path,
					workspaceFolder: root
				});
			}
		}
		return configs.values();
	}

	private async findConfigFiles(token: zycode.CancellationToken): Promise<zycode.Uri[]> {
		return await zycode.workspace.findFiles('**/tsconfig*.json', '**/{node_modules,.*}/**', undefined, token);
	}
}
