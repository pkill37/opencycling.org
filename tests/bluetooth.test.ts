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
const packet = (bytes: number[]) => new DataView(Uint8Array.from(bytes).buffer);
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
    characteristic.value = packet([0x41, 0, 0xfa, 0]);
    characteristic.dispatchEvent(new Event("characteristicvaluechanged"));
    assert.equal(watts, 250);
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
