"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VisonicClient = exports.VisonicApiError = void 0;
const settings_1 = require("./settings");
const states_1 = require("./states");
class VisonicApiError extends Error {
    status;
    constructor(message, status) {
        super(message);
        this.name = 'VisonicApiError';
        this.status = status;
    }
}
exports.VisonicApiError = VisonicApiError;
class VisonicClient {
    options;
    baseUrl;
    restVersion;
    appType;
    partition;
    commandTimeoutMs;
    processPollMs;
    fetchImpl;
    userToken = null;
    sessionToken = null;
    constructor(options) {
        this.options = options;
        const host = (options.host || settings_1.DEFAULT_HOST).replace(/\/+$/, '');
        this.baseUrl = /^https?:\/\//i.test(host) ? host : `https://${host}`;
        this.restVersion = options.restVersion || settings_1.DEFAULT_REST_VERSION;
        this.appType = options.appType || settings_1.DEFAULT_APP_TYPE;
        this.partition = options.partition ?? settings_1.DEFAULT_PARTITION;
        this.commandTimeoutMs = options.commandTimeoutMs ?? settings_1.DEFAULT_COMMAND_TIMEOUT_MS;
        this.processPollMs = options.processPollMs ?? settings_1.PROCESS_POLL_MS;
        this.fetchImpl = options.fetchImpl ?? fetch;
    }
    async connect() {
        if (!this.userToken) {
            await this.authenticate();
        }
        if (!this.sessionToken) {
            await this.panelLogin();
        }
    }
    async getSnapshot() {
        const status = await this.request('/status', { method: 'GET' });
        let alarmActive = false;
        try {
            alarmActive = (0, states_1.hasActiveAlarm)(await this.request('/alarms', { method: 'GET' }));
        }
        catch (error) {
            if (!(error instanceof VisonicApiError) || error.status !== 404) {
                throw error;
            }
        }
        const partitions = Array.isArray(status?.partitions) ? status.partitions : [];
        return {
            rawState: (0, states_1.selectPartitionState)(partitions, this.partition),
            alarmActive,
            connected: status?.connected !== false,
        };
    }
    async setMode(mode) {
        const result = await this.request('/set_state', {
            method: 'POST',
            body: {
                partition: this.partition,
                state: mode,
            },
        });
        const token = typeof result?.process_token === 'string' ? result.process_token : '';
        if (!token) {
            throw new VisonicApiError('The panel did not return a process token');
        }
        await this.waitForProcess(token);
    }
    async authenticate() {
        const result = await this.request('/auth', {
            method: 'POST',
            userToken: false,
            sessionToken: false,
            body: {
                email: this.options.email,
                password: this.options.password,
                app_id: this.options.appId,
            },
        });
        if (typeof result?.user_token !== 'string' || result.user_token.length === 0) {
            throw new VisonicApiError('Visonic did not return a user token');
        }
        this.userToken = result.user_token;
    }
    async panelLogin() {
        const result = await this.request('/panel/login', {
            method: 'POST',
            sessionToken: false,
            body: {
                user_code: this.options.userCode,
                app_type: this.appType,
                app_id: this.options.appId,
                panel_serial: this.options.panelSerial,
            },
        });
        if (typeof result?.session_token !== 'string' || result.session_token.length === 0) {
            throw new VisonicApiError('Visonic did not return a panel session');
        }
        this.sessionToken = result.session_token;
    }
    async waitForProcess(token) {
        const deadline = Date.now() + this.commandTimeoutMs;
        while (Date.now() <= deadline) {
            const payload = await this.request(`/process_status?process_tokens=${encodeURIComponent(token)}`, {
                method: 'GET',
            });
            const records = (0, states_1.normalizeProcesses)(payload);
            const outcome = (0, states_1.processOutcome)(records);
            if (outcome === 'success') {
                return;
            }
            if (outcome === 'failure') {
                throw new VisonicApiError((0, states_1.processFailureMessage)(records));
            }
            await delay(this.processPollMs);
        }
        throw new VisonicApiError('Timed out waiting for the panel to confirm the command');
    }
    async request(path, request) {
        const userToken = request.userToken !== false;
        const sessionToken = request.sessionToken !== false;
        if (userToken && !this.userToken) {
            await this.authenticate();
        }
        if (sessionToken && !this.sessionToken) {
            await this.panelLogin();
        }
        const headers = {
            Accept: 'application/json',
        };
        if (userToken && this.userToken) {
            headers['User-Token'] = this.userToken;
        }
        if (sessionToken && this.sessionToken) {
            headers['Session-Token'] = this.sessionToken;
        }
        let body;
        if (request.body !== undefined) {
            body = JSON.stringify(request.body);
            headers['Content-Type'] = 'application/json';
        }
        const response = await this.fetchImpl(`${this.baseUrl}/rest_api/${this.restVersion}${path}`, {
            method: request.method,
            headers,
            body,
            signal: AbortSignal.timeout(settings_1.REQUEST_TIMEOUT_MS),
        });
        const text = await response.text();
        const payload = parseJson(text);
        if (response.ok) {
            return payload;
        }
        const expired = response.status === 401 || response.status === 440;
        if (expired && !request.retried && path !== '/auth') {
            this.userToken = response.status === 401 ? null : this.userToken;
            this.sessionToken = null;
            return this.request(path, { ...request, retried: true });
        }
        throw new VisonicApiError(errorMessage(payload, response.status, path), response.status);
    }
}
exports.VisonicClient = VisonicClient;
function parseJson(text) {
    if (!text) {
        return null;
    }
    try {
        return JSON.parse(text);
    }
    catch {
        return null;
    }
}
function errorMessage(payload, status, path) {
    if (payload && typeof payload.error_message === 'string' && payload.error_message) {
        return payload.error_message;
    }
    if (payload && typeof payload.error_reason_code === 'string' && payload.error_reason_code) {
        return payload.error_reason_code;
    }
    return `Visonic request failed with HTTP ${status} for ${path}`;
}
function delay(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
//# sourceMappingURL=client.js.map