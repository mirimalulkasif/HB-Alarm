"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VisonicPlatform = void 0;
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const accessory_1 = require("./accessory");
const client_1 = require("./client");
const settings_1 = require("./settings");
const APP_ID_FILE = 'visonic-alarm-app-id.json';
class VisonicPlatform {
    log;
    config;
    api;
    Service;
    Characteristic;
    cachedAccessories = [];
    accessoryHandler;
    pollTimer;
    ready = Promise.resolve();
    constructor(log, config, api) {
        this.log = log;
        this.config = config;
        this.api = api;
        this.Service = api.hap.Service;
        this.Characteristic = api.hap.Characteristic;
        this.api.on('didFinishLaunching', () => {
            this.ready = this.start().catch((error) => {
                this.log.error(error instanceof Error ? error.message : 'Visonic startup failed');
            });
        });
        this.api.on('shutdown', () => {
            if (this.pollTimer) {
                clearInterval(this.pollTimer);
            }
        });
    }
    configureAccessory(accessory) {
        this.cachedAccessories.push(accessory);
        this.log.debug(`Restoring cached accessory ${accessory.displayName}`);
    }
    async start() {
        if (!this.config) {
            return;
        }
        const missing = ['email', 'password', 'panelSerial', 'userCode'].filter((key) => !this.config[key]);
        if (missing.length > 0) {
            this.log.error(`Missing Visonic configuration: ${missing.join(', ')}`);
            return;
        }
        const appId = this.resolveAppId();
        const nightArm = this.config.nightArm === 'away' ? 'away' : 'home';
        const pollSeconds = Math.max(settings_1.MIN_POLL_SECONDS, Number(this.config.pollInterval) || settings_1.DEFAULT_POLL_SECONDS);
        const client = new client_1.VisonicClient({
            host: this.config.host,
            email: String(this.config.email),
            password: String(this.config.password),
            panelSerial: String(this.config.panelSerial),
            userCode: String(this.config.userCode),
            appId,
            restVersion: this.config.restVersion,
            appType: this.config.appType,
            partition: this.config.partition === undefined ? undefined : Number(this.config.partition),
        });
        const name = this.config.name || 'Visonic Alarm';
        const uuid = this.api.hap.uuid.generate(`${settings_1.PLUGIN_NAME}:${this.config.panelSerial}:${this.config.partition ?? -1}`);
        const existing = this.cachedAccessories.find((item) => item.UUID === uuid);
        const accessory = existing ?? new this.api.platformAccessory(name, uuid);
        accessory.context.panelSerial = this.config.panelSerial;
        this.accessoryHandler = new accessory_1.VisonicSecurityAccessory(this, accessory, client, nightArm);
        if (!existing) {
            this.api.registerPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [accessory]);
        }
        const stale = this.cachedAccessories.filter((item) => item.UUID !== uuid);
        if (stale.length > 0) {
            this.api.unregisterPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, stale);
        }
        await this.accessoryHandler.refresh();
        this.pollTimer = setInterval(() => {
            void this.accessoryHandler?.refresh();
        }, pollSeconds * 1000);
        this.log.info(`Watching the Visonic panel every ${pollSeconds} seconds`);
    }
    resolveAppId() {
        if (typeof this.config.appId === 'string' && this.config.appId.trim()) {
            return this.config.appId.trim();
        }
        const storage = this.api.user?.storagePath?.();
        if (!storage) {
            return (0, node_crypto_1.randomUUID)();
        }
        const file = (0, node_path_1.join)(storage, APP_ID_FILE);
        try {
            const saved = JSON.parse((0, node_fs_1.readFileSync)(file, 'utf8'));
            if (saved.appId) {
                return saved.appId;
            }
        }
        catch {
            // A missing file means this is the first launch.
        }
        const appId = (0, node_crypto_1.randomUUID)();
        (0, node_fs_1.writeFileSync)(file, JSON.stringify({ appId }));
        this.log.info('Saved a new Visonic app id for this Homebridge install');
        return appId;
    }
}
exports.VisonicPlatform = VisonicPlatform;
//# sourceMappingURL=platform.js.map