const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

const hap = require('hap-nodejs');
const { PlatformAccessory } = require('homebridge/lib/platformAccessory');

const plugin = require('../dist/index');
const { VisonicPlatform } = require('../dist/platform');

test('the plugin registers the Visonic platform', () => {
  let registered = null;
  plugin({
    registerPlatform(pluginName, platformName, constructor) {
      registered = { pluginName, platformName, constructor };
    },
  });
  assert.deepEqual(registered, {
    pluginName: 'homebridge-visonic-alarm',
    platformName: 'VisonicAlarm',
    constructor: VisonicPlatform,
  });
});

test('HomeKit Home arms the panel and Disarm returns it to disarmed', async () => {
  const panel = {
    state: 'DISARM',
    commands: [],
  };
  const server = await listen((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
      if (url.pathname.endsWith('/auth')) {
        return json(response, { user_token: 'user' });
      }
      if (url.pathname.endsWith('/panel/login')) {
        return json(response, { session_token: 'session' });
      }
      if (url.pathname.endsWith('/status')) {
        return json(response, {
          connected: true,
          partitions: [{ id: 1, state: panel.state }],
        });
      }
      if (url.pathname.endsWith('/alarms')) {
        return json(response, { alarms: [] });
      }
      if (url.pathname.endsWith('/set_state')) {
        panel.commands.push(body);
        panel.state = body.state;
        return json(response, { process_token: 'proc' });
      }
      if (url.pathname.endsWith('/process_status')) {
        return json(response, [{ status: 'succeeded', error: null }]);
      }
      response.writeHead(404);
      response.end();
    });
  });

  const registered = [];
  let launch = () => {};
  let shutdown = () => {};
  const api = {
    hap,
    platformAccessory: PlatformAccessory,
    registerPlatformAccessories(_pluginName, _platformName, list) {
      registered.push(...list);
    },
    user: {
      storagePath: () => '',
    },
    on(event, callback) {
      if (event === 'didFinishLaunching') {
        launch = callback;
      }
      if (event === 'shutdown') {
        shutdown = callback;
      }
    },
  };

  const platform = new VisonicPlatform({
    info() {},
    warn() {},
    error() {},
    debug() {},
  }, {
    name: 'House Alarm',
    host: `http://127.0.0.1:${server.address().port}`,
    email: 'owner@example.com',
    password: 'secret-password',
    panelSerial: 'ABC123',
    userCode: '1234',
    appId: '11111111-1111-1111-1111-111111111111',
    partition: 1,
    pollInterval: 60,
  }, api);

  try {
    launch();
    await platform.ready;
    assert.equal(registered.length, 1);

    const service = registered[0].getService(hap.Service.SecuritySystem);
    const current = service.getCharacteristic(hap.Characteristic.SecuritySystemCurrentState);
    const target = service.getCharacteristic(hap.Characteristic.SecuritySystemTargetState);
    assert.equal(current.value, hap.Characteristic.SecuritySystemCurrentState.DISARMED);

    assert.ok(target.props.validValues.includes(hap.Characteristic.SecuritySystemTargetState.NIGHT_ARM));

    await setCharacteristic(target, hap.Characteristic.SecuritySystemTargetState.STAY_ARM);
    assert.deepEqual(panel.commands[0], { partition: 1, state: 'HOME' });
    assert.equal(current.value, hap.Characteristic.SecuritySystemCurrentState.STAY_ARM);

    await setCharacteristic(target, hap.Characteristic.SecuritySystemTargetState.AWAY_ARM);
    assert.deepEqual(panel.commands[1], { partition: 1, state: 'AWAY' });
    assert.equal(current.value, hap.Characteristic.SecuritySystemCurrentState.AWAY_ARM);

    await setCharacteristic(target, hap.Characteristic.SecuritySystemTargetState.NIGHT_ARM);
    assert.deepEqual(panel.commands[2], { partition: 1, state: 'HOME' });

    await setCharacteristic(target, hap.Characteristic.SecuritySystemTargetState.DISARM);
    assert.deepEqual(panel.commands[3], { partition: 1, state: 'DISARM' });
    assert.equal(current.value, hap.Characteristic.SecuritySystemCurrentState.DISARMED);
  } finally {
    shutdown();
    await close(server);
  }
});

function setCharacteristic(characteristic, value) {
  return new Promise((resolve, reject) => {
    characteristic.setValue(value, (error) => (error ? reject(error) : resolve()));
  });
}

function json(response, payload) {
  response.writeHead(200, { 'Content-Type': 'application/json' });
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
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
