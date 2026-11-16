import { test } from "node:test";
import assert from "node:assert/strict";
import { stepPhysics, defaultPhysicsConfig } from "../src/game/physics/cycling";
import { lookupRoute } from "../src/game/route/route";
import { route } from "./fixtures/loop-route";
import { RideEngine } from "../src/game/loop/engine";
import { SimulatorSource } from "../src/bluetooth/sources/simulator-source";
import type {
  TrainerControlCapabilities,
  TrainerSource,
} from "../src/bluetooth/types";
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
    const p = lookupRoute(d, route);
    assert.ok(Number.isFinite(p.x + p.y + p.z + p.gradient + p.heading));
    assert.ok(Math.abs(p.gradient) < 0.2);
    assert.equal(p.y, p.elevationMeters);
  }
  const a = lookupRoute(0, route),
    b = lookupRoute(route.distanceMeters, route);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 0.01);
  assert.equal(b.progress, 1);
  assert.equal(b.remainingDistanceMeters, 0);
  assert.equal(lookupRoute(-10, route).progress, 0);
  assert.equal(lookupRoute(Infinity, route).progress, 1);
});
test("fixed-step simulation is independent of frame frequency", () => {
  const a = new RideEngine(route),
    b = new RideEngine(route),
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
  const e = new RideEngine(route);
  e.step(1, 200, 80);
  const before = { ...e.state };
  e.paused = true;
  e.step(1, 200, 80);
  assert.deepEqual(e.state, before);
  e.paused = false;
  e.step(1, 200, 80);
  assert.ok(e.state.distanceMeters > before.distanceMeters);
});
test("simulator time travel seeks route state and reopens the finish", () => {
  const e = new RideEngine(route);
  e.step(1, 200, 80);
  e.completed = true;
  e.seek(route.distanceMeters / 2);
  assert.equal(e.completed, false);
  assert.equal(e.state.distanceMeters, route.distanceMeters / 2);
  assert.equal(
    e.state.elevationMeters,
    lookupRoute(route.distanceMeters / 2, route).elevationMeters,
  );
  e.seek(route.distanceMeters + 100);
  assert.equal(e.completed, true);
  assert.equal(e.state.distanceMeters, route.distanceMeters);
  assert.equal(e.state.speedMetersPerSecond, 0);
});
test("lap completion clamps distance, stops rider and produces a weighted summary", () => {
  const e = new RideEngine(route);
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
  const e = new RideEngine(route);
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
  const e = new RideEngine(route);
  e.attach(fake, 0);
  e.ingest({ source: "ftms", timestampMs: 0, powerWatts: 250 });
  e.ingest({ source: "cycling-power", timestampMs: 4000, powerWatts: 190 });
  assert.equal(e.input(4100).power, 190);
  assert.equal(e.warning, "");
});
test("absent trainer power pauses after timeout; simulator fallback clears warning", () => {
  const e = new RideEngine(route);
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
  const engine = new RideEngine(route);
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
  const engine = new RideEngine(route);
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
  const engine = new RideEngine(route);
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

test("trainer freshness and loss thresholds preserve their exact boundaries", () => {
  const engine = new RideEngine(route);
  engine.attach(fake, 0);
  engine.ingest({ source: "ftms", timestampMs: 0, powerWatts: 280 });
  assert.equal(engine.input(3000).power, 280);
  assert.equal(engine.warning, "");
  assert.equal(engine.input(6500).power, 140);
  assert.match(engine.warning, /stale/);
  assert.equal(engine.input(10000).power, 0);
  assert.equal(engine.paused, false);
  assert.equal(engine.input(10001).power, 0);
  assert.equal(engine.paused, true);
  assert.match(engine.warning, /lost/);
});

test("simulation control rejection falls back to smoothed resistance control", async () => {
  const writes: number[] = [];
  const capabilities: TrainerControlCapabilities = {
    supported: true,
    supportsSimulationParameters: true,
    supportsResistanceLevel: true,
    resistanceRange: { min: 0, max: 20, step: 0.1 },
  };
  const source: TrainerSource & {
    controlCapabilities: TrainerControlCapabilities;
    requestControl: () => Promise<void>;
    setSimulationParameters: () => Promise<void>;
    setTargetResistance: (level: number) => Promise<void>;
  } = {
    ...fake,
    controlCapabilities: capabilities,
    requestControl: async () => {},
    setSimulationParameters: async () => {
      throw new Error("Trainer rejected simulation parameters.");
    },
    setTargetResistance: async (level) => {
      writes.push(level);
    },
  };
  const engine = new RideEngine(route);
  engine.attach(source, 0);
  engine.enableTrainerControl(true);
  const originalNow = Date.now;
  let now = 1000;
  Date.now = () => now;
  try {
    engine.step(1 / 60, 300, 80);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(writes.length, 1);
    assert.ok(writes[0] >= 0 && writes[0] <= 1);
    now += 300;
    engine.step(1 / 60, 300, 80);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(writes.length, 2);
    assert.ok(writes[1] - writes[0] <= 1);
  } finally {
    Date.now = originalNow;
  }
});

test("cadence falls back independently when FTMS cadence becomes stale", () => {
  const engine = new RideEngine(route);
  engine.attach(fake, 0);
  engine.ingest({ source: "ftms", timestampMs: 0, cadenceRpm: 90 });
  engine.ingest({ source: "cycling-power", timestampMs: 3000, cadenceRpm: 75 });
  engine.ingest({ source: "ftms", timestampMs: 3000, powerWatts: 200 });
  assert.equal(engine.input(3000).cadence, 90);
  assert.equal(engine.input(3001).cadence, 75);
  engine.ingest({ source: "ftms", timestampMs: 6001, powerWatts: 200 });
  assert.equal(engine.input(6001).cadence, 78);
});

test("long frames are capped and negative frames cannot advance the ride", () => {
  const capped = new RideEngine(route);
  const delayed = new RideEngine(route);
  for (const engine of [capped, delayed]) {
    const simulator = new SimulatorSource();
    engine.attach(simulator, 0);
    engine.ingest(simulator.sample(0));
  }
  delayed.advance(-1, 0);
  assert.equal(delayed.state.elapsedSeconds, 0);
  delayed.advance(10, 0);
  capped.advance(0.25, 0);
  assert.deepEqual(delayed.state, capped.state);
  assert.ok(delayed.state.elapsedSeconds > 0);
  assert.ok(delayed.state.elapsedSeconds <= 0.25);
});

test("summary weights changing power by elapsed time and starts at zero", () => {
  const engine = new RideEngine(route);
  assert.equal(engine.summary().averagePowerWatts, 0);
  assert.equal(engine.summary().averageSpeedMetersPerSecond, 0);
  engine.step(1, 100, 70);
  engine.step(3, 300, 90);
  const summary = engine.summary();
  assert.equal(summary.elapsedSeconds, 4);
  assert.equal(summary.averagePowerWatts, 250);
  assert.equal(summary.maxPowerWatts, 300);
  assert.equal(summary.averageSpeedMetersPerSecond, summary.distanceMeters / 4);
});

function gearFixture(simulation = true) {
  const grades: number[] = [];
  const levels: number[] = [];
  const capabilities: TrainerControlCapabilities = {
    supported: true,
    supportsSimulationParameters: simulation,
    supportsResistanceLevel: true,
    resistanceRange: { min: 2, max: 22, step: 0.5 },
  };
  const source = {
    ...fake,
    controlCapabilities: capabilities,
    requestControl: async () => {},
    setSimulationParameters: async (parameters: { gradePercent: number }) => {
      grades.push(parameters.gradePercent);
    },
    setTargetResistance: async (level: number) => {
      levels.push(level);
    },
    releaseControl: async () => {},
  };
  const engine = new RideEngine(route);
  engine.attach(source, 0);
  engine.enableTrainerControl(true);
  return { engine, source, grades, levels };
}
const flushControl = () =>
  new Promise<void>((resolve) => setImmediate(resolve));

// The clock controls the hardware rate limit, independently of simulation time.
async function withControlClock(
  run: (tick: () => Promise<void>) => Promise<void>,
  engine: RideEngine,
) {
  const originalNow = Date.now;
  let now = 1000;
  Date.now = () => now;
  try {
    await run(async () => {
      now += 250;
      engine.seek(0);
      engine.state.speedMetersPerSecond = 0;
      engine.step(1 / 60, 300, 80);
      await flushControl();
    });
  } finally {
    Date.now = originalNow;
  }
}

test("gear steps offset transmitted grade, preserve physics and clamp at both limits", async () => {
  const { engine, grades } = gearFixture();
  await withControlClock(async (tick) => {
    await tick();
    const neutral = grades[0];
    const physics = new RideEngine(route);
    physics.step(1 / 60, 300, 80);
    assert.deepEqual(engine.state, physics.state);
    engine.shiftGear(1);
    await tick();
    assert.equal(grades[1], neutral + 1);
    physics.seek(0);
    physics.state.speedMetersPerSecond = 0;
    physics.step(1 / 60, 300, 80);
    assert.deepEqual(engine.state, physics.state);
    engine.shiftGear(-1);
    engine.shiftGear(-1);
    await tick();
    assert.equal(grades[2], neutral - 1);
    for (let i = 0; i < 30; i++) engine.shiftGear(-1);
    assert.equal(engine.selectedGear, 1);
    for (let i = 0; i < 30; i++) engine.shiftGear(1);
    assert.equal(engine.selectedGear, 21);
    await tick();
    assert.equal(grades[3], neutral + 10);
  }, engine);
  assert.equal(new RideEngine(route).selectedGear, 11);
});

test("resistance gears smooth toward bounded, quantized easier and harder targets", async () => {
  const { engine, levels } = gearFixture(false);
  await withControlClock(async (tick) => {
    for (let i = 0; i < 25; i++) await tick();
    const neutral = levels.at(-1)!;
    for (let i = 0; i < 10; i++) engine.shiftGear(1);
    for (let i = 0; i < 25; i++) await tick();
    const harder = levels.at(-1)!;
    assert.ok(Math.abs(harder - neutral - 4) <= 0.5);
    for (let i = 0; i < 20; i++) engine.shiftGear(-1);
    for (let i = 0; i < 25; i++) await tick();
    assert.ok(levels.at(-1)! < neutral);
    for (const [index, level] of levels.entries()) {
      assert.ok(level >= 2 && level <= 22);
      assert.equal((level - 2) % 0.5, 0);
      if (index) assert.ok(Math.abs(level - levels[index - 1]) <= 1);
    }
  }, engine);
});

test("busy control coalesces shifts and rate limits writes", async () => {
  const { engine, source, grades } = gearFixture();
  let complete!: () => void;
  source.setSimulationParameters = async ({ gradePercent }) => {
    grades.push(gradePercent);
    await new Promise<void>((resolve) => {
      complete = resolve;
    });
  };
  await withControlClock(async (tick) => {
    await tick();
    engine.shiftGear(1);
    engine.shiftGear(1);
    engine.shiftGear(1);
    await tick();
    assert.equal(grades.length, 1);
    complete();
    await flushControl();
    engine.step(1 / 60, 300, 80);
    await flushControl();
    assert.equal(grades.length, 2);
    assert.ok(Math.abs(grades[1] - grades[0] - 3) < 0.01);
    complete();
    await flushControl();
    engine.step(1 / 60, 300, 80);
    assert.equal(grades.length, 2);
  }, engine);
});

test("paused or disposed simulation rejection cannot trigger resistance fallback", async () => {
  for (const dispose of [false, true]) {
    const { engine, source, levels } = gearFixture();
    let reject!: (error: Error) => void;
    source.setSimulationParameters = async () =>
      new Promise<void>((_, fail) => {
        reject = fail;
      });
    engine.shiftGear(1);
    await withControlClock(async (tick) => {
      await tick();
      if (dispose) engine.dispose();
      else engine.setPaused(true);
      engine.shiftGear(1);
      assert.equal(engine.selectedGear, 12);
      reject(new Error("late rejection"));
      await flushControl();
      assert.equal(levels.length, 0);
      assert.equal(engine.trainerControlActive, false);
      assert.equal(engine.warning, "");
      engine.setPaused(false);
      engine.enableTrainerControl(true);
      assert.equal(engine.selectedGear, 12);
    }, engine);
  }
});

test("gear control disables without consent, on disconnect, permission loss and rejection", async () => {
  for (const failure of ["consent", "disconnect", "permission", "rejection"]) {
    const { engine, source } = gearFixture();
    if (failure === "consent") engine.enableTrainerControl(false);
    if (failure === "disconnect") source.getState = () => "disconnected";
    if (failure === "permission") source.controlCapabilities.supported = false;
    if (failure === "rejection") {
      source.controlCapabilities.supportsResistanceLevel = false;
      source.setSimulationParameters = async () => {
        throw new Error("Rejected");
      };
    }
    await withControlClock(async (tick) => {
      await tick();
    }, engine);
    assert.equal(engine.trainerControlActive, false);
    engine.shiftGear(1);
    assert.equal(engine.selectedGear, 11);
    if (failure !== "consent")
      assert.match(engine.warning, /Trainer control unavailable/);
  }
});

test("simulation rejection preserves the selected gear on resistance fallback", async () => {
  const { engine, source, levels } = gearFixture();
  let simulationAttempts = 0;
  source.setSimulationParameters = async () => {
    simulationAttempts++;
    throw new Error("Simulation unsupported");
  };
  for (let i = 0; i < 10; i++) engine.shiftGear(1);
  await withControlClock(async (tick) => {
    for (let i = 0; i < 25; i++) await tick();
    const harder = levels.at(-1)!;
    for (let i = 0; i < 10; i++) engine.shiftGear(-1);
    for (let i = 0; i < 25; i++) await tick();
    assert.ok(Math.abs(harder - levels.at(-1)! - 4) <= 0.5);
    assert.equal(simulationAttempts, 1);
    assert.equal(engine.trainerControlActive, true);
  }, engine);
});

test("trainer gears can be enabled after a read-only ride has started", async () => {
  const { engine, source } = gearFixture();
  engine.enableTrainerControl(false);
  let acknowledge!: () => void;
  source.requestControl = async () =>
    new Promise<void>((resolve) => {
      acknowledge = resolve;
    });
  const request = engine.requestTrainerControl();
  assert.equal(engine.trainerControlActive, false);
  engine.shiftGear(1);
  assert.equal(engine.selectedGear, 11);
  assert.equal(await engine.requestTrainerControl(), false);
  acknowledge();
  assert.equal(await request, true);
  engine.shiftGear(1);
  assert.equal(engine.selectedGear, 12);
  assert.equal(engine.trainerControlActive, true);
});

test("pending live control requests cannot enable gears after pause or disposal", async () => {
  for (const dispose of [false, true]) {
    const { engine, source } = gearFixture();
    engine.enableTrainerControl(false);
    let acknowledge!: () => void;
    let releases = 0;
    source.requestControl = async () =>
      new Promise<void>((resolve) => {
        acknowledge = resolve;
      });
    source.releaseControl = async () => {
      releases++;
    };
    const request = engine.requestTrainerControl();
    if (dispose) engine.dispose();
    else engine.setPaused(true);
    acknowledge();
    assert.equal(await request, false);
    assert.equal(engine.trainerControlActive, false);
    assert.equal(releases, 1);
  }
});

test("rejected live control acquisition stays read-only and can be retried", async () => {
  const { engine, source } = gearFixture();
  engine.enableTrainerControl(false);
  source.requestControl = async () => {
    throw new Error("Control not permitted");
  };
  await assert.rejects(engine.requestTrainerControl(), /Control not permitted/);
  assert.equal(engine.trainerControlActive, false);
  source.requestControl = async () => {};
  assert.equal(await engine.requestTrainerControl(), true);
});
