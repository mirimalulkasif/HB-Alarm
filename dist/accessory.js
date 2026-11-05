"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VisonicSecurityAccessory = void 0;
const client_1 = require("./client");
const states_1 = require("./states");
class VisonicSecurityAccessory {
    platform;
    accessory;
    client;
    service;
    currentState;
    refreshing = false;
    constructor(platform, accessory, client) {
        this.platform = platform;
        this.accessory = accessory;
        this.client = client;
        const { Characteristic, Service } = this.platform;
        this.currentState = Characteristic.SecuritySystemCurrentState.DISARMED;
        this.accessory.getService(Service.AccessoryInformation)
            ?.setCharacteristic(Characteristic.Manufacturer, 'Visonic')
            .setCharacteristic(Characteristic.Model, 'PowerMaster')
            .setCharacteristic(Characteristic.SerialNumber, this.platform.config.panelSerial ?? 'unknown');
        this.service = this.accessory.getService(Service.SecuritySystem)
            || this.accessory.addService(Service.SecuritySystem, this.accessory.displayName);
        this.service.setCharacteristic(Characteristic.Name, this.accessory.displayName);
        this.service.getCharacteristic(Characteristic.SecuritySystemCurrentState)
            .setProps({
            validValues: [states_1.HOMEKIT_HOME, states_1.HOMEKIT_AWAY, states_1.HOMEKIT_DISARM, Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED],
        })
            .onGet(() => this.currentState);
        this.service.getCharacteristic(Characteristic.SecuritySystemTargetState)
            .setProps({ validValues: [states_1.HOMEKIT_HOME, states_1.HOMEKIT_AWAY, states_1.HOMEKIT_DISARM] })
            .onSet((value) => this.setTargetState(value));
        this.service.getCharacteristic(Characteristic.StatusFault)
            .onGet(() => this.service.getCharacteristic(Characteristic.StatusFault).value
            ?? Characteristic.StatusFault.NO_FAULT);
    }
    async refresh() {
        if (this.refreshing) {
            return;
        }
        this.refreshing = true;
        const { Characteristic } = this.platform.api.hap;
        try {
            const snapshot = await this.client.getSnapshot();
            const mapped = (0, states_1.panelStateToCurrent)(snapshot.rawState, snapshot.alarmActive);
            if (!snapshot.connected) {
                this.service.updateCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.GENERAL_FAULT);
                return;
            }
            this.service.updateCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.NO_FAULT);
            if (mapped == null) {
                this.platform.log.debug(`Panel reported an unrecognized state: ${snapshot.rawState ?? 'empty'}`);
                return;
            }
            this.currentState = mapped;
            this.service.updateCharacteristic(Characteristic.SecuritySystemCurrentState, mapped);
            if (mapped !== Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED) {
                this.service.updateCharacteristic(Characteristic.SecuritySystemTargetState, currentToTarget(mapped));
            }
        }
        catch (error) {
            this.service.updateCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.GENERAL_FAULT);
            this.platform.log.error(errorMessage(error));
        }
        finally {
            this.refreshing = false;
        }
    }
    async setTargetState(value) {
        const target = Number(value);
        const mode = (0, states_1.targetStateToPanelMode)(target);
        this.platform.log.info(`Setting the alarm to ${mode}`);
        try {
            await this.client.setMode(mode);
            await this.refresh();
        }
        catch (error) {
            const message = errorMessage(error);
            this.platform.log.error(message);
            throw new this.platform.api.hap.HapStatusError(-70402 /* this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE */);
        }
    }
}
exports.VisonicSecurityAccessory = VisonicSecurityAccessory;
function currentToTarget(current) {
    return current > 3 ? 3 : current;
}
function errorMessage(error) {
    if (error instanceof client_1.VisonicApiError) {
        return error.message;
    }
    if (error instanceof Error) {
        const cause = error.cause;
        return cause?.code ? `${error.message} (${cause.code})` : error.message;
    }
    return 'The Visonic panel request failed';
}
//# sourceMappingURL=accessory.js.map