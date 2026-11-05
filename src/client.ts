import {
  DEFAULT_APP_TYPE,
  DEFAULT_COMMAND_TIMEOUT_MS,
  DEFAULT_HOST,
  DEFAULT_PARTITION,
  DEFAULT_REST_VERSION,
  PROCESS_POLL_MS,
  REQUEST_TIMEOUT_MS,
} from './settings';
import {
  hasActiveAlarm,
  normalizeProcesses,
  PanelMode,
  processFailureMessage,
  processOutcome,
  selectPartitionState,
} from './states';

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

export class VisonicApiError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'VisonicApiError';
    this.status = status;
  }
}

interface RequestOptions {
  method: 'GET' | 'POST';
  body?: unknown;
  userToken?: boolean;
  sessionToken?: boolean;
  retried?: boolean;
}

export class VisonicClient {
  private readonly baseUrl: string;
  private readonly restVersion: string;
  private readonly appType: string;
  private readonly partition: number;
  private readonly commandTimeoutMs: number;
  private readonly processPollMs: number;
  private readonly fetchImpl: typeof fetch;
  private userToken: string | null = null;
  private sessionToken: string | null = null;

  constructor(private readonly options: VisonicClientOptions) {
    const host = (options.host || DEFAULT_HOST).replace(/\/+$/, '');
    this.baseUrl = /^https?:\/\//i.test(host) ? host : `https://${host}`;
    this.restVersion = options.restVersion || DEFAULT_REST_VERSION;
    this.appType = options.appType || DEFAULT_APP_TYPE;
    this.partition = options.partition ?? DEFAULT_PARTITION;
    this.commandTimeoutMs = options.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
    this.processPollMs = options.processPollMs ?? PROCESS_POLL_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async connect(): Promise<void> {
    if (!this.userToken) {
      await this.authenticate();
    }
    if (!this.sessionToken) {
      await this.panelLogin();
    }
  }

  async getSnapshot(): Promise<PanelSnapshot> {
    const status = await this.request('/status', { method: 'GET' });
    let alarmActive = false;
    try {
      alarmActive = hasActiveAlarm(await this.request('/alarms', { method: 'GET' }));
    } catch (error) {
      if (!(error instanceof VisonicApiError) || error.status !== 404) {
        throw error;
      }
    }
    const partitions = Array.isArray(status?.partitions) ? status.partitions : [];
    return {
      rawState: selectPartitionState(partitions, this.partition),
      alarmActive,
      connected: status?.connected !== false,
    };
  }

  async setMode(mode: PanelMode): Promise<void> {
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

  private async authenticate(): Promise<void> {
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

  private async panelLogin(): Promise<void> {
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

  private async waitForProcess(token: string): Promise<void> {
    const deadline = Date.now() + this.commandTimeoutMs;
    while (Date.now() <= deadline) {
      const payload = await this.request(`/process_status?process_tokens=${encodeURIComponent(token)}`, {
        method: 'GET',
      });
      const records = normalizeProcesses(payload);
      const outcome = processOutcome(records);
      if (outcome === 'success') {
        return;
      }
      if (outcome === 'failure') {
        throw new VisonicApiError(processFailureMessage(records));
      }
      await delay(this.processPollMs);
    }
    throw new VisonicApiError('Timed out waiting for the panel to confirm the command');
  }

  private async request(path: string, request: RequestOptions): Promise<any> {
    const userToken = request.userToken !== false;
    const sessionToken = request.sessionToken !== false;
    if (userToken && !this.userToken) {
      await this.authenticate();
    }
    if (sessionToken && !this.sessionToken) {
      await this.panelLogin();
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (userToken && this.userToken) {
      headers['User-Token'] = this.userToken;
    }
    if (sessionToken && this.sessionToken) {
      headers['Session-Token'] = this.sessionToken;
    }
    let body: string | undefined;
    if (request.body !== undefined) {
      body = JSON.stringify(request.body);
      headers['Content-Type'] = 'application/json';
    }

    const response = await this.fetchImpl(`${this.baseUrl}/rest_api/${this.restVersion}${path}`, {
      method: request.method,
      headers,
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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

    throw new VisonicApiError(errorMessage(payload, response.status), response.status);
  }
}

function parseJson(text: string): any {
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function errorMessage(payload: any, status: number): string {
  if (payload && typeof payload.error_message === 'string' && payload.error_message) {
    return payload.error_message;
  }
  if (payload && typeof payload.error_reason_code === 'string' && payload.error_reason_code) {
    return payload.error_reason_code;
  }
  return `Visonic request failed with HTTP ${status}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
