/**
 * HomeKit SecuritySystem values. Kept numeric so the mapping can be tested
 * without loading Homebridge.
 *
 * Target:  0 Home, 1 Away, 2 Night, 3 Disarm
 * Current: 0 Home, 1 Away, 2 Night, 3 Disarmed, 4 Alarm triggered
 */
export declare const HOMEKIT_HOME = 0;
export declare const HOMEKIT_AWAY = 1;
export declare const HOMEKIT_NIGHT = 2;
export declare const HOMEKIT_DISARM = 3;
export declare const HOMEKIT_ALARM = 4;
export type PanelMode = 'HOME' | 'STAY' | 'AWAY' | 'NIGHT' | 'DISARM';
export type NightArm = 'home' | 'away';
export type PanelProfile = 'connectalarm' | 'powermaster';
export declare function resolveProfile(host: string | undefined, profile: unknown): PanelProfile;
export declare function targetStateToPanelMode(target: number, profile?: PanelProfile, nightArm?: NightArm): PanelMode;
export declare function panelStateToCurrent(raw: string | null | undefined, alarmActive: boolean): number | null;
export interface PartitionSnapshot {
    id?: number | string;
    state?: string;
    status?: string;
}
export declare function selectPartitionState(partitions: PartitionSnapshot[] | undefined, partitionId: number): string | null;
export interface ProcessRecord {
    status?: string;
    message?: string;
    error?: string | null;
}
export declare function normalizeProcesses(payload: unknown): ProcessRecord[];
export declare function processOutcome(records: ProcessRecord[]): 'pending' | 'success' | 'failure';
export declare function processFailureMessage(records: ProcessRecord[]): string;
export declare function hasActiveAlarm(payload: unknown): boolean;
