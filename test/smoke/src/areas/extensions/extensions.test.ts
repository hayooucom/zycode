/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Application, Logger } from '../../../../automation';
import { installAllHandlers } from '../../utils';

export function setup(logger: Logger) {
	describe('Extensions', () => {

		// Shared before/after handling
		installAllHandlers(logger);

		it('install and enable zycode-smoketest-check extension', async function () {
			const app = this.app as Application;

			await app.workbench.extensions.openExtensionsViewlet();
			await app.workbench.extensions.installExtension('ms-zycode.zycode-smoketest-check', true);

			// Close extension editor because keybindings dispatch is not working when web views are opened and focused
			// https://github.com/microsoft/zycode/issues/110276
			await app.workbench.extensions.closeExtension('zycode-smoketest-check');

			await app.workbench.quickaccess.runCommand('Smoke Test Check');
		});
	});
}
