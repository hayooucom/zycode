/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as zycode from 'zycode';
import { Command } from '../commandManager';
import { DynamicPreviewSettings, MarkdownPreviewManager } from '../preview/previewManager';
import { TelemetryReporter } from '../telemetryReporter';


interface ShowPreviewSettings {
	readonly sideBySide?: boolean;
	readonly locked?: boolean;
}

async function showPreview(
	webviewManager: MarkdownPreviewManager,
	telemetryReporter: TelemetryReporter,
	uri: zycode.Uri | undefined,
	previewSettings: ShowPreviewSettings,
): Promise<any> {
	let resource = uri;
	if (!(resource instanceof zycode.Uri)) {
		if (zycode.window.activeTextEditor) {
			// we are relaxed and don't check for markdown files
			resource = zycode.window.activeTextEditor.document.uri;
		}
	}

	if (!(resource instanceof zycode.Uri)) {
		if (!zycode.window.activeTextEditor) {
			// this is most likely toggling the preview
			return zycode.commands.executeCommand('markdown.showSource');
		}
		// nothing found that could be shown or toggled
		return;
	}

	const resourceColumn = (zycode.window.activeTextEditor && zycode.window.activeTextEditor.viewColumn) || zycode.ViewColumn.One;
	webviewManager.openDynamicPreview(resource, {
		resourceColumn: resourceColumn,
		previewColumn: previewSettings.sideBySide ? zycode.ViewColumn.Beside : resourceColumn,
		locked: !!previewSettings.locked
	});

	telemetryReporter.sendTelemetryEvent('openPreview', {
		where: previewSettings.sideBySide ? 'sideBySide' : 'inPlace',
		how: (uri instanceof zycode.Uri) ? 'action' : 'pallete'
	});
}

export class ShowPreviewCommand implements Command {
	public readonly id = 'markdown.showPreview';

	public constructor(
		private readonly _webviewManager: MarkdownPreviewManager,
		private readonly _telemetryReporter: TelemetryReporter
	) { }

	public execute(mainUri?: zycode.Uri, allUris?: zycode.Uri[], previewSettings?: DynamicPreviewSettings) {
		for (const uri of Array.isArray(allUris) ? allUris : [mainUri]) {
			showPreview(this._webviewManager, this._telemetryReporter, uri, {
				sideBySide: false,
				locked: previewSettings && previewSettings.locked
			});
		}
	}
}

export class ShowPreviewToSideCommand implements Command {
	public readonly id = 'markdown.showPreviewToSide';

	public constructor(
		private readonly _webviewManager: MarkdownPreviewManager,
		private readonly _telemetryReporter: TelemetryReporter
	) { }

	public execute(uri?: zycode.Uri, previewSettings?: DynamicPreviewSettings) {
		showPreview(this._webviewManager, this._telemetryReporter, uri, {
			sideBySide: true,
			locked: previewSettings && previewSettings.locked
		});
	}
}


export class ShowLockedPreviewToSideCommand implements Command {
	public readonly id = 'markdown.showLockedPreviewToSide';

	public constructor(
		private readonly _webviewManager: MarkdownPreviewManager,
		private readonly _telemetryReporter: TelemetryReporter
	) { }

	public execute(uri?: zycode.Uri) {
		showPreview(this._webviewManager, this._telemetryReporter, uri, {
			sideBySide: true,
			locked: true
		});
	}
}
