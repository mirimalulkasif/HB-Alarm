"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HOMEKIT_ALARM = exports.HOMEKIT_DISARM = exports.HOMEKIT_NIGHT = exports.HOMEKIT_AWAY = exports.HOMEKIT_HOME = void 0;
exports.resolveProfile = resolveProfile;
exports.targetStateToPanelMode = targetStateToPanelMode;
exports.panelStateToCurrent = panelStateToCurrent;
exports.selectPartitionState = selectPartitionState;
exports.normalizeProcesses = normalizeProcesses;
exports.processOutcome = processOutcome;
exports.processFailureMessage = processFailureMessage;
exports.hasActiveAlarm = hasActiveAlarm;
/**
 * HomeKit SecuritySystem values. Kept numeric so the mapping can be tested
 * without loading Homebridge.
 *
 * Target:  0 Home, 1 Away, 2 Night, 3 Disarm
 * Current: 0 Home, 1 Away, 2 Night, 3 Disarmed, 4 Alarm triggered
 */
exports.HOMEKIT_HOME = 0;
exports.HOMEKIT_AWAY = 1;
exports.HOMEKIT_NIGHT = 2;
exports.HOMEKIT_DISARM = 3;
exports.HOMEKIT_ALARM = 4;
function resolveProfile(host, profile) {
    if (profile === 'powermaster' || profile === 'connectalarm') {
        return profile;
    }
    const name = (host || '').toLowerCase();
    if (name.includes('visonic.tycomonitor.com')) {
        return 'powermaster';
    }
    return 'connectalarm';
}
function targetStateToPanelMode(target, profile = 'connectalarm', nightArm = 'home') {
    if (profile === 'powermaster') {
        switch (target) {
            case exports.HOMEKIT_HOME:
                return 'HOME';
            case exports.HOMEKIT_AWAY:
                return 'AWAY';
            case exports.HOMEKIT_NIGHT:
                return nightArm === 'away' ? 'AWAY' : 'HOME';
            case exports.HOMEKIT_DISARM:
                return 'DISARM';
            default:
                throw new Error(`Unsupported HomeKit target state ${target}`);
        }
    }
    switch (target) {
        case exports.HOMEKIT_HOME:
            return 'STAY';
        case exports.HOMEKIT_AWAY:
            return 'AWAY';
        case exports.HOMEKIT_NIGHT:
            return 'NIGHT';
        case exports.HOMEKIT_DISARM:
            return 'DISARM';
        default:
            throw new Error(`Unsupported HomeKit target state ${target}`);
    }
}
function panelStateToCurrent(raw, alarmActive) {
    if (alarmActive) {
        return exports.HOMEKIT_ALARM;
    }
    if (raw == null || raw === '') {
        return null;
    }
    const state = raw.trim().toUpperCase().replace(/[\s-]+/g, '_');
    if (state.includes('ALARM') || state === 'PANIC' || state === 'SIREN') {
        return exports.HOMEKIT_ALARM;
    }
    if (state === 'HOME' || state === 'ARM_HOME' || state === 'STAY' || state === 'ARMED_HOME') {
        return exports.HOMEKIT_HOME;
    }
    if (state === 'AWAY' || state === 'ARM_AWAY' || state === 'ARMED_AWAY') {
        return exports.HOMEKIT_AWAY;
    }
    if (state === 'NIGHT' || state === 'ARM_NIGHT' || state === 'ARMED_NIGHT') {
        return exports.HOMEKIT_NIGHT;
    }
    if (state === 'DISARM' || state === 'DISARMED' || state === 'READY') {
        return exports.HOMEKIT_DISARM;
    }
    return null;
}
function selectPartitionState(partitions, partitionId) {
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
function normalizeProcesses(payload) {
    if (Array.isArray(payload)) {
        return payload;
    }
    if (payload && typeof payload === 'object') {
        const record = payload;
        if (Array.isArray(record.processes)) {
            return record.processes;
        }
        if (Array.isArray(record.process)) {
            return record.process;
        }
        if (typeof record.status === 'string') {
            return [record];
        }
    }
    return [];
}
function processOutcome(records) {
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
function processFailureMessage(records) {
    const failed = records.find((record) => isFailureStatus(record.status) || Boolean(record.error));
    return failed?.error || failed?.message || 'The panel rejected the command';
}
function hasActiveAlarm(payload) {
    if (payload == null) {
        return false;
    }
    if (Array.isArray(payload)) {
        return payload.length > 0;
    }
    if (typeof payload === 'object') {
        const record = payload;
        if (Array.isArray(record.alarms)) {
            return record.alarms.length > 0;
        }
        if (typeof record.count === 'number') {
            return record.count > 0;
        }
    }
    return false;
}
function isSuccessStatus(status) {
    const value = (status ?? '').trim().toLowerCase();
    return value === 'succeeded' || value === 'success' || value === 'ok';
}
function isFailureStatus(status) {
    const value = (status ?? '').trim().toLowerCase();
    return value === 'failed' || value === 'failure' || value === 'error';
}
//# sourceMappingURL=states.js.map