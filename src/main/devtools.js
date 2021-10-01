/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

const { app, BrowserWindow } = require('electron');

let devToolsInstaller;
try {
    devToolsInstaller = require('electron-devtools-installer'); // eslint-disable-line global-require
} catch {
    // Ignore missing devtools dependency here, check later for it when needed
}

const installDevtools = async () => {
    try {
        const downloadAndInstall = devToolsInstaller.default;
        const devToolsExtensions = [
            devToolsInstaller.REACT_DEVELOPER_TOOLS,
            devToolsInstaller.REDUX_DEVTOOLS,
        ];
        const forceReinstall = true;

        await downloadAndInstall(devToolsExtensions, forceReinstall);
        console.log('Added devtool extensions');
        app.quit();
    } catch (err) {
        console.log('An error occurred while adding the devtools: ', err);
    }
};

const removeDevtools = () => {
    const devToolsExtensions = Object.keys(
        BrowserWindow.getDevToolsExtensions()
    );
    console.log('Removing devtool extensions:', devToolsExtensions);

    devToolsExtensions.forEach(BrowserWindow.removeDevToolsExtension);

    // Sometimes if we quit too fast we get a crash message here, so let us just wait a moment.
    setTimeout(app.quit, 1000);
};

module.exports = () => {
    if (devToolsInstaller == null) {
        return;
    }

    if (process.argv.includes('--install-devtools')) {
        installDevtools();
    }

    if (process.argv.includes('--remove-devtools')) {
        removeDevtools();
    }
};
