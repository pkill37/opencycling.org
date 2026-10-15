import { test } from "node:test";
import assert from "node:assert/strict";
import { ZombiesMode } from "../src/game/modes/zombies";
import type { RiderState } from "../src/types";

const rider = (distanceMeters: number): RiderState => ({
  distanceMeters,
  speedMetersPerSecond: 0,
  accelerationMetersPerSecondSq: 0,
  powerWatts: 0,
  cadenceRpm: 0,
  elevationMeters: 0,
  gradient: 0,
  elapsedSeconds: 0,
});

test("zombies close the initial gap deterministically", () => {
  const mode = new ZombiesMode(100);
  assert.equal(Math.round(mode.snapshot.nearestGapMeters), 80);
  for (let i = 0; i < 4; i++) mode.advance(0.25, rider(100));
  assert.ok(mode.snapshot.nearestGapMeters < 80);
  assert.equal(mode.snapshot.score, 10);
});

test("zombies catch a stationary rider", () => {
  const mode = new ZombiesMode(0);
  for (let i = 0; i < 900 && !mode.snapshot.caught; i++) {
    mode.advance(1 / 10, rider(0));
  }
  assert.equal(mode.snapshot.caught, true);
  assert.equal(mode.snapshot.threat, "caught");
});

test("strong riding keeps the horde behind", () => {
  const mode = new ZombiesMode(0);
  let distance = 0;
  for (let i = 0; i < 20; i++) {
    distance += 12;
    mode.advance(1, rider(distance));
  }
  assert.equal(mode.snapshot.caught, false);
  assert.ok(mode.snapshot.nearestGapMeters > 80);
});
