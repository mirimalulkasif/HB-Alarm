const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

const { VisonicClient, VisonicApiError } = require('../dist/client');
const {
  HOMEKIT_ALARM,
  HOMEKIT_AWAY,
  HOMEKIT_DISARM,
  HOMEKIT_HOME,
  HOMEKIT_NIGHT,
  hasActiveAlarm,
  panelStateToCurrent,
  processOutcome,
  targetStateToPanelMode,
} = require('../dist/states');

test('HomeKit targets map to ConnectAlarm modes', () => {
  assert.equal(targetStateToPanelMode(HOMEKIT_HOME), 'STAY');
  assert.equal(targetStateToPanelMode(HOMEKIT_AWAY), 'AWAY');
  assert.equal(targetStateToPanelMode(HOMEKIT_NIGHT), 'NIGHT');
  assert.equal(targetStateToPanelMode(HOMEKIT_DISARM), 'DISARM');
  assert.equal(targetStateToPanelMode(HOMEKIT_HOME, 'powermaster'), 'HOME');
  assert.equal(targetStateToPanelMode(HOMEKIT_NIGHT, 'powermaster', 'away'), 'AWAY');
});

test('panel states map to HomeKit current state', () => {
  assert.equal(panelStateToCurrent('DISARM', false), HOMEKIT_DISARM);
  assert.equal(panelStateToCurrent('HOME', false), HOMEKIT_HOME);
  assert.equal(panelStateToCurrent('armed-away', false), HOMEKIT_AWAY);
  assert.equal(panelStateToCurrent('EXIT', false), null);
  assert.equal(panelStateToCurrent('HOME', true), HOMEKIT_ALARM);
  assert.equal(hasActiveAlarm({ alarms: [{ id: 1 }] }), true);
  assert.equal(processOutcome([{ status: 'handled' }]), 'pending');
  assert.equal(processOutcome([{ status: 'succeeded' }]), 'success');
  assert.equal(processOutcome([{ status: 'failed', error: 'not ready' }]), 'failure');
});

test('client logs in, arms home, and reads the new state', async () => {
  const panel = createPanel();
  const server = await listen(panel.handle);
  try {
    const client = clientFor(server);
    const before = await client.getSnapshot();
    assert.equal(before.rawState, 'DISARM');
    assert.equal(before.alarmActive, false);

    await client.setMode('HOME');
    const after = await client.getSnapshot();
    assert.equal(after.rawState, 'HOME');
    assert.deepEqual(panel.commands, [{ partition: -1, state: 'HOME' }]);
    assert.equal(panel.authCalls, 1);
    assert.equal(panel.loginCalls, 1);
  } finally {
    await close(server);
  }
});

test('a rejected panel command surfaces the panel error', async () => {
  const panel = createPanel();
  panel.processStatus = 'failed';
  panel.processError = 'not ready';
  const server = await listen(panel.handle);
  try {
    const client = clientFor(server);
    await assert.rejects(client.setMode('AWAY'), (error) => {
      assert.ok(error instanceof VisonicApiError);
      assert.equal(error.message, 'not ready');
      return true;
    });
    assert.equal(panel.state, 'DISARM');
  } finally {
    await close(server);
  }
});

test('an expired session is renewed once and the command still completes', async () => {
  const panel = createPanel();
  panel.expireNextStatus = true;
  const server = await listen(panel.handle);
  try {
    const client = clientFor(server);
    const snapshot = await client.getSnapshot();
    assert.equal(snapshot.rawState, 'DISARM');
    assert.equal(panel.authCalls, 1);
    assert.equal(panel.loginCalls, 2);
  } finally {
    await close(server);
  }
});

function clientFor(server) {
  return new VisonicClient({
    host: `http://127.0.0.1:${server.address().port}`,
    email: 'owner@example.com',
    password: 'secret-password',
    panelSerial: 'ABC123',
    userCode: '1234',
    appId: '11111111-1111-1111-1111-111111111111',
    commandTimeoutMs: 1000,
    processPollMs: 10,
  });
}

function createPanel() {
  const panel = {
    state: 'DISARM',
    alarm: false,
    authCalls: 0,
    loginCalls: 0,
    commands: [],
    processStatus: 'succeeded',
    processError: null,
    expireNextStatus: false,
    handle(request, response) {
      const url = new URL(request.url, 'http://127.0.0.1');
      const chunks = [];
      request.on('data', (chunk) => chunks.push(chunk));
      request.on('end', () => {
        const bodyText = Buffer.concat(chunks).toString('utf8');
        const body = bodyText ? JSON.parse(bodyText) : {};
        const path = url.pathname;

        if (request.method === 'POST' && path.endsWith('/auth')) {
          panel.authCalls += 1;
          assert.equal(body.email, 'owner@example.com');
          assert.equal(body.password, 'secret-password');
          return send(response, 200, { user_token: `user-${panel.authCalls}` });
        }

        if (request.headers['user-token'] == null) {
          return send(response, 401, { error_message: 'User token required' });
        }

        if (request.method === 'POST' && path.endsWith('/panel/login')) {
          panel.loginCalls += 1;
          assert.equal(body.panel_serial, 'ABC123');
          assert.equal(body.user_code, '1234');
          return send(response, 200, { session_token: `session-${panel.loginCalls}` });
        }

        if (request.headers['session-token'] == null) {
          return send(response, 440, { error_message: 'Session token not found' });
        }

        if (request.method === 'GET' && path.endsWith('/status')) {
          if (panel.expireNextStatus) {
            panel.expireNextStatus = false;
            return send(response, 440, { error_message: 'Session token not found' });
          }
          return send(response, 200, {
            connected: true,
            partitions: [{ id: -1, state: panel.state, status: panel.state, ready: true }],
          });
        }

        if (request.method === 'GET' && path.endsWith('/alarms')) {
          return send(response, 200, { alarms: panel.alarm ? [{ id: 1 }] : [] });
        }

        if (request.method === 'POST' && path.endsWith('/set_state')) {
          panel.commands.push(body);
          if (panel.processStatus === 'succeeded') {
            panel.state = body.state;
          }
          return send(response, 200, { process_token: 'process-1' });
        }

        if (request.method === 'GET' && path.endsWith('/process_status')) {
          assert.equal(url.searchParams.get('process_tokens'), 'process-1');
          return send(response, 200, [{
            token: 'process-1',
            status: panel.processStatus,
            message: '',
            error: panel.processError,
          }]);
        }

        return send(response, 404, { error_message: `Unknown ${path}` });
      });
    },
  };
  return panel;
}

function send(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(payload));
}

function listen(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
