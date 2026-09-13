import { test } from "node:test";
import assert from "node:assert/strict";
import { GamepadInput } from "../src/game/input/gamepad";

const pad = (pressed: number[] = [], axis = 0, index = 0) => ({
  id: "Test controller",
  index,
  connected: true,
  mapping: "standard" as const,
  axes: [0, axis],
  timestamp: 0,
  buttons: Array.from({ length: 17 }, (_, i) => ({
    pressed: pressed.includes(i),
    touched: false,
    value: pressed.includes(i) ? 1 : 0,
  })),
});

test("buttons fire once per press and power repeats at bounded intervals", () => {
  const input = new GamepadInput();
  input.read(pad(), 0);
  assert.deepEqual(input.read(pad([0, 2, 3, 9, 12]), 10), [
    "sprint",
    "camera",
    "hud",
    "pause",
    "increase",
  ]);
  assert.deepEqual(input.read(pad([0, 2, 3, 9, 12]), 100), []);
  assert.deepEqual(input.read(pad([0, 2, 3, 9, 12]), 410), ["increase"]);
  assert.deepEqual(input.read(pad([12]), 560), ["increase"]);
  assert.deepEqual(input.read(pad([12]), 9000), ["increase"]);
  input.read(pad(), 9010);
  assert.deepEqual(input.read(pad([9]), 9020), ["pause"]);
});

test("stick dead zone, opposite inputs, and direction changes", () => {
  const input = new GamepadInput();
  input.read(pad(), 0);
  assert.deepEqual(input.read(pad([], 0.2), 10), []);
  assert.deepEqual(input.read(pad([], -0.8), 20), ["increase"]);
  assert.deepEqual(input.read(pad([], 0.8), 30), ["decrease"]);
  assert.deepEqual(input.read(pad([12, 13]), 40), []);
});

test("connection, replacement, disconnect and focus reset require release", () => {
  const input = new GamepadInput();
  assert.deepEqual(input.read(pad([9]), 0), []);
  input.read(pad(), 10);
  assert.deepEqual(input.read(pad([9]), 20), ["pause"]);
  assert.deepEqual(input.read(pad([9], 0, 1), 30), []);
  input.read(pad([], 0, 1), 40);
  input.reset();
  assert.deepEqual(input.read(pad([0], 0, 1), 50), []);
  input.read(undefined, 60);
  assert.deepEqual(input.read(pad([12]), 70), []);
  input.read(pad(), 80);
  assert.deepEqual(input.read(pad([13]), 90), ["decrease"]);
});

test("unsupported mappings and disconnected pads never emit actions", () => {
  const input = new GamepadInput();
  input.read(pad(), 0);
  assert.deepEqual(input.read({ ...pad([9]), mapping: "" }, 10), []);
  assert.deepEqual(input.read({ ...pad([9]), connected: false }, 20), []);
});
