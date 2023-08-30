/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import { Command } from './commandManager';

export interface OpenJsDocLinkCommand_Args {
	readonly file: zycode.Uri;
	readonly position: zycode.Position;
}

/**
 * Proxy command for opening links in jsdoc comments.
 *
 * This is needed to avoid incorrectly rewriting uris.
 */
export class OpenJsDocLinkCommand implements Command {
	public static readonly id = '_typescript.openJsDocLink';
	public readonly id = OpenJsDocLinkCommand.id;

	public async execute(args: OpenJsDocLinkCommand_Args): Promise<void> {
		await zycode.commands.executeCommand('zycode.open', zycode.Uri.from(args.file), <zycode.TextDocumentShowOptions>{
			selection: new zycode.Range(args.position, args.position),
		});
	}
}
