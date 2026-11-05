import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';

import { VisonicApiError, VisonicClient } from './client';
import type { VisonicPlatform } from './platform';
import { NightArm, PanelProfile, panelStateToCurrent, targetStateToPanelMode } from './states';

export class VisonicSecurityAccessory {
  private readonly service: Service;
  private currentState: number;
  private refreshing = false;

  constructor(
    private readonly platform: VisonicPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly client: VisonicClient,
    private readonly profile: PanelProfile,
    private readonly nightArm: NightArm,
  ) {
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
      .onGet(() => this.currentState);
    this.service.getCharacteristic(Characteristic.SecuritySystemTargetState)
      .onSet((value) => this.setTargetState(value));
    this.service.getCharacteristic(Characteristic.StatusFault)
      .onGet(() => this.service.getCharacteristic(Characteristic.StatusFault).value
        ?? Characteristic.StatusFault.NO_FAULT);
  }

  async refresh(): Promise<void> {
    if (this.refreshing) {
      return;
    }
    this.refreshing = true;
    const { Characteristic } = this.platform.api.hap;
    try {
      const snapshot = await this.client.getSnapshot();
      const mapped = panelStateToCurrent(snapshot.rawState, snapshot.alarmActive);
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
    } catch (error) {
      this.service.updateCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.GENERAL_FAULT);
      this.platform.log.error(errorMessage(error));
    } finally {
      this.refreshing = false;
    }
  }

  private async setTargetState(value: CharacteristicValue): Promise<void> {
    const target = Number(value);
    const mode = targetStateToPanelMode(target, this.profile, this.nightArm);
    this.platform.log.info(`Setting the alarm to ${mode}`);
    try {
      await this.client.setMode(mode);
      await this.refresh();
    } catch (error) {
      const message = errorMessage(error);
      this.platform.log.error(message);
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }
  }
}

function currentToTarget(current: number): number {
  return current > 3 ? 3 : current;
}

function errorMessage(error: unknown): string {
  if (error instanceof VisonicApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    const cause = (error as { cause?: { code?: string } }).cause;
    return cause?.code ? `${error.message} (${cause.code})` : error.message;
  }
  return 'The Visonic panel request failed';
}
