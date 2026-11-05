import { PanelMode } from './states';
export interface VisonicClientOptions {
    host?: string;
    email: string;
    password: string;
    panelSerial: string;
    userCode: string;
    appId: string;
    restVersion?: string;
    appType?: string;
    partition?: number;
    commandTimeoutMs?: number;
    processPollMs?: number;
    fetchImpl?: typeof fetch;
}
export interface PanelSnapshot {
    rawState: string | null;
    alarmActive: boolean;
    connected: boolean;
}
export declare class VisonicApiError extends Error {
    readonly status?: number;
    constructor(message: string, status?: number);
}
export declare class VisonicClient {
    private readonly options;
    private readonly baseUrl;
    private readonly restVersion;
    private readonly appType;
    private readonly partition;
    private readonly commandTimeoutMs;
    private readonly processPollMs;
    private readonly fetchImpl;
    private userToken;
    private sessionToken;
    constructor(options: VisonicClientOptions);
    connect(): Promise<void>;
    getSnapshot(): Promise<PanelSnapshot>;
    setMode(mode: PanelMode): Promise<void>;
    private authenticate;
    private panelLogin;
    private waitForProcess;
    private request;
}
