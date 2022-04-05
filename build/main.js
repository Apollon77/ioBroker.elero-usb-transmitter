"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");
const elero_usb_transmitter_client_1 = require("elero-usb-transmitter-client");
const REFRESH_INTERVAL_IN_MINUTES_DEFAULT = 5;
class EleroUsbTransmitter extends utils.Adapter {
    constructor(options = {}) {
        super(Object.assign(Object.assign({}, options), { name: 'elero-usb-transmitter' }));
        this.refreshIntervalInMinutes = REFRESH_INTERVAL_IN_MINUTES_DEFAULT;
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        // this.on('objectChange', this.onObjectChange.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }
    /**
     * Is called when databases are connected and adapter received configuration.
     */
    onReady() {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            this.refreshIntervalInMinutes = (_b = (_a = this.config) === null || _a === void 0 ? void 0 : _a.refreshInterval) !== null && _b !== void 0 ? _b : REFRESH_INTERVAL_IN_MINUTES_DEFAULT;
            this.setupRefreshTimeout();
            this.client = new elero_usb_transmitter_client_1.UsbTransmitterClient(this.config.usbStickDevicePath);
            this.log.debug('Try to open connection to stick.');
            yield this.client.open();
            this.log.debug('Connection is open.');
            yield this.createDevices();
            yield this.refreshInfo();
            yield this.updateDeviceNames();
            this.subscribeStates('*');
        });
    }
    updateDeviceNames() {
        return __awaiter(this, void 0, void 0, function* () {
            this.config.deviceConfigs.forEach((deviceConfig) => __awaiter(this, void 0, void 0, function* () {
                yield this.extendObjectAsync(`channel_${deviceConfig.channel}`, {
                    common: {
                        name: deviceConfig.name,
                    },
                });
            }));
        });
    }
    refreshInfo() {
        return __awaiter(this, void 0, void 0, function* () {
            this.log.info('Refreshing info of devices.');
            const devices = yield this.getDevicesAsync();
            devices.forEach((device) => __awaiter(this, void 0, void 0, function* () {
                const name = device.common.name;
                this.log.debug(`Refreshing info of device ${name}.`);
                const channelState = yield this.getStateAsync(`${name}.channel`);
                const channel = channelState === null || channelState === void 0 ? void 0 : channelState.val;
                try {
                    const info = yield this.client.getInfo(channel);
                    if (info == null) {
                        this.log.debug(`No info for channel ${channel} returned.`);
                        return;
                    }
                    this.log.debug(`Info for channel ${channel} returned.`);
                    if (info.status != null) {
                        this.log.debug(`Status of channel ${channel}: ${info.status}`);
                        this.setStateChanged(`${device._id}.info`, elero_usb_transmitter_client_1.InfoData[info.status], true);
                        if (info.status == elero_usb_transmitter_client_1.InfoData.INFO_BOTTOM_POSITION_STOP) {
                            this.setStateChangedAsync(`${device._id}.level`, 100, true);
                        }
                        else if (info.status == elero_usb_transmitter_client_1.InfoData.INFO_TOP_POSITION_STOP) {
                            this.setStateChangedAsync(`${device._id}.level`, 0, true);
                        }
                    }
                }
                catch (error) {
                    this.log.error(`Error while refreshing device: ${error}.`);
                }
            }));
        });
    }
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    onUnload(callback) {
        var _a;
        try {
            if (this.refreshTimeout)
                clearTimeout(this.refreshTimeout);
            (_a = this.client) === null || _a === void 0 ? void 0 : _a.close();
            callback();
        }
        catch (e) {
            callback();
        }
    }
    sendControlCommand(deviceName, value) {
        return __awaiter(this, void 0, void 0, function* () {
            const channelState = yield this.getStateAsync(`${deviceName}.channel`);
            const channel = channelState === null || channelState === void 0 ? void 0 : channelState.val;
            this.log.debug(`Try to send control command ${value} to ${deviceName} with channel ${channel}.`);
            const response = yield this.client.sendControlCommand(channel, Number.parseInt(value));
            this.log.info(`Response from sending command ${value} to device ${deviceName}: ${JSON.stringify(response)}`);
            yield this.setStateChangedAsync(`${deviceName}.controlCommand`, value, true);
        });
    }
    setLevel(deviceName, newLevel, inverted = false) {
        return __awaiter(this, void 0, void 0, function* () {
            this.log.debug(`Try to set level ${newLevel} for ${deviceName}.`);
            const channelState = yield this.getStateAsync(`${deviceName}.channel`);
            if (channelState == null)
                return;
            const channel = channelState.val;
            let commandFor100 = elero_usb_transmitter_client_1.ControlCommand.down;
            let commandFor0 = elero_usb_transmitter_client_1.ControlCommand.up;
            if (inverted) {
                commandFor100 = elero_usb_transmitter_client_1.ControlCommand.up;
                commandFor0 = elero_usb_transmitter_client_1.ControlCommand.down;
            }
            if (newLevel >= 100) {
                yield this.client.sendControlCommand(channel, commandFor100);
            }
            else {
                yield this.client.sendControlCommand(channel, commandFor0);
            }
            yield this.setStateChangedAsync(`${deviceName}.level`, newLevel, true);
            this.log.debug(`SetLevel finished.`);
        });
    }
    /**
     * Is called if a subscribed state changes
     */
    onStateChange(id, state) {
        if (state) {
            const elements = id.split('.');
            const deviceName = elements[elements.length - 2];
            const stateName = elements[elements.length - 1];
            if (stateName == 'controlCommand') {
                try {
                    this.sendControlCommand(deviceName, state.val);
                }
                catch (error) {
                    this.log.error(`Can not send control command: ${error}`);
                }
            }
            if (stateName == 'level') {
                this.log.debug(`new level ${state.val}`);
                try {
                    this.setLevel(deviceName, state.val);
                }
                catch (e) {
                    this.handleClientError(e);
                }
            }
            if (stateName == 'level_inverted') {
                this.log.debug(`new level_inverted ${state.val}`);
                try {
                    this.setLevel(deviceName, state.val, true);
                }
                catch (e) {
                    this.handleClientError(e);
                }
            }
            // The state was changed
            this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
        }
        else {
            // The state was deleted
            this.log.info(`state ${id} deleted`);
        }
    }
    createDevices() {
        return __awaiter(this, void 0, void 0, function* () {
            let activeChannels;
            try {
                this.log.debug('Check aktive channels.');
                activeChannels = yield this.client.checkChannels();
                this.log.debug(`Got ${activeChannels.length} active channels.`);
            }
            catch (error) {
                this.log.error(`Can not check active channels: ${error}`);
                yield this.client.close();
                yield this.client.open();
                activeChannels = yield this.client.checkChannels();
            }
            this.log.debug('Iterate over active channels and create devices.');
            activeChannels.forEach((element) => {
                this.log.info(`Active channel: ${element}`);
                this.createEleroDevice(element);
            });
        });
    }
    createEleroDevice(channel) {
        this.log.debug(`Create device with channel ${channel}.`);
        // create device with channel number as ID.
        this.createDevice(`channel_${channel.toString()}`);
        this.log.debug(`Create state channel.`);
        this.createState(`channel_${channel.toString()}`, '', 'channel', { role: 'text', write: false, def: channel, defAck: true, type: 'number' }, undefined);
        this.log.debug(`Create state controlCommand.`);
        this.createState(`channel_${channel.toString()}`, '', 'controlCommand', {
            role: 'state',
            states: {
                16: elero_usb_transmitter_client_1.ControlCommand[16],
                32: elero_usb_transmitter_client_1.ControlCommand[32],
                36: elero_usb_transmitter_client_1.ControlCommand[36],
                64: elero_usb_transmitter_client_1.ControlCommand[64],
                68: elero_usb_transmitter_client_1.ControlCommand[68],
            },
            write: true,
            def: 16,
            defAck: true,
            type: 'number',
        }, undefined);
        this.log.debug(`Create state info.`);
        this.createState(`channel_${channel.toString()}`, '', 'info', { role: 'text', write: false, def: '', type: 'string' }, undefined);
        this.log.debug(`Create state level.`);
        this.createState(`channel_${channel.toString()}`, '', 'level', { role: 'level.blind', write: true, def: 0, min: 0, max: 100, unit: '%', type: 'number' }, undefined);
        this.log.debug(`Create state level_inverted.`);
        this.createState(`channel_${channel.toString()}`, '', 'level_inverted', { role: 'level.blind', write: true, def: 0, min: 0, max: 100, unit: '%', type: 'number' }, undefined);
        this.log.debug(`Device with channel ${channel} created.`);
    }
    onMessage(obj) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!obj) {
                return;
            }
        });
    }
    handleClientError(error) {
        return __awaiter(this, void 0, void 0, function* () {
            this.log.debug('Try to handle error.');
            if (error instanceof Error) {
                this.log.error(`Unknown error: ${error}. Stack: ${error.stack}`);
            }
        });
    }
    setupRefreshTimeout() {
        this.log.debug('setupRefreshTimeout');
        const refreshIntervalInMilliseconds = this.refreshIntervalInMinutes * 60 * 1000;
        this.log.debug(`refreshIntervalInMilliseconds=${refreshIntervalInMilliseconds}`);
        this.refreshTimeout = setTimeout(this.refreshTimeoutFunc.bind(this), refreshIntervalInMilliseconds);
    }
    refreshTimeoutFunc() {
        return __awaiter(this, void 0, void 0, function* () {
            this.log.debug(`refreshTimeoutFunc started.`);
            try {
                this.refreshInfo();
                this.setupRefreshTimeout();
            }
            catch (error) {
                yield this.handleClientError(error);
            }
        });
    }
}
if (module.parent) {
    // Export the constructor in compact mode
    module.exports = (options) => new EleroUsbTransmitter(options);
}
else {
    // otherwise start the instance directly
    ;
    (() => new EleroUsbTransmitter())();
}
