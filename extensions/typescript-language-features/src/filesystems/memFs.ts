/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import { basename, dirname } from 'path';

export class MemFs implements zycode.FileSystemProvider {

	private readonly root = new FsEntry(
		new Map(),
		0,
		0,
	);

	stat(uri: zycode.Uri): zycode.FileStat {
		// console.log('stat', uri.toString());
		const entry = this.getEntry(uri);
		if (!entry) {
			throw zycode.FileSystemError.FileNotFound();
		}

		return entry;
	}

	readDirectory(uri: zycode.Uri): [string, zycode.FileType][] {
		// console.log('readDirectory', uri.toString());

		const entry = this.getEntry(uri);
		if (!entry) {
			throw zycode.FileSystemError.FileNotFound();
		}

		return [...entry.contents.entries()].map(([name, entry]) => [name, entry.type]);
	}

	readFile(uri: zycode.Uri): Uint8Array {
		// console.log('readFile', uri.toString());

		const entry = this.getEntry(uri);
		if (!entry) {
			throw zycode.FileSystemError.FileNotFound();
		}

		return entry.data;
	}

	writeFile(uri: zycode.Uri, content: Uint8Array, { create, overwrite }: { create: boolean; overwrite: boolean }): void {
		// console.log('writeFile', uri.toString());

		const dir = this.getParent(uri);

		const fileName = basename(uri.path);
		const dirContents = dir.contents;

		const time = Date.now() / 1000;
		const entry = dirContents.get(basename(uri.path));
		if (!entry) {
			if (create) {
				dirContents.set(fileName, new FsEntry(content, time, time));
				this._emitter.fire([{ type: zycode.FileChangeType.Created, uri }]);
			} else {
				throw zycode.FileSystemError.FileNotFound();
			}
		} else {
			if (overwrite) {
				entry.mtime = time;
				entry.data = content;
				this._emitter.fire([{ type: zycode.FileChangeType.Changed, uri }]);
			} else {
				throw zycode.FileSystemError.NoPermissions('overwrite option was not passed in');
			}
		}
	}

	rename(_oldUri: zycode.Uri, _newUri: zycode.Uri, _options: { overwrite: boolean }): void {
		throw new Error('not implemented');
	}

	delete(uri: zycode.Uri): void {
		try {
			const dir = this.getParent(uri);
			dir.contents.delete(basename(uri.path));
			this._emitter.fire([{ type: zycode.FileChangeType.Deleted, uri }]);
		} catch (e) { }
	}

	createDirectory(uri: zycode.Uri): void {
		// console.log('createDirectory', uri.toString());
		const dir = this.getParent(uri);
		const now = Date.now() / 1000;
		dir.contents.set(basename(uri.path), new FsEntry(new Map(), now, now));
	}

	private getEntry(uri: zycode.Uri): FsEntry | void {
		// TODO: have this throw FileNotFound itself?
		// TODO: support configuring case sensitivity
		let node: FsEntry = this.root;
		for (const component of uri.path.split('/')) {
			if (!component) {
				// Skip empty components (root, stuff between double slashes,
				// trailing slashes)
				continue;
			}

			if (node.type !== zycode.FileType.Directory) {
				// We're looking at a File or such, so bail.
				return;
			}

			const next = node.contents.get(component);

			if (!next) {
				// not found!
				return;
			}

			node = next;
		}
		return node;
	}

	private getParent(uri: zycode.Uri) {
		const dir = this.getEntry(uri.with({ path: dirname(uri.path) }));
		if (!dir) {
			throw zycode.FileSystemError.FileNotFound();
		}
		return dir;
	}

	// --- manage file events

	private readonly _emitter = new zycode.EventEmitter<zycode.FileChangeEvent[]>();

	readonly onDidChangeFile: zycode.Event<zycode.FileChangeEvent[]> = this._emitter.event;
	private readonly watchers = new Map<string, Set<Symbol>>;

	watch(resource: zycode.Uri): zycode.Disposable {
		if (!this.watchers.has(resource.path)) {
			this.watchers.set(resource.path, new Set());
		}
		const sy = Symbol(resource.path);
		return new zycode.Disposable(() => {
			const watcher = this.watchers.get(resource.path);
			if (watcher) {
				watcher.delete(sy);
				if (!watcher.size) {
					this.watchers.delete(resource.path);
				}
			}
		});
	}
}

class FsEntry {
	get type(): zycode.FileType {
		if (this._data instanceof Uint8Array) {
			return zycode.FileType.File;
		} else {
			return zycode.FileType.Directory;
		}
	}

	get size(): number {
		if (this.type === zycode.FileType.Directory) {
			return [...this.contents.values()].reduce((acc: number, entry: FsEntry) => acc + entry.size, 0);
		} else {
			return this.data.length;
		}
	}

	constructor(
		private _data: Uint8Array | Map<string, FsEntry>,
		public ctime: number,
		public mtime: number,
	) { }

	get data() {
		if (this.type === zycode.FileType.Directory) {
			throw zycode.FileSystemError.FileIsADirectory;
		}
		return <Uint8Array>this._data;
	}
	set data(val: Uint8Array) {
		if (this.type === zycode.FileType.Directory) {
			throw zycode.FileSystemError.FileIsADirectory;
		}
		this._data = val;
	}

	get contents() {
		if (this.type !== zycode.FileType.Directory) {
			throw zycode.FileSystemError.FileNotADirectory;
		}
		return <Map<string, FsEntry>>this._data;
	}
}
