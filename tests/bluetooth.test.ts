import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIndoorBikeData } from "../src/bluetooth/parsers/parse-indoor-bike-data";
import { parseCyclingPowerMeasurement } from "../src/bluetooth/parsers/parse-cycling-power-measurement";
import {
  bluetoothAvailability,
  bluetoothError,
} from "../src/bluetooth/availability";
import { BluetoothTrainerSource } from "../src/bluetooth/sources/bluetooth-trainer-source";
import * as U from "../src/bluetooth/constants";
import {
  encodeRequestControl,
  encodeSetSimulationParameters,
  encodeSetTargetResistance,
  parseControlResponse,
  parseTrainerControlCapabilities,
  parseResistanceRange,
  resistanceForGrade,
} from "../src/bluetooth/ftms-control";
import { defaultPhysicsConfig } from "../src/game/physics/cycling";
const packet = (bytes: number[]) => new DataView(Uint8Array.from(bytes).buffer);
test("FTMS control commands encode and parse acknowledged responses", () => {
  assert.deepEqual(Array.from(encodeRequestControl()), [0]);
  assert.deepEqual(
    Array.from(
      encodeSetSimulationParameters({
        windSpeedMetersPerSecond: -2,
        gradePercent: 7.5,
        rollingResistanceCoefficient: 0.004,
        windResistanceCoefficient: 0.39,
      }),
    ),
    [0x11, 0x30, 0xf8, 0xee, 0x02, 40, 39],
  );
  assert.deepEqual(Array.from(encodeSetTargetResistance(4.2)), [4, 42, 0]);
  assert.deepEqual(parseControlResponse(packet([0x80, 0x11, 1])), {
    request: 0x11,
    result: 1,
  });
  assert.equal(parseControlResponse(packet([0x80, 0x11, 2])).result, 2);
});
test("FTMS target-setting feature bits select the correct control paths", () => {
  const features = new Uint8Array(8);
  new DataView(features.buffer).setUint32(4, (1 << 2) | (1 << 13), true);
  assert.deepEqual(
    parseTrainerControlCapabilities(new DataView(features.buffer)),
    {
      supported: true,
      supportsSimulationParameters: true,
      supportsResistanceLevel: true,
    },
  );
  const oldBitNine = new Uint8Array(8);
  new DataView(oldBitNine.buffer).setUint32(4, 1 << 9, true);
  assert.equal(
    parseTrainerControlCapabilities(new DataView(oldBitNine.buffer)).supported,
    false,
  );
});
test("FTMS resistance ranges clamp calibrated grade output", () => {
  const range = parseResistanceRange(packet([0xf6, 0xff, 0xc8, 0x00, 1, 0]));
  assert.deepEqual(range, { min: -1, max: 20, step: 0.1 });
  const capabilities = {
    supported: true,
    supportsSimulationParameters: false,
    supportsResistanceLevel: true,
    resistanceRange: range,
  };
  const flat = resistanceForGrade(0, 0, defaultPhysicsConfig, capabilities);
  const climb = resistanceForGrade(0.1, 8, defaultPhysicsConfig, capabilities);
  assert.ok(flat >= range.min && flat <= range.max);
  assert.ok(climb > flat && climb <= range.max);
});
test("FTMS speed, cadence and signed power fixture", () => {
  const s = parseIndoorBikeData(
    packet([0x44, 0, 0x10, 0x0e, 0xb4, 0, 0xfa, 0]),
    42,
  );
  assert.equal(s.speedMetersPerSecond, 10);
  assert.equal(s.cadenceRpm, 90);
  assert.equal(s.powerWatts, 250);
  assert.equal(s.timestampMs, 42);
  assert.equal(
    parseIndoorBikeData(packet([0x41, 0, 0xec, 0xff])).powerWatts,
    -20,
  );
});
test("FTMS all optional fields preserve offsets", () => {
  const s = parseIndoorBikeData(
    packet([
      0xfe, 0x1f, 0x10, 0x0e, 0, 0, 0xb4, 0, 0, 0, 1, 2, 3, 0, 0, 0xfa, 0, 0, 0,
      0, 0, 0, 0, 0, 150, 0, 0, 0, 0, 0,
    ]),
  );
  assert.equal(s.powerWatts, 250);
  assert.equal(s.cadenceRpm, 90);
  assert.equal(s.heartRateBpm, 150);
});
test("FTMS more-data flag omits speed and absent metrics remain undefined", () => {
  const s = parseIndoorBikeData(packet([1, 0]));
  assert.equal(s.powerWatts, undefined);
  assert.equal(s.cadenceRpm, undefined);
  assert.equal(s.speedMetersPerSecond, undefined);
});
test("truncated and reserved-flag packets are rejected", () => {
  for (const bytes of [[], [0x44, 0, 1], [0, 0x80]])
    assert.throws(() => parseIndoorBikeData(packet(bytes)));
  assert.throws(() => parseCyclingPowerMeasurement(packet([0, 0, 1])));
});
test("CPS instantaneous power and crank rollover", () => {
  const result = parseCyclingPowerMeasurement(
    packet([0x20, 0, 0x2c, 1, 0, 0, 0, 2]),
    1,
    { revolutions: 65535, eventTime: 65024 },
  );
  assert.equal(result.sample.powerWatts, 300);
  assert.equal(result.sample.cadenceRpm, 60);
  assert.equal(
    parseCyclingPowerMeasurement(packet([0, 0, 0xff, 0xff])).sample.powerWatts,
    -1,
  );
});
test("CPS optional wheel, balance and torque fields are skipped", () => {
  const result = parseCyclingPowerMeasurement(
    packet([0x35, 0, 200, 0, 50, 0, 0, 0, 0, 0, 0, 0, 0, 10, 0, 0, 4]),
    1,
    { revolutions: 9, eventTime: 0 },
  );
  assert.equal(result.sample.powerWatts, 200);
  assert.equal(result.sample.cadenceRpm, 60);
});
test("availability and cancellation messages", () => {
  assert.equal(
    bluetoothAvailability({ isSecureContext: true, navigator: {} }).available,
    false,
  );
  assert.match(
    bluetoothAvailability({
      isSecureContext: true,
      navigator: { userAgent: "Mozilla/5.0 Firefox/140.0" },
    }).message,
    /Firefox does not implement Web Bluetooth/,
  );
  assert.match(
    bluetoothAvailability({
      isSecureContext: false,
      navigator: { bluetooth: {} },
    }).message,
    /HTTPS/,
  );
  assert.equal(
    bluetoothAvailability({
      isSecureContext: true,
      navigator: { bluetooth: {} },
    }).available,
    true,
  );
  assert.match(
    bluetoothError(new DOMException("cancelled", "NotFoundError")),
    /cancelled/,
  );
});
test("mock GATT discovery, notifications, disconnect and manual reconnect", async () => {
  class Characteristic extends EventTarget {
    uuid = U.INDOOR_BIKE_DATA;
    value?: DataView;
    async startNotifications() {
      return this;
    }
  }
  const characteristic = new Characteristic();
  const device = new EventTarget() as EventTarget & {
    name: string;
    gatt: unknown;
  };
  device.name = "Fixture Trainer";
  const gatt = {
    connect: async () => gatt,
    disconnect: () => {},
    getPrimaryService: async (uuid: string) => {
      if (uuid !== U.FTMS_SERVICE) throw new Error("No CPS");
      return {
        getCharacteristic: async (uuid: string) => {
          if (uuid === U.FITNESS_MACHINE_FEATURE)
            return { readValue: async () => packet([1, 0, 0, 0, 0, 0, 0, 0]) };
          return characteristic;
        },
      };
    },
  };
  device.gatt = gatt;
  const nav = Object.getOwnPropertyDescriptor(globalThis, "navigator"),
    win = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { bluetooth: { requestDevice: async () => device } },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { isSecureContext: true, navigator: globalThis.navigator },
  });
  try {
    const trainer = new BluetoothTrainerSource();
    let watts = 0;
    trainer.subscribe((s) => (watts = s.powerWatts ?? 0));
    await trainer.connect();
    assert.equal(trainer.state, "connected");
    assert.deepEqual(trainer.services, ["Fitness Machine (FTMS)"]);
    assert.ok(
      trainer.diagnostics.some((entry) =>
        entry.includes("GATT server connected"),
      ),
    );
    characteristic.value = packet([0x41, 0, 0xfa, 0]);
    characteristic.dispatchEvent(new Event("characteristicvaluechanged"));
    assert.equal(watts, 250);
    assert.ok(
      trainer.diagnostics.some((entry) =>
        entry.includes("First FTMS telemetry packet received"),
      ),
    );
    device.dispatchEvent(new Event("gattserverdisconnected"));
    assert.equal(trainer.state, "disconnected");
    assert.match(trainer.error, /disconnected/);
    await trainer.connect(false, false, true);
    assert.equal(trainer.state, "connected");
    await trainer.disconnect();
    assert.equal(trainer.state, "disconnected");
    characteristic.startNotifications = async () => {
      throw new Error("Notification subscription failed");
    };
    await trainer.connect(false, false, true);
    assert.equal(trainer.state, "error");
    assert.match(trainer.error, /Notification subscription failed/);
    navigator.bluetooth.requestDevice = async () => {
      throw new DOMException("Cancelled", "NotFoundError");
    };
    await trainer.connect();
    assert.equal(trainer.state, "error");
    assert.match(trainer.error, /cancelled/);
  } finally {
    if (nav) Object.defineProperty(globalThis, "navigator", nav);
    else Reflect.deleteProperty(globalThis, "navigator");
    if (win) Object.defineProperty(globalThis, "window", win);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("FTMS control writes use acknowledged control-point transactions", async () => {
  class Characteristic extends EventTarget {
    value?: DataView;
    writes: number[][] = [];
    constructor(public uuid: string) {
      super();
    }
    async startNotifications() {
      return this;
    }
    async writeValueWithResponse(value: ArrayBuffer) {
      const bytes = Array.from(new Uint8Array(value));
      this.writes.push(bytes);
      this.value = packet([0x80, bytes[0], 0x01]);
      this.dispatchEvent(new Event("characteristicvaluechanged"));
    }
  }
  const telemetry = new Characteristic(U.INDOOR_BIKE_DATA);
  const control = new Characteristic(U.FITNESS_MACHINE_CONTROL_POINT);
  const device = new EventTarget() as EventTarget & {
    name: string;
    gatt: unknown;
  };
  device.name = "Control Fixture";
  const gatt = {
    connect: async () => gatt,
    disconnect: () => {},
    getPrimaryService: async (uuid: string) => {
      if (uuid !== U.FTMS_SERVICE) throw new Error("No CPS");
      return {
        getCharacteristic: async (uuid: string) => {
          if (uuid === U.FITNESS_MACHINE_FEATURE) {
            return {
              readValue: async () => packet([0, 0, 0, 0, 4, 0x20, 0, 0]),
            };
          }
          if (uuid === U.FITNESS_MACHINE_CONTROL_POINT) return control;
          if (uuid === U.INDOOR_BIKE_DATA) return telemetry;
          throw new Error("Optional characteristic unavailable");
        },
      };
    },
  };
  device.gatt = gatt;
  const nav = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const win = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { bluetooth: { requestDevice: async () => device } },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { isSecureContext: true, navigator: globalThis.navigator },
  });
  try {
    const trainer = new BluetoothTrainerSource();
    await trainer.connect();
    assert.equal(trainer.controlCapabilities.supported, true);
    await trainer.requestControl();
    await trainer.setTargetResistance(4.2);
    assert.deepEqual(control.writes.slice(0, 2), [[0x00], [0x04, 42, 0]]);
    await trainer.disconnect();
  } finally {
    if (nav) Object.defineProperty(globalThis, "navigator", nav);
    else Reflect.deleteProperty(globalThis, "navigator");
    if (win) Object.defineProperty(globalThis, "window", win);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("trainer change subscribers can unsubscribe independently", async () => {
  const trainer = new BluetoothTrainerSource();
  let first = 0;
  let second = 0;
  const unsubscribe = trainer.subscribeChanges(() => first++);
  trainer.subscribeChanges(() => second++);
  await trainer.disconnect();
  unsubscribe();
  await trainer.disconnect();
  assert.equal(first, 1);
  assert.equal(second, 2);
});
