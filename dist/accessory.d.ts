import type { PlatformAccessory } from 'homebridge';
import { VisonicClient } from './client';
import type { VisonicPlatform } from './platform';
import { NightArm, PanelProfile } from './states';
export declare class VisonicSecurityAccessory {
    private readonly platform;
    private readonly accessory;
    private readonly client;
    private readonly profile;
    private readonly nightArm;
    private readonly service;
    private currentState;
    private refreshing;
    constructor(platform: VisonicPlatform, accessory: PlatformAccessory, client: VisonicClient, profile: PanelProfile, nightArm: NightArm);
    refresh(): Promise<void>;
    private setTargetState;
}
