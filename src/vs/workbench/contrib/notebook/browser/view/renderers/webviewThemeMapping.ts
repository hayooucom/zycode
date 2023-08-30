/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebviewStyles } from 'vs/workbench/contrib/webview/browser/webview';

const mapping: ReadonlyMap<string, string> = new Map([
	['theme-font-family', 'zycode-font-family'],
	['theme-font-weight', 'zycode-font-weight'],
	['theme-font-size', 'zycode-font-size'],
	['theme-code-font-family', 'zycode-editor-font-family'],
	['theme-code-font-weight', 'zycode-editor-font-weight'],
	['theme-code-font-size', 'zycode-editor-font-size'],
	['theme-scrollbar-background', 'zycode-scrollbarSlider-background'],
	['theme-scrollbar-hover-background', 'zycode-scrollbarSlider-hoverBackground'],
	['theme-scrollbar-active-background', 'zycode-scrollbarSlider-activeBackground'],
	['theme-quote-background', 'zycode-textBlockQuote-background'],
	['theme-quote-border', 'zycode-textBlockQuote-border'],
	['theme-code-foreground', 'zycode-textPreformat-foreground'],
	// Editor
	['theme-background', 'zycode-editor-background'],
	['theme-foreground', 'zycode-editor-foreground'],
	['theme-ui-foreground', 'zycode-foreground'],
	['theme-link', 'zycode-textLink-foreground'],
	['theme-link-active', 'zycode-textLink-activeForeground'],
	// Buttons
	['theme-button-background', 'zycode-button-background'],
	['theme-button-hover-background', 'zycode-button-hoverBackground'],
	['theme-button-foreground', 'zycode-button-foreground'],
	['theme-button-secondary-background', 'zycode-button-secondaryBackground'],
	['theme-button-secondary-hover-background', 'zycode-button-secondaryHoverBackground'],
	['theme-button-secondary-foreground', 'zycode-button-secondaryForeground'],
	['theme-button-hover-foreground', 'zycode-button-foreground'],
	['theme-button-focus-foreground', 'zycode-button-foreground'],
	['theme-button-secondary-hover-foreground', 'zycode-button-secondaryForeground'],
	['theme-button-secondary-focus-foreground', 'zycode-button-secondaryForeground'],
	// Inputs
	['theme-input-background', 'zycode-input-background'],
	['theme-input-foreground', 'zycode-input-foreground'],
	['theme-input-placeholder-foreground', 'zycode-input-placeholderForeground'],
	['theme-input-focus-border-color', 'zycode-focusBorder'],
	// Menus
	['theme-menu-background', 'zycode-menu-background'],
	['theme-menu-foreground', 'zycode-menu-foreground'],
	['theme-menu-hover-background', 'zycode-menu-selectionBackground'],
	['theme-menu-focus-background', 'zycode-menu-selectionBackground'],
	['theme-menu-hover-foreground', 'zycode-menu-selectionForeground'],
	['theme-menu-focus-foreground', 'zycode-menu-selectionForeground'],
	// Errors
	['theme-error-background', 'zycode-inputValidation-errorBackground'],
	['theme-error-foreground', 'zycode-foreground'],
	['theme-warning-background', 'zycode-inputValidation-warningBackground'],
	['theme-warning-foreground', 'zycode-foreground'],
	['theme-info-background', 'zycode-inputValidation-infoBackground'],
	['theme-info-foreground', 'zycode-foreground'],
	// Notebook:
	['theme-notebook-output-background', 'zycode-notebook-outputContainerBackgroundColor'],
	['theme-notebook-output-border', 'zycode-notebook-outputContainerBorderColor'],
	['theme-notebook-cell-selected-background', 'zycode-notebook-selectedCellBackground'],
	['theme-notebook-symbol-highlight-background', 'zycode-notebook-symbolHighlightBackground'],
	['theme-notebook-diff-removed-background', 'zycode-diffEditor-removedTextBackground'],
	['theme-notebook-diff-inserted-background', 'zycode-diffEditor-insertedTextBackground'],
]);

const constants: Readonly<WebviewStyles> = {
	'theme-input-border-width': '1px',
	'theme-button-primary-hover-shadow': 'none',
	'theme-button-secondary-hover-shadow': 'none',
	'theme-input-border-color': 'transparent',
};

/**
 * Transforms base zycode theme variables into generic variables for notebook
 * renderers.
 * @see https://github.com/microsoft/zycode/issues/107985 for context
 * @deprecated
 */
export const transformWebviewThemeVars = (s: Readonly<WebviewStyles>): WebviewStyles => {
	const result = { ...s, ...constants };
	for (const [target, src] of mapping) {
		result[target] = s[src];
	}

	return result;
};
