/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import nrfDeviceLib from '@nordicsemiconductor/nrf-device-lib-js';
import camelcaseKeys from 'camelcase-keys';
import {
    getDeviceLibContext,
    logger,
    prepareDevice,
} from 'pc-nrfconnect-shared';

import { getAppConfig } from '../../decoration';

/**
 * Indicates that a device has been selected.
 *
 * Apps can listen to this action in their middleware to add custom behavior when
 * the device is selected. Apps can also dispatch this action themselves to make
 * the device appear as selected in the DeviceSelector.
 *
 * @param {Object} device Device object as given by nrf-device-lister.
 */
export const DEVICE_SELECTED = 'DEVICE_SELECTED';

/**
 * Indicates that the currently selected device has been deselected.
 *
 * Apps can listen to this action in their middleware to add custom behavior when
 * the device is deselected, f.ex. closing the device. Apps can also dispatch this
 * action themselves to clear a selection in the DeviceSelector.
 */
export const DEVICE_DESELECTED = 'DEVICE_DESELECTED';

/**
 * Indicates that device setup is complete. This means that the device is
 * ready for use according to the `config.deviceSetup` configuration provided
 * by the app. Apps can listen to this action in their middleware to add custom
 * behavior when device setup has completed.
 *
 * @param {Object} device Device object as given by nrf-device-lister.
 */
export const DEVICE_SETUP_COMPLETE = 'DEVICE_SETUP_COMPLETE';

/**
 * Indicates that device setup failed. Apps can listen to this action in their
 * middleware to add custom behavior when device setup fails.
 *
 * @param {Object} device Device object as given by nrf-device-lister.
 * @param {Object} error Error object describing the error.
 */
export const DEVICE_SETUP_ERROR = 'DEVICE_SETUP_ERROR';

/**
 * Indicates that some part of the device setup operation requires input
 * from the user. When the user has provided the required input, then
 * DEVICE_SETUP_INPUT_RECEIVED is dispatched with the given input.
 *
 * @param {String} message The message to display to the user.
 * @param {Array<String>} [choices] Values that the user can choose from (optional).
 */
export const DEVICE_SETUP_INPUT_REQUIRED = 'DEVICE_SETUP_INPUT_REQUIRED';

/**
 * Indicates that the user has provided input to the device setup operation.
 * This action is dispatched after DEVICE_SETUP_INPUT_REQUIRED.
 *
 * @param {Boolean|String} input The input made by the user.
 */
export const DEVICE_SETUP_INPUT_RECEIVED = 'DEVICE_SETUP_INPUT_RECEIVED';

/**
 * Indicates that devices have been detected. This is triggered by default at
 * startup, and whenever a device is attached/detached. The app can configure
 * which devices to look for by providing a `config.selectorTraits` property.
 *
 * @param {Array} devices Array of all attached devices, ref. nrf-device-lister.
 */
export const DEVICES_DETECTED = 'DEVICES_DETECTED';

const deviceLibContext = getDeviceLibContext();
let hotplugTaskId;

// Defined when user input is required during device setup. When input is
// received from the user, this callback is invoked with the confirmation
// (Boolean) or choice (String) that the user provided as input.
let deviceSetupCallback;

function deviceSelectedAction(device) {
    return {
        type: DEVICE_SELECTED,
        device,
    };
}

function deviceSetupErrorAction(device, error) {
    return {
        type: DEVICE_SETUP_ERROR,
        device,
        error,
    };
}

function deviceSetupCompleteAction(device) {
    return {
        type: DEVICE_SETUP_COMPLETE,
        device,
    };
}

function devicesDetectedAction(devices) {
    return {
        type: DEVICES_DETECTED,
        devices,
    };
}

function deviceSetupInputRequiredAction(message, choices) {
    return {
        type: DEVICE_SETUP_INPUT_REQUIRED,
        message,
        choices,
    };
}

function deviceSetupInputReceivedAction(input) {
    return {
        type: DEVICE_SETUP_INPUT_RECEIVED,
        input,
    };
}

/**
 * Deselects the currently selected device.
 *
 * @returns {Object} Action object that can be passed to redux dispatch.
 */
export function deselectDevice() {
    return {
        type: DEVICE_DESELECTED,
    };
}

export const wrapDevice = device => {
    const outputDevice = camelcaseKeys(device, { deep: true });
    const serialport = outputDevice.serialPorts
        ? outputDevice.serialPorts[0]
        : undefined;
    return {
        ...outputDevice,
        boardVersion: outputDevice.jlink
            ? outputDevice.jlink.boardVersion
            : undefined,
        serialport,
    };
};

const wrapDevices = devices => devices.map(wrapDevice);

/**
 * Starts watching for devices with the given traits. See the nrf-device-lister
 * library for available traits. Whenever devices are attached/detached, this
 * will dispatch DEVICES_DETECTED with a complete list of attached devices.
 *
 * @returns {function(*)} Function that can be passed to redux dispatch.
 */
export const startWatchingDevices = () => async (dispatch, getState) => {
    const updateDeviceList = async () => {
        const devices = wrapDevices(
            await nrfDeviceLib.enumerate(
                deviceLibContext,
                getAppConfig().selectorTraits
            )
        );
        const { device } = getState();

        if (
            device?.selectedSerialNumber != null &&
            !devices.find(d => d.serialNumber === device.selectedSerialNumber)
        ) {
            dispatch(deselectDevice());
        }
        dispatch(devicesDetectedAction(devices));
    };

    try {
        await updateDeviceList();
        hotplugTaskId = nrfDeviceLib.startHotplugEvents(
            deviceLibContext,
            () => {},
            updateDeviceList
        );
    } catch (error) {
        logger.error(`Error while probing devices: ${error.message}`);
    }
};

/**
 * Stops watching for devices.
 *
 * @returns {function(*)} Function that can be passed to redux dispatch.
 */
export const stopWatchingDevices = () => {
    // Start here
    if (deviceLibContext) {
        try {
            nrfDeviceLib.stopHotplugEvents(hotplugTaskId);
        } catch (error) {
            logger.error(`Error while stop watching devices: ${error.message}`);
        }
    }
};

/**
 * Asks the user to provide input during device setup. If a list of choices are
 * given, and the user selects one of them, then then promise will resolve with
 * the selected value. If no choices are given, and the user confirms, then the
 * promise will just resolve with true. Will reject if the user cancels.
 *
 * @param {function} dispatch The redux dispatch function.
 * @param {String} message The message to display to the user.
 * @param {Array<String>} [choices] The choices to display to the user (optional).
 * @returns {Promise<String>} Promise that resolves with the user input.
 */
const getDeviceSetupUserInput = dispatch => (message, choices) =>
    new Promise((resolve, reject) => {
        deviceSetupCallback = choice => {
            if (!choices) {
                // for confirmation resolve with boolean
                resolve(!!choice);
            } else if (choice) {
                resolve(choice);
            } else {
                reject(new Error('Cancelled by user.'));
            }
        };
        dispatch(deviceSetupInputRequiredAction(message, choices));
    });

/**
 * Selects a device and sets it up for use according to the `config.deviceSetup`
 * configuration given by the app.
 *
 * @param {Object} device Device object, ref. nrf-device-lister.
 * @returns {function(*)} Function that can be passed to redux dispatch.
 */
export function selectAndSetupDevice(device) {
    return async dispatch => {
        dispatch(deviceSelectedAction(device));

        const config = getAppConfig();
        if (config.deviceSetup) {
            // During device setup, the device may go in and out of bootloader
            // mode. This will make it appear as detached in the device lister,
            // causing a DESELECT_DEVICE. To avoid this, we stop the device
            // lister while setting up the device, and start it again after the
            // device has been set up.
            dispatch(stopWatchingDevices());

            if (config.releaseCurrentDevice) {
                await config.releaseCurrentDevice();
            }

            const deviceSetupConfig = {
                promiseConfirm: getDeviceSetupUserInput(dispatch),
                promiseChoice: getDeviceSetupUserInput(dispatch),
                allowCustomDevice: false,
                ...config.deviceSetup,
            };
            try {
                const preparedDevice = await prepareDevice(
                    device,
                    deviceSetupConfig
                );
                dispatch(startWatchingDevices());
                dispatch(deviceSetupCompleteAction(preparedDevice));
            } catch (error) {
                dispatch(deviceSetupErrorAction(device, error));
                if (!deviceSetupConfig.allowCustomDevice) {
                    logger.error(
                        `Error while setting up device ${device.serialNumber}: ${error.message}`
                    );
                    dispatch(deselectDevice());
                }
                dispatch(startWatchingDevices());
            }
        }
    };
}

/**
 * Responds to a device setup confirmation request with the given input
 * as provided by the user.
 *
 * @param {Boolean|String} input Input made by the user.
 * @returns {function(*)} Function that can be passed to redux dispatch.
 */
export function deviceSetupInputReceived(input) {
    return dispatch => {
        dispatch(deviceSetupInputReceivedAction(input));
        if (deviceSetupCallback) {
            deviceSetupCallback(input);
            deviceSetupCallback = undefined;
        } else {
            logger.error(
                'Received device setup input, but no callback exists.'
            );
        }
    };
}
