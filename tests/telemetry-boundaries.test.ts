import assert from "node:assert/strict";
import test from "node:test";
import { parseCyclingPowerMeasurement } from "../src/bluetooth/parsers/parse-cycling-power-measurement";
import { parseIndoorBikeData } from "../src/bluetooth/parsers/parse-indoor-bike-data";

function packet(bytes: number[]) {
  return new DataView(Uint8Array.from(bytes).buffer);
}

test("every truncated prefix of fully populated FTMS and CPS packets is rejected", () => {
  const fixtures = [
    {
      parse: parseIndoorBikeData,
      bytes: [0xfe, 0x1f, ...Array<number>(28).fill(0)],
    },
    {
      parse: parseCyclingPowerMeasurement,
      bytes: [0xf5, 0x0f, ...Array<number>(32).fill(0)],
    },
  ];
  for (const { parse, bytes } of fixtures) {
    assert.doesNotThrow(() => parse(packet(bytes)));
    for (let length = 0; length < bytes.length; length++) {
      assert.throws(
        () => parse(packet(bytes.slice(0, length))),
        `packet with flags ${bytes[0]} must reject length ${length}`,
      );
    }
  }
});

test("CPS distinguishes initial, stopped, invalid and maximum plausible cadence", () => {
  const previous = { revolutions: 10, eventTime: 1024 };
  const cases = [
    { revolutions: 10, eventTime: 2048, cadence: 0 },
    { revolutions: 10, eventTime: 1024, cadence: 0 },
    { revolutions: 11, eventTime: 1024, cadence: undefined },
    { revolutions: 11, eventTime: 1025, cadence: undefined },
    { revolutions: 35, eventTime: 7168, cadence: 250 },
  ];
  for (const { revolutions, eventTime, cadence } of cases) {
    const data = packet([
      32,
      0,
      200,
      0,
      revolutions & 255,
      revolutions >> 8,
      eventTime & 255,
      eventTime >> 8,
    ]);
    const result = parseCyclingPowerMeasurement(data, 42, previous);
    assert.equal(result.sample.cadenceRpm, cadence);
    assert.deepEqual(result.crank, { revolutions, eventTime });
    assert.equal(result.sample.timestampMs, 42);
    assert.equal(
      parseCyclingPowerMeasurement(data).sample.cadenceRpm,
      undefined,
    );
  }
});

test("parsers honor DataView offsets without reading surrounding bytes", () => {
  const bytes = Uint8Array.from([255, 255, 65, 0, 250, 0, 255]);
  assert.equal(
    parseIndoorBikeData(new DataView(bytes.buffer, 2, 4)).powerWatts,
    250,
  );
  assert.throws(() => parseIndoorBikeData(new DataView(bytes.buffer, 2, 3)));
  for (const flags of [0x2000, 0x4000, 0x8000]) {
    const data = packet([flags & 255, flags >> 8, 0, 0]);
    assert.throws(() => parseIndoorBikeData(data), /Unsupported/);
    assert.throws(() => parseCyclingPowerMeasurement(data), /Unsupported/);
  }
});
