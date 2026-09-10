import { test } from "node:test";
import assert from "node:assert/strict";
import { stepPhysics, defaultPhysicsConfig } from "../src/game/physics/cycling";
import { route, lookupRoute } from "../src/game/route/route";
import { RideEngine } from "../src/game/loop/engine";
import { SimulatorSource } from "../src/bluetooth/sources/simulator-source";
import type { TrainerSource } from "../src/bluetooth/types";
const fake: TrainerSource = {
  id: "test",
  label: "Trainer",
  kind: "bluetooth-ftms",
  getState: () => "connected",
  connect: async () => {},
  disconnect: async () => {},
  subscribe: () => () => {},
};
test("physics responds to power, slope, mass and coasting", () => {
  assert.ok(stepPhysics(8, 0, 0, 1).speed < 8);
  assert.ok(stepPhysics(8, 300, 0, 1).speed > stepPhysics(8, 100, 0, 1).speed);
  assert.ok(
    stepPhysics(8, 200, 0.06, 1).speed < stepPhysics(8, 200, 0, 1).speed,
  );
  assert.ok(
    stepPhysics(8, 200, -0.06, 1).speed > stepPhysics(8, 200, 0, 1).speed,
  );
  assert.ok(
    stepPhysics(4, 200, 0.06, 1, { ...defaultPhysicsConfig, riderMassKg: 110 })
      .speed < stepPhysics(4, 200, 0.06, 1).speed,
  );
  assert.ok(Number.isFinite(stepPhysics(0, 0, 0, 1).speed));
  assert.equal(stepPhysics(0, 0, 0, 1).speed, 0);
});
test("route lookup is bounded, continuous and reaches the closed loop finish", () => {
  for (let d = 0; d < route.distanceMeters; d += 7) {
    const p = lookupRoute(d);
    assert.ok(Number.isFinite(p.x + p.y + p.z + p.gradient + p.heading));
    assert.ok(Math.abs(p.gradient) < 0.2);
    assert.equal(p.y, p.elevationMeters);
  }
  const a = lookupRoute(0),
    b = lookupRoute(route.distanceMeters);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 0.01);
  assert.equal(b.progress, 1);
  assert.equal(b.remainingDistanceMeters, 0);
  assert.equal(lookupRoute(-10).progress, 0);
  assert.equal(lookupRoute(Infinity).progress, 1);
});
test("fixed-step simulation is independent of frame frequency", () => {
  const a = new RideEngine(),
    b = new RideEngine(),
    sim = new SimulatorSource();
  for (const e of [a, b]) {
    e.attach(sim, 0);
    e.ingest(sim.sample(0));
  }
  for (let i = 0; i < 120; i++) a.advance(1 / 60, 1000);
  for (let i = 0; i < 60; i++) b.advance(1 / 30, 1000);
  assert.ok(Math.abs(a.state.distanceMeters - b.state.distanceMeters) < 1e-9);
  assert.ok(a.state.distanceMeters > 0);
});
test("pause stops elapsed time and distance; resume continues", () => {
  const e = new RideEngine();
  e.step(1, 200, 80);
  const before = { ...e.state };
  e.paused = true;
  e.step(1, 200, 80);
  assert.deepEqual(e.state, before);
  e.paused = false;
  e.step(1, 200, 80);
  assert.ok(e.state.distanceMeters > before.distanceMeters);
});
test("lap completion clamps distance, stops rider and produces a weighted summary", () => {
  const e = new RideEngine();
  for (let i = 0; i < 200000 && !e.completed; i++) e.step(1 / 60, 400, 90);
  assert.ok(e.completed);
  assert.equal(e.state.distanceMeters, route.distanceMeters);
  assert.equal(e.state.speedMetersPerSecond, 0);
  assert.ok(Math.abs(e.summary().averagePowerWatts - 400) < 1e-7);
  assert.equal(e.summary().maxPowerWatts, 400);
  assert.ok(e.summary().elevationGainMeters > 0);
  const before = { ...e.state };
  e.step(1, 900, 100);
  assert.deepEqual(e.state, before);
});
test("trainer power takes priority; stale power decays and pauses despite fresh cadence", () => {
  const e = new RideEngine();
  e.attach(fake, 0);
  e.ingest({ source: "ftms", timestampMs: 0, powerWatts: 250 });
  e.ingest({ source: "cycling-power", timestampMs: 0, powerWatts: 200 });
  assert.equal(e.input(100).power, 250);
  e.ingest({ source: "ftms", timestampMs: 5000, cadenceRpm: 90 });
  assert.ok(e.input(5000).power < 250);
  assert.match(e.warning, /stale/);
  e.input(11000);
  assert.ok(e.paused);
  assert.match(e.warning, /lost/);
});
test("fresh CPS power fills absent or stale FTMS power", () => {
  const e = new RideEngine();
  e.attach(fake, 0);
  e.ingest({ source: "ftms", timestampMs: 0, powerWatts: 250 });
  e.ingest({ source: "cycling-power", timestampMs: 4000, powerWatts: 190 });
  assert.equal(e.input(4100).power, 190);
  assert.equal(e.warning, "");
});
test("absent trainer power pauses after timeout; simulator fallback clears warning", () => {
  const e = new RideEngine();
  e.attach(fake, 0);
  e.input(11001);
  assert.ok(e.paused);
  const sim = new SimulatorSource();
  e.attach(sim, 11001);
  e.ingest(sim.sample(11001));
  e.paused = false;
  e.advance(0.1, 11002);
  assert.equal(e.warning, "");
  assert.equal(e.state.powerWatts, 150);
});
test("simulator controls clamp power and emit normalized samples", () => {
  const s = new SimulatorSource();
  s.increasePower();
  assert.equal(s.power, 175);
  s.decreasePower();
  assert.equal(s.power, 150);
  s.setPower(800);
  assert.equal(s.sample().powerWatts, 800);
  s.sprint();
  assert.equal(s.sample().powerWatts, 1100);
  assert.equal(s.sample(Date.now() + 2000).powerWatts, 800);
  s.setPower(-50);
  assert.equal(s.power, 0);
});

test("switching sources and disposing unsubscribe exactly once", () => {
  let subscriptions = 0;
  let removals = 0;
  const source: TrainerSource = {
    ...fake,
    subscribe: () => {
      subscriptions++;
      return () => {
        removals++;
      };
    },
  };
  const engine = new RideEngine();
  engine.attach(source, 0);
  engine.ingest({ source: "ftms", timestampMs: 0, powerWatts: 300 });
  engine.attach(source, 100);
  assert.equal(engine.input(100).power, 0);
  assert.equal(subscriptions, 2);
  assert.equal(removals, 1);
  engine.dispose();
  engine.dispose();
  assert.equal(removals, 2);
});

test("invalid telemetry does not replace or refresh the last valid power", () => {
  const engine = new RideEngine();
  engine.attach(fake, 0);
  engine.ingest({ source: "ftms", timestampMs: 0, powerWatts: 250 });
  for (const powerWatts of [NaN, Infinity, -Infinity]) {
    engine.ingest({ source: "ftms", timestampMs: 4000, powerWatts });
  }
  assert.ok(engine.input(4000).power < 250);
  assert.match(engine.warning, /stale/);
  engine.ingest({ source: "ftms", timestampMs: 4100, powerWatts: -20 });
  assert.equal(engine.input(4100).power, 0);
  assert.equal(engine.warning, "");
});

test("pause clears fractional frame time before resuming", () => {
  const engine = new RideEngine();
  const sim = new SimulatorSource();
  engine.attach(sim, 0);
  engine.ingest(sim.sample(0));
  engine.advance(1 / 120, 0);
  engine.setPaused(true);
  engine.setPaused(false);
  engine.advance(1 / 120, 0);
  assert.equal(engine.state.elapsedSeconds, 0);
  engine.advance(1 / 120, 0);
  assert.equal(engine.state.elapsedSeconds, 1 / 60);
});
