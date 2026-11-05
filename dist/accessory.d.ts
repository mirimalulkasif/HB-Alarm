import type { PlatformAccessory } from 'homebridge';
import { VisonicClient } from './client';
import type { VisonicPlatform } from './platform';
export declare class VisonicSecurityAccessory {
    private readonly platform;
    private readonly accessory;
    private readonly client;
    private readonly service;
    private currentState;
    private refreshing;
    constructor(platform: VisonicPlatform, accessory: PlatformAccessory, client: VisonicClient);
    refresh(): Promise<void>;
    private setTargetState;
}
