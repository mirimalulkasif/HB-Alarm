/**
 * HomeKit SecuritySystem values. Kept numeric so the mapping can be tested
 * without loading Homebridge.
 *
 * Target:  0 Home, 1 Away, 2 Night, 3 Disarm
 * Current: 0 Home, 1 Away, 2 Night, 3 Disarmed, 4 Alarm triggered
 */
export const HOMEKIT_HOME = 0;
export const HOMEKIT_AWAY = 1;
export const HOMEKIT_NIGHT = 2;
export const HOMEKIT_DISARM = 3;
export const HOMEKIT_ALARM = 4;

export type PanelMode = 'HOME' | 'STAY' | 'AWAY' | 'NIGHT' | 'DISARM';
export type NightArm = 'home' | 'away';
export type PanelProfile = 'connectalarm' | 'powermaster';

export function resolveProfile(host: string | undefined, profile: unknown): PanelProfile {
  if (profile === 'powermaster' || profile === 'connectalarm') {
    return profile;
  }
  const name = (host || '').toLowerCase();
  if (name.includes('visonic.tycomonitor.com')) {
    return 'powermaster';
  }
  return 'connectalarm';
}

export function targetStateToPanelMode(
  target: number,
  profile: PanelProfile = 'connectalarm',
  nightArm: NightArm = 'home',
): PanelMode {
  if (profile === 'powermaster') {
    switch (target) {
      case HOMEKIT_HOME:
        return 'HOME';
      case HOMEKIT_AWAY:
        return 'AWAY';
      case HOMEKIT_NIGHT:
        return nightArm === 'away' ? 'AWAY' : 'HOME';
      case HOMEKIT_DISARM:
        return 'DISARM';
      default:
        throw new Error(`Unsupported HomeKit target state ${target}`);
    }
  }

  switch (target) {
    case HOMEKIT_HOME:
      return 'STAY';
    case HOMEKIT_AWAY:
      return 'AWAY';
    case HOMEKIT_NIGHT:
      return 'NIGHT';
    case HOMEKIT_DISARM:
      return 'DISARM';
    default:
      throw new Error(`Unsupported HomeKit target state ${target}`);
  }
}

export function panelStateToCurrent(raw: string | null | undefined, alarmActive: boolean): number | null {
  if (alarmActive) {
    return HOMEKIT_ALARM;
  }
  if (raw == null || raw === '') {
    return null;
  }

  const state = raw.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (state.includes('ALARM') || state === 'PANIC' || state === 'SIREN') {
    return HOMEKIT_ALARM;
  }
  if (state === 'HOME' || state === 'ARM_HOME' || state === 'STAY' || state === 'ARMED_HOME') {
    return HOMEKIT_HOME;
  }
  if (state === 'AWAY' || state === 'ARM_AWAY' || state === 'ARMED_AWAY') {
    return HOMEKIT_AWAY;
  }
  if (state === 'NIGHT' || state === 'ARM_NIGHT' || state === 'ARMED_NIGHT') {
    return HOMEKIT_NIGHT;
  }
  if (state === 'DISARM' || state === 'DISARMED' || state === 'READY') {
    return HOMEKIT_DISARM;
  }
  return null;
}

export interface PartitionSnapshot {
  id?: number | string;
  state?: string;
  status?: string;
}

export function selectPartitionState(
  partitions: PartitionSnapshot[] | undefined,
  partitionId: number,
): string | null {
  if (!partitions || partitions.length === 0) {
    return null;
  }
  if (partitionId !== -1) {
    const match = partitions.find((partition) => Number(partition.id) === partitionId);
    if (match) {
      return match.state ?? match.status ?? null;
    }
  }
  return partitions[0].state ?? partitions[0].status ?? null;
}

export interface ProcessRecord {
  status?: string;
  message?: string;
  error?: string | null;
}

export function normalizeProcesses(payload: unknown): ProcessRecord[] {
  if (Array.isArray(payload)) {
    return payload as ProcessRecord[];
  }
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.processes)) {
      return record.processes as ProcessRecord[];
    }
    if (Array.isArray(record.process)) {
      return record.process as ProcessRecord[];
    }
    if (typeof record.status === 'string') {
      return [record as ProcessRecord];
    }
  }
  return [];
}

export function processOutcome(records: ProcessRecord[]): 'pending' | 'success' | 'failure' {
  if (records.length === 0) {
    return 'pending';
  }
  const failed = records.find((record) => isFailureStatus(record.status) || Boolean(record.error));
  if (failed) {
    return 'failure';
  }
  if (records.every((record) => isSuccessStatus(record.status))) {
    return 'success';
  }
  return 'pending';
}

export function processFailureMessage(records: ProcessRecord[]): string {
  const failed = records.find((record) => isFailureStatus(record.status) || Boolean(record.error));
  return failed?.error || failed?.message || 'The panel rejected the command';
}

export function hasActiveAlarm(payload: unknown): boolean {
  if (payload == null) {
    return false;
  }
  if (Array.isArray(payload)) {
    return payload.length > 0;
  }
  if (typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.alarms)) {
      return record.alarms.length > 0;
    }
    if (typeof record.count === 'number') {
      return record.count > 0;
    }
  }
  return false;
}

function isSuccessStatus(status: string | undefined): boolean {
  const value = (status ?? '').trim().toLowerCase();
  return value === 'succeeded' || value === 'success' || value === 'ok';
}

function isFailureStatus(status: string | undefined): boolean {
  const value = (status ?? '').trim().toLowerCase();
  return value === 'failed' || value === 'failure' || value === 'error';
}
