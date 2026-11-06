# Visonic Alarm for Homebridge

Homebridge plugin that exposes a Visonic PowerMaster panel as a HomeKit security system.

The only modes are **Home**, **Away**, and **Disarm**. HomeKit Off disarms the panel. The plugin signs in to the same ConnectAlarm server and account as the phone app.

## Install

On the machine that runs Homebridge:

```sh
sudo npm install -g homebridge-visonic-alarm
```

Until the package is published, install this repository instead:

```sh
sudo npm install -g github:mirimalulkasif/HB-Alarm
```

Restart Homebridge. In the Homebridge UI, add **Visonic Alarm** from the Plugins page, or add a platform block to `config.json`.

## Configuration

```json
{
  "platforms": [
    {
      "platform": "VisonicAlarm",
      "name": "Visonic Alarm",
      "profile": "connectalarm",
      "host": "connect.tycomonitor.com",
      "email": "you@example.com",
      "password": "your-connectalarm-password",
      "panelSerial": "ABC123",
      "userCode": "1234",
      "restVersion": "15.0",
      "partition": -1,
      "pollInterval": 30
    }
  ]
}
```

`host` is the server address from the ConnectAlarm welcome screen, normally `connect.tycomonitor.com`. `userCode` is the master user code. `panelSerial` is the Panel ID from ConnectAlarm, the integration identification number rather than the number printed on the panel. `partition` of `-1` addresses the whole panel.

A PowerMaster system that uses Visonic-Go instead of ConnectAlarm needs `"profile": "powermaster"` and `"host": "visonic.tycomonitor.com"`. It uses the same three modes.

Leave `appId` empty. The plugin stores a generated UUID in the Homebridge storage directory and reuses it. Changing it later makes PowerManage treat the bridge as a new client.

The plugin polls the panel so a keypad change shows up in Home. The interval cannot be shorter than 10 seconds.

## Development

```sh
npm install
npm test
```

`npm test` compiles TypeScript and runs the panel client against a local stand-in for PowerManage. It logs in, reads Disarmed, arms Home, and checks that a rejected command is reported.
