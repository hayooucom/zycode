/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';

type ResourceToKey = (uri: zycode.Uri) => string;

const defaultResourceToKey = (resource: zycode.Uri): string => resource.toString();

export class ResourceMap<T> {

	private readonly _map = new Map<string, { readonly uri: zycode.Uri; readonly value: T }>();

	private readonly _toKey: ResourceToKey;

	constructor(toKey: ResourceToKey = defaultResourceToKey) {
		this._toKey = toKey;
	}

	public set(uri: zycode.Uri, value: T): this {
		this._map.set(this._toKey(uri), { uri, value });
		return this;
	}

	public get(resource: zycode.Uri): T | undefined {
		return this._map.get(this._toKey(resource))?.value;
	}

	public has(resource: zycode.Uri): boolean {
		return this._map.has(this._toKey(resource));
	}

	public get size(): number {
		return this._map.size;
	}

	public clear(): void {
		this._map.clear();
	}

	public delete(resource: zycode.Uri): boolean {
		return this._map.delete(this._toKey(resource));
	}

	public *values(): IterableIterator<T> {
		for (const entry of this._map.values()) {
			yield entry.value;
		}
	}

	public *keys(): IterableIterator<zycode.Uri> {
		for (const entry of this._map.values()) {
			yield entry.uri;
		}
	}

	public *entries(): IterableIterator<[zycode.Uri, T]> {
		for (const entry of this._map.values()) {
			yield [entry.uri, entry.value];
		}
	}

	public [Symbol.iterator](): IterableIterator<[zycode.Uri, T]> {
		return this.entries();
	}
}
