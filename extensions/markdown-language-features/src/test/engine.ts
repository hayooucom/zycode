/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import { MarkdownItEngine } from '../markdownEngine';
import { MarkdownContributionProvider, MarkdownContributions } from '../markdownExtensions';
import { githubSlugifier } from '../slugify';
import { nulLogger } from './nulLogging';

const emptyContributions = new class implements MarkdownContributionProvider {
	readonly extensionUri = zycode.Uri.file('/');
	readonly contributions = MarkdownContributions.Empty;

	private readonly _onContributionsChanged = new zycode.EventEmitter<this>();
	readonly onContributionsChanged = this._onContributionsChanged.event;

	dispose() {
		this._onContributionsChanged.dispose();
	}
};

export function createNewMarkdownEngine(): MarkdownItEngine {
	return new MarkdownItEngine(emptyContributions, githubSlugifier, nulLogger);
}
