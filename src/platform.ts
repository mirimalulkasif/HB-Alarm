import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type {
  API,
  Characteristic,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  PlatformConfig,
  Service,
} from 'homebridge';

import { VisonicSecurityAccessory } from './accessory';
import { VisonicClient } from './client';
import {
  DEFAULT_POLL_SECONDS,
  DEFAULT_REST_VERSION,
  MIN_POLL_SECONDS,
  PLATFORM_NAME,
  PLUGIN_NAME,
  POWERMASTER_REST_VERSION,
} from './settings';
import { NightArm, resolveProfile } from './states';

const APP_ID_FILE = 'visonic-alarm-app-id.json';

export class VisonicPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  private readonly cachedAccessories: PlatformAccessory[] = [];
  private accessoryHandler?: VisonicSecurityAccessory;
  private pollTimer?: ReturnType<typeof setInterval>;
  public ready: Promise<void> = Promise.resolve();

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;
    this.api.on('didFinishLaunching', () => {
      this.ready = this.start().catch((error: unknown) => {
        this.log.error(error instanceof Error ? error.message : 'Visonic startup failed');
      });
    });
    this.api.on('shutdown', () => {
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
      }
    });
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.cachedAccessories.push(accessory);
    this.log.debug(`Restoring cached accessory ${accessory.displayName}`);
  }

  private async start(): Promise<void> {
    if (!this.config) {
      return;
    }
    const missing = ['email', 'password', 'panelSerial', 'userCode'].filter((key) => !this.config[key]);
    if (missing.length > 0) {
      this.log.error(`Missing Visonic configuration: ${missing.join(', ')}`);
      return;
    }

    const appId = this.resolveAppId();
    const profile = resolveProfile(this.config.host, this.config.profile);
    const nightArm: NightArm = this.config.nightArm === 'away' ? 'away' : 'home';
    const pollSeconds = Math.max(MIN_POLL_SECONDS, Number(this.config.pollInterval) || DEFAULT_POLL_SECONDS);
    const client = new VisonicClient({
      host: this.config.host,
      email: String(this.config.email),
      password: String(this.config.password),
      panelSerial: String(this.config.panelSerial),
      userCode: String(this.config.userCode),
      appId,
      restVersion: this.config.restVersion || (profile === 'connectalarm' ? DEFAULT_REST_VERSION : POWERMASTER_REST_VERSION),
      appType: this.config.appType,
      partition: this.config.partition === undefined ? undefined : Number(this.config.partition),
    });

    const name = this.config.name || 'Visonic Alarm';
    const uuid = this.api.hap.uuid.generate(`${PLUGIN_NAME}:${this.config.panelSerial}:${this.config.partition ?? -1}`);
    const existing = this.cachedAccessories.find((item) => item.UUID === uuid);
    const accessory = existing ?? new this.api.platformAccessory(name, uuid);
    accessory.context.panelSerial = this.config.panelSerial;

    this.accessoryHandler = new VisonicSecurityAccessory(this, accessory, client, profile, nightArm);
    if (!existing) {
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
    const stale = this.cachedAccessories.filter((item) => item.UUID !== uuid);
    if (stale.length > 0) {
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, stale);
    }

    await this.accessoryHandler.refresh();
    this.pollTimer = setInterval(() => {
      void this.accessoryHandler?.refresh();
    }, pollSeconds * 1000);
    const panelName = profile === 'connectalarm' ? 'ConnectAlarm' : 'PowerMaster';
    this.log.info(`Watching the ${panelName} panel every ${pollSeconds} seconds`);
  }

  private resolveAppId(): string {
    if (typeof this.config.appId === 'string' && this.config.appId.trim()) {
      return this.config.appId.trim();
    }
    const storage = this.api.user?.storagePath?.();
    if (!storage) {
      return randomUUID();
    }
    const file = join(storage, APP_ID_FILE);
    try {
      const saved = JSON.parse(readFileSync(file, 'utf8')) as { appId?: string };
      if (saved.appId) {
        return saved.appId;
      }
    } catch {
      // A missing file means this is the first launch.
    }
    const appId = randomUUID();
    writeFileSync(file, JSON.stringify({ appId }));
    this.log.info('Saved a new Visonic app id for this Homebridge install');
    return appId;
  }
}
