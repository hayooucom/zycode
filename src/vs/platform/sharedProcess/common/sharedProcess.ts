/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const SharedProcessLifecycle = {
	exit: 'zycode:electron-main->shared-process=exit',
	ipcReady: 'zycode:shared-process->electron-main=ipc-ready',
	initDone: 'zycode:shared-process->electron-main=init-done'
};

export const SharedProcessChannelConnection = {
	request: 'zycode:createSharedProcessChannelConnection',
	response: 'zycode:createSharedProcessChannelConnectionResult'
};

export const SharedProcessRawConnection = {
	request: 'zycode:createSharedProcessRawConnection',
	response: 'zycode:createSharedProcessRawConnectionResult'
};
