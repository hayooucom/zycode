/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as zycode from 'zycode';

declare function require(path: string): any;

const markdownMathSetting = 'markdown.math';

export function activate(context: zycode.ExtensionContext) {
	function isEnabled(): boolean {
		const config = zycode.workspace.getConfiguration('markdown');
		return config.get<boolean>('math.enabled', true);
	}

	function getMacros(): { [key: string]: string } {
		const config = zycode.workspace.getConfiguration('markdown');
		return config.get<{ [key: string]: string }>('math.macros', {});
	}

	zycode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration(markdownMathSetting)) {
			zycode.commands.executeCommand('markdown.api.reloadPlugins');
		}
	}, undefined, context.subscriptions);

	return {
		extendMarkdownIt(md: any) {
			if (isEnabled()) {
				const katex = require('@zycode/markdown-it-katex');
				const settingsMacros = getMacros();
				const options = { globalGroup: true, macros: { ...settingsMacros } };
				md.core.ruler.push('reset-katex-macros', () => {
					options.macros = { ...settingsMacros };
				});
				return md.use(katex, options);
			}
			return md;
		}
	};
}
