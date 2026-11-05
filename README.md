# Visonic Alarm for Homebridge

Homebridge plugin that exposes a Visonic PowerMaster panel as a HomeKit security system.

HomeKit **Home** arms Home, **Away** arms Away, and **Off** disarms. The plugin uses the PowerManage account that already works in the Visonic-Go app, so the panel needs its PowerLink connection and that account must be able to arm the system.

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
      "host": "visonic.tycomonitor.com",
      "email": "you@example.com",
      "password": "your-visonic-go-password",
      "panelSerial": "ABC123",
      "userCode": "1234",
      "restVersion": "9.0",
      "partition": -1,
      "nightArm": "home",
      "pollInterval": 30
    }
  ]
}
```

`userCode` is the panel master code. `panelSerial` is the panel id shown in Visonic-Go. `partition` of `-1` addresses the whole panel. HomeKit Night has no matching Visonic state, so `nightArm` chooses Home or Away.

Leave `appId` empty. The plugin stores a generated UUID in the Homebridge storage directory and reuses it. Changing it later makes PowerManage treat the bridge as a new client.

The plugin polls the panel so a keypad change shows up in Home. The interval cannot be shorter than 10 seconds.

## Development

```sh
npm install
npm test
```

`npm test` compiles TypeScript and runs the panel client against a local stand-in for PowerManage. It logs in, reads Disarmed, arms Home, and checks that a rejected command is reported.
