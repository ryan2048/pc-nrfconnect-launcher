/*
 * Copyright (c) 2015 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: LicenseRef-Nordic-4-Clause
 */

import electron from 'electron';
import bleDriverJs from 'pc-ble-driver-js';
import { logger } from 'pc-nrfconnect-shared';
import nrfjprog from 'pc-nrfjprog-js';
import serialPort from 'serialport';
import usb from 'usb';

import * as core from './core';

const bleDriver = bleDriverJs.api ? bleDriverJs.api : bleDriverJs;

core.logger = logger;

export { bleDriver, nrfjprog, usb, serialPort, logger, electron, core };
