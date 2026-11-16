import { test } from "node:test";
import assert from "node:assert/strict";
import { RaceCountdown } from "../src/game/modes/race-countdown";
import { LocalRace } from "../src/game/modes/local-race";
import { RideEngine } from "../src/game/loop/engine";
import { SimulatorSource } from "../src/bluetooth/sources/simulator-source";
import { route } from "./fixtures/loop-route";

test("countdown displays 1, 2, 3, START in order and then clears", () => {
  const countdown = new RaceCountdown();
  assert.equal(countdown.label, 1);
  for (const expected of [2, 3, "START"] as const) {
    for (let step = 0; step < 4; step++)
      assert.equal(countdown.advance(0.25), 0);
    assert.equal(countdown.label, expected);
  }
  assert.equal(countdown.started, true);
  assert.equal(countdown.advance(0.25), 0.25);
  assert.equal(countdown.label, "START");
  for (let step = 0; step < 3; step++) countdown.advance(0.25);
  assert.equal(countdown.label, null);
});

test("only the part of a frame after START advances the race", () => {
  const countdown = new RaceCountdown();
  for (let step = 0; step < 11; step++) countdown.advance(0.25);
  countdown.advance(0.15);
  const raceTime = countdown.advance(0.25);
  assert.ok(Math.abs(raceTime - 0.15) < 1e-9);
  assert.equal(countdown.label, "START");
});

test("player and every AI remain at zero until START and share the first race step", () => {
  const player = new RideEngine(route);
  const simulator = new SimulatorSource();
  player.attach(simulator, 0);
  player.ingest(simulator.sample(0));
  const race = new LocalRace(player);
  const countdown = new RaceCountdown();
  for (let step = 0; step < 12; step++) {
    const dt = countdown.advance(0.25);
    if (dt > 0) {
      player.advance(dt, 0);
      race.advance();
    }
    assert.equal(player.state.distanceMeters, 0);
    assert.equal(player.state.elapsedSeconds, 0);
    assert.ok(
      race.riders.every(
        (rider) =>
          rider.state.distanceMeters === 0 && rider.state.elapsedSeconds === 0,
      ),
    );
  }
  player.advance(countdown.advance(0.25), 0);
  race.advance();
  assert.ok(player.state.distanceMeters > 0);
  assert.ok(race.riders.every((rider) => rider.state.distanceMeters > 0));
  for (const rider of race.riders) {
    assert.equal(rider.state.elapsedSeconds, player.state.elapsedSeconds);
  }
});

test("inactive time and long frames cannot skip the readiness countdown", () => {
  const countdown = new RaceCountdown();
  for (let step = 0; step < 100; step++) countdown.advance(0);
  assert.equal(countdown.label, 1);
  assert.equal(countdown.advance(100), 0);
  assert.equal(countdown.label, 1);
  assert.equal(countdown.started, false);
});
