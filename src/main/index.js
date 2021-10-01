/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

'use strict';

// Run this as soon as possible, so that the user data folder is not already initialised by Electron
require('./setUserDataDir');

const { existsSync } = require('fs');
const { resolve } = require('path');

const { execPath } = process;

// In order to correctly set the library search path of pc-nrfjprog-js module
// we need to set the environment variable before the module is loaded.
const nRFjprogSearchPath = [
    resolve(execPath, '../nrfjprog'),
    resolve(execPath, '../../Frameworks/nrfjprog'),
    resolve(process.cwd(), 'nrfjprog'),
    resolve(process.cwd(), 'node_modules/pc-nrfjprog-js/nrfjprog'),
].find(existsSync);

if (nRFjprogSearchPath) {
    process.env.NRFJPROG_LIBRARY_PATH = nRFjprogSearchPath;
    const original = process.env.LD_LIBRARY_PATH
        ? `:${process.env.LD_LIBRARY_PATH}`
        : '';
    process.env.LD_LIBRARY_PATH = `${nRFjprogSearchPath}${original}`;
}

const { Menu, ipcMain, dialog, app: electronApp } = require('electron');
const { argv } = require('yargs');

const config = require('./config');
const windows = require('./windows');
const apps = require('./apps');
const { createMenu } = require('./menu');
const handleDevtoolsRequest = require('./devtools');

// Ensure that nRFConnect runs in a directory where it has permission to write
process.chdir(electronApp.getPath('temp'));

config.init(argv);
global.homeDir = config.getHomeDir();
global.userDataDir = config.getUserDataDir();
global.appsRootDir = config.getAppsRootDir();

const applicationMenu = Menu.buildFromTemplate(createMenu(electronApp));

electronApp.on('ready', () => {
    handleDevtoolsRequest();

    Menu.setApplicationMenu(applicationMenu);
    apps.initAppsDirectory()
        .then(() => {
            if (config.getOfficialAppName()) {
                return windows.openOfficialAppWindow(
                    config.getOfficialAppName(),
                    config.getSourceName()
                );
            }
            if (config.getLocalAppName()) {
                return windows.openLocalAppWindow(config.getLocalAppName());
            }
            return windows.openLauncherWindow();
        })
        .catch(error => {
            dialog.showMessageBox(
                {
                    type: 'error',
                    title: 'Initialization error',
                    message: 'Error when starting application',
                    detail: error.message,
                    buttons: ['OK'],
                },
                () => electronApp.quit()
            );
        });
});

electronApp.on('window-all-closed', () => {
    electronApp.quit();
});

ipcMain.on('open-app-launcher', () => {
    windows.openLauncherWindow();
});

ipcMain.on('open-app', (event, app) => {
    windows.openAppWindow(app);
});

ipcMain.on('show-about-dialog', () => {
    const appWindow = windows.getFocusedAppWindow();
    if (appWindow) {
        const { app } = appWindow;
        const detail =
            `${app.description}\n\n` +
            `Version: ${app.currentVersion}\n` +
            `Official: ${app.isOfficial}\n` +
            `Supported engines: nRF Connect ${app.engineVersion}\n` +
            `Current engine: nRF Connect ${config.getVersion()}\n` +
            `App directory: ${app.path}`;
        dialog.showMessageBox(
            appWindow.browserWindow,
            {
                type: 'info',
                title: 'About',
                message: `${app.displayName || app.name}`,
                detail,
                icon: app.iconPath
                    ? app.iconPath
                    : `${config.getElectronResourcesDir()}/nrfconnect.png`,
                buttons: ['OK'],
            },
            () => {}
        );
    }
});

ipcMain.on('get-app-details', event => {
    const appWindow = windows.getFocusedAppWindow();
    if (appWindow) {
        event.sender.send('app-details', {
            coreVersion: config.getVersion(),
            corePath: config.getElectronRootPath(),
            homeDir: config.getHomeDir(),
            tmpDir: config.getTmpDir(),
            ...appWindow.app,
        });
    }
});
