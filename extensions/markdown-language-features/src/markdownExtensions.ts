/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import * as arrays from './util/arrays';
import { Disposable } from './util/dispose';

function resolveExtensionResource(extension: zycode.Extension<any>, resourcePath: string): zycode.Uri {
	return zycode.Uri.joinPath(extension.extensionUri, resourcePath);
}

function* resolveExtensionResources(extension: zycode.Extension<any>, resourcePaths: unknown): Iterable<zycode.Uri> {
	if (Array.isArray(resourcePaths)) {
		for (const resource of resourcePaths) {
			try {
				yield resolveExtensionResource(extension, resource);
			} catch {
				// noop
			}
		}
	}
}

export interface MarkdownContributions {
	readonly previewScripts: readonly zycode.Uri[];
	readonly previewStyles: readonly zycode.Uri[];
	readonly previewResourceRoots: readonly zycode.Uri[];
	readonly markdownItPlugins: ReadonlyMap<string, Thenable<(md: any) => any>>;
}

export namespace MarkdownContributions {
	export const Empty: MarkdownContributions = {
		previewScripts: [],
		previewStyles: [],
		previewResourceRoots: [],
		markdownItPlugins: new Map()
	};

	export function merge(a: MarkdownContributions, b: MarkdownContributions): MarkdownContributions {
		return {
			previewScripts: [...a.previewScripts, ...b.previewScripts],
			previewStyles: [...a.previewStyles, ...b.previewStyles],
			previewResourceRoots: [...a.previewResourceRoots, ...b.previewResourceRoots],
			markdownItPlugins: new Map([...a.markdownItPlugins.entries(), ...b.markdownItPlugins.entries()]),
		};
	}

	function uriEqual(a: zycode.Uri, b: zycode.Uri): boolean {
		return a.toString() === b.toString();
	}

	export function equal(a: MarkdownContributions, b: MarkdownContributions): boolean {
		return arrays.equals(a.previewScripts, b.previewScripts, uriEqual)
			&& arrays.equals(a.previewStyles, b.previewStyles, uriEqual)
			&& arrays.equals(a.previewResourceRoots, b.previewResourceRoots, uriEqual)
			&& arrays.equals(Array.from(a.markdownItPlugins.keys()), Array.from(b.markdownItPlugins.keys()));
	}

	export function fromExtension(extension: zycode.Extension<any>): MarkdownContributions {
		const contributions = extension.packageJSON?.contributes;
		if (!contributions) {
			return MarkdownContributions.Empty;
		}

		const previewStyles = Array.from(getContributedStyles(contributions, extension));
		const previewScripts = Array.from(getContributedScripts(contributions, extension));
		const previewResourceRoots = previewStyles.length || previewScripts.length ? [extension.extensionUri] : [];
		const markdownItPlugins = getContributedMarkdownItPlugins(contributions, extension);

		return {
			previewScripts,
			previewStyles,
			previewResourceRoots,
			markdownItPlugins
		};
	}

	function getContributedMarkdownItPlugins(
		contributes: any,
		extension: zycode.Extension<any>
	): Map<string, Thenable<(md: any) => any>> {
		const map = new Map<string, Thenable<(md: any) => any>>();
		if (contributes['markdown.markdownItPlugins']) {
			map.set(extension.id, extension.activate().then(() => {
				if (extension.exports && extension.exports.extendMarkdownIt) {
					return (md: any) => extension.exports.extendMarkdownIt(md);
				}
				return (md: any) => md;
			}));
		}
		return map;
	}

	function getContributedScripts(
		contributes: any,
		extension: zycode.Extension<any>
	) {
		return resolveExtensionResources(extension, contributes['markdown.previewScripts']);
	}

	function getContributedStyles(
		contributes: any,
		extension: zycode.Extension<any>
	) {
		return resolveExtensionResources(extension, contributes['markdown.previewStyles']);
	}
}

export interface MarkdownContributionProvider {
	readonly extensionUri: zycode.Uri;

	readonly contributions: MarkdownContributions;
	readonly onContributionsChanged: zycode.Event<this>;

	dispose(): void;
}

class VSCodeExtensionMarkdownContributionProvider extends Disposable implements MarkdownContributionProvider {

	private _contributions?: MarkdownContributions;

	public constructor(
		private readonly _extensionContext: zycode.ExtensionContext,
	) {
		super();

		this._register(zycode.extensions.onDidChange(() => {
			const currentContributions = this._getCurrentContributions();
			const existingContributions = this._contributions || MarkdownContributions.Empty;
			if (!MarkdownContributions.equal(existingContributions, currentContributions)) {
				this._contributions = currentContributions;
				this._onContributionsChanged.fire(this);
			}
		}));
	}

	public get extensionUri() {
		return this._extensionContext.extensionUri;
	}

	private readonly _onContributionsChanged = this._register(new zycode.EventEmitter<this>());
	public readonly onContributionsChanged = this._onContributionsChanged.event;

	public get contributions(): MarkdownContributions {
		this._contributions ??= this._getCurrentContributions();
		return this._contributions;
	}

	private _getCurrentContributions(): MarkdownContributions {
		return zycode.extensions.all
			.map(MarkdownContributions.fromExtension)
			.reduce(MarkdownContributions.merge, MarkdownContributions.Empty);
	}
}

export function getMarkdownExtensionContributions(context: zycode.ExtensionContext): MarkdownContributionProvider {
	return new VSCodeExtensionMarkdownContributionProvider(context);
}
