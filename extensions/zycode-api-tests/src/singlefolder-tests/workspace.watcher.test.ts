/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as zycode from 'zycode';
import { TestFS } from '../memfs';
import { assertNoRpc } from '../utils';

suite('zycode API - workspace-watcher', () => {

	interface IWatchRequest {
		uri: zycode.Uri;
		options: { recursive: boolean; excludes: string[] };
	}

	class WatcherTestFs extends TestFS {

		private _onDidWatch = new zycode.EventEmitter<IWatchRequest>();
		readonly onDidWatch = this._onDidWatch.event;

		override watch(uri: zycode.Uri, options: { recursive: boolean; excludes: string[] }): zycode.Disposable {
			this._onDidWatch.fire({ uri, options });

			return super.watch(uri, options);
		}
	}

	teardown(assertNoRpc);

	test('createFileSystemWatcher', async function () {
		const fs = new WatcherTestFs('watcherTest', false);
		zycode.workspace.registerFileSystemProvider('watcherTest', fs);

		function onDidWatchPromise() {
			const onDidWatchPromise = new Promise<IWatchRequest>(resolve => {
				fs.onDidWatch(request => resolve(request));
			});

			return onDidWatchPromise;
		}

		// Non-recursive
		let watchUri = zycode.Uri.from({ scheme: 'watcherTest', path: '/somePath/folder' });
		const watcher = zycode.workspace.createFileSystemWatcher(new zycode.RelativePattern(watchUri, '*.txt'));
		let request = await onDidWatchPromise();

		assert.strictEqual(request.uri.toString(), watchUri.toString());
		assert.strictEqual(request.options.recursive, false);

		watcher.dispose();

		// Recursive
		watchUri = zycode.Uri.from({ scheme: 'watcherTest', path: '/somePath/folder' });
		zycode.workspace.createFileSystemWatcher(new zycode.RelativePattern(watchUri, '**/*.txt'));
		request = await onDidWatchPromise();

		assert.strictEqual(request.uri.toString(), watchUri.toString());
		assert.strictEqual(request.options.recursive, true);
	});
});
