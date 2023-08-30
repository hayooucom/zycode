/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import { homedir } from 'os';

import { activateEmmetExtension } from '../emmetCommon';
import { setHomeDir } from '../util';

export function activate(context: zycode.ExtensionContext) {
	context.subscriptions.push(zycode.commands.registerCommand('editor.emmet.action.updateImageSize', () => {
		return import('../updateImageSize').then(uis => uis.updateImageSize());
	}));

	setHomeDir(zycode.Uri.file(homedir()));
	activateEmmetExtension(context);
}
