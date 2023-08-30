/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as zycode from 'zycode';
import { IExtHostConsumerFileSystem } from 'vs/workbench/api/common/extHostFileSystemConsumer';
import { Schemas } from 'vs/base/common/network';
import { ILogService } from 'vs/platform/log/common/log';
import { DiskFileSystemProvider } from 'vs/platform/files/node/diskFileSystemProvider';
import { FilePermission } from 'vs/platform/files/common/files';
import { isLinux } from 'vs/base/common/platform';

export class ExtHostDiskFileSystemProvider {

	constructor(
		@IExtHostConsumerFileSystem extHostConsumerFileSystem: IExtHostConsumerFileSystem,
		@ILogService logService: ILogService
	) {

		// Register disk file system provider so that certain
		// file operations can execute fast within the extension
		// host without roundtripping.
		extHostConsumerFileSystem.addFileSystemProvider(Schemas.file, new DiskFileSystemProviderAdapter(logService), { isCaseSensitive: isLinux });
	}
}

class DiskFileSystemProviderAdapter implements zycode.FileSystemProvider {

	private readonly impl = new DiskFileSystemProvider(this.logService);

	constructor(private readonly logService: ILogService) { }

	async stat(uri: zycode.Uri): Promise<zycode.FileStat> {
		const stat = await this.impl.stat(uri);

		return {
			type: stat.type,
			ctime: stat.ctime,
			mtime: stat.mtime,
			size: stat.size,
			permissions: stat.permissions === FilePermission.Readonly ? 1 : undefined
		};
	}

	readDirectory(uri: zycode.Uri): Promise<[string, zycode.FileType][]> {
		return this.impl.readdir(uri);
	}

	createDirectory(uri: zycode.Uri): Promise<void> {
		return this.impl.mkdir(uri);
	}

	readFile(uri: zycode.Uri): Promise<Uint8Array> {
		return this.impl.readFile(uri);
	}

	writeFile(uri: zycode.Uri, content: Uint8Array, options: { readonly create: boolean; readonly overwrite: boolean }): Promise<void> {
		return this.impl.writeFile(uri, content, { ...options, unlock: false, atomic: false });
	}

	delete(uri: zycode.Uri, options: { readonly recursive: boolean }): Promise<void> {
		return this.impl.delete(uri, { ...options, useTrash: false, atomic: false });
	}

	rename(oldUri: zycode.Uri, newUri: zycode.Uri, options: { readonly overwrite: boolean }): Promise<void> {
		return this.impl.rename(oldUri, newUri, options);
	}

	copy(source: zycode.Uri, destination: zycode.Uri, options: { readonly overwrite: boolean }): Promise<void> {
		return this.impl.copy(source, destination, options);
	}

	// --- Not Implemented ---

	get onDidChangeFile(): never { throw new Error('Method not implemented.'); }
	watch(uri: zycode.Uri, options: { readonly recursive: boolean; readonly excludes: readonly string[] }): zycode.Disposable { throw new Error('Method not implemented.'); }
}
