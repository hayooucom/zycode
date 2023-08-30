/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';

export interface Command {
	readonly id: string;

	execute(...args: any[]): void | any;
}

export class CommandManager {
	private readonly commands = new Map<string, zycode.Disposable>();

	public dispose() {
		for (const registration of this.commands.values()) {
			registration.dispose();
		}
		this.commands.clear();
	}

	public register<T extends Command>(command: T): T {
		if (!this.commands.has(command.id)) {
			this.commands.set(command.id, zycode.commands.registerCommand(command.id, command.execute, command));
		}
		return command;
	}
}
