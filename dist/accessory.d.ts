import type { PlatformAccessory } from 'homebridge';
import { VisonicClient } from './client';
import type { VisonicPlatform } from './platform';
import { NightArm } from './states';
export declare class VisonicSecurityAccessory {
    private readonly platform;
    private readonly accessory;
    private readonly client;
    private readonly nightArm;
    private readonly service;
    private currentState;
    private refreshing;
    constructor(platform: VisonicPlatform, accessory: PlatformAccessory, client: VisonicClient, nightArm: NightArm);
    refresh(): Promise<void>;
    private setTargetState;
}
