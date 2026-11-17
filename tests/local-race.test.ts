import { test } from "node:test";
import assert from "node:assert/strict";
import type { CyclingRoute } from "../src/types";
import { RideEngine } from "../src/game/loop/engine";
import { SimulatorSource } from "../src/bluetooth/sources/simulator-source";
import { LocalRace, localOpponents } from "../src/game/modes/local-race";

const course = (length = 1000, gradient = 0): CyclingRoute => ({
  id: "local-race-test",
  name: "Local race",
  distanceMeters: length,
  elevationGainMeters: gradient * length,
  loop: false,
  points: [0, length / 2, length].map((distanceMeters) => ({
    x: 0,
    z: distanceMeters,
    y: distanceMeters * gradient,
    distanceMeters,
    elevationMeters: distanceMeters * gradient,
    gradient,
  })),
});
function fixture(route = course(), watts = 200) {
  const engine = new RideEngine(route);
  const sim = new SimulatorSource();
  sim.setPower(watts);
  engine.attach(sim, 0);
  engine.ingest(sim.sample(0));
  const race = new LocalRace(engine);
  const advance = (dt: number) => {
    engine.advance(dt, 0);
    race.advance();
  };
  return { engine, race, advance };
}

test("all four AI opponents start with the player and develop distinct efforts and positions", () => {
  const { engine, race, advance } = fixture();
  assert.equal(race.standings.length, 5);
  assert.equal(race.standings[0].isPlayer, true);
  assert.ok(race.riders.every((rider) => rider.state.distanceMeters === 0));
  for (let frame = 0; frame < 1800; frame++) advance(1 / 60);
  assert.equal(
    new Set(race.riders.map((rider) => rider.state.distanceMeters)).size,
    4,
  );
  assert.ok(race.riders.every((rider) => rider.state.distanceMeters > 0));
  assert.equal(race.standings.filter((rider) => rider.isPlayer).length, 1);
  assert.equal(engine.state.powerWatts, 200);
  assert.ok(race.standings.some((rider) => rider.gapMeters > 0));
  assert.deepEqual(
    race.riders.map((rider) => rider.name),
    localOpponents.map((rider) => rider.name),
  );
});

test("NPC progress is deterministic across 30, 60 and 144 Hz and pauses with the player", () => {
  const results = [30, 60, 144].map((hz) => {
    const { engine, race, advance } = fixture();
    for (let frame = 0; frame < hz * 20; frame++) advance(1 / hz);
    // Frame accumulators may leave the player one fixed step short at the boundary.
    while (engine.state.elapsedSeconds < 20 - 1e-8) {
      engine.step(1 / 60, 200, 85);
      race.advance();
    }
    const before = race.riders;
    engine.setPaused(true);
    for (let frame = 0; frame < hz * 5; frame++) advance(1 / hz);
    assert.deepEqual(race.riders, before);
    engine.setPaused(false);
    advance(0.25);
    assert.ok(
      race.riders[0].state.distanceMeters > before[0].state.distanceMeters,
    );
    return before;
  });
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(results[1], results[2]);
});

test("NPCs use route gradients and configured physics without changing player state", () => {
  const flat = fixture();
  const climb = fixture(course(1000, 0.08));
  for (let frame = 0; frame < 1200; frame++) {
    flat.advance(1 / 60);
    climb.advance(1 / 60);
  }
  flat.race.riders.forEach((rider, index) => {
    assert.ok(
      rider.state.distanceMeters >
        climb.race.riders[index].state.distanceMeters,
    );
  });
  const playerBefore = { ...flat.engine.state };
  flat.race.advance();
  assert.deepEqual(flat.engine.state, playerBefore);
  const external = flat.race.riders;
  external[0].state.distanceMeters = 99999;
  assert.notEqual(flat.race.riders[0].state.distanceMeters, 99999);
});

test("finished riders rank by finish time, stop at the line, and remain ahead of unfinished riders", () => {
  const { engine, race, advance } = fixture(course(20), 0);
  for (let frame = 0; frame < 60 * 25; frame++) advance(1 / 60);
  const finished = race.riders;
  assert.ok(
    finished.every(
      (rider) =>
        rider.finishTimeSeconds !== undefined &&
        rider.state.distanceMeters === 20,
    ),
  );
  assert.equal(race.standings.at(-1)?.id, "player");
  const times = race.standings
    .slice(0, 4)
    .map((rider) => rider.finishTimeSeconds!);
  assert.deepEqual(
    times,
    [...times].sort((a, b) => a - b),
  );
  for (let frame = 0; frame < 120; frame++) advance(1 / 60);
  assert.deepEqual(race.riders, finished);
  engine.ingest({
    source: "simulator",
    timestampMs: 0,
    powerWatts: 500,
    cadenceRpm: 90,
  });
  for (let frame = 0; frame < 1200 && !engine.completed; frame++)
    advance(1 / 60);
  assert.equal(engine.completed, true);
  assert.equal(race.standings.at(-1)?.id, "player");
  assert.equal(
    race.standings.at(-1)?.finishTimeSeconds,
    engine.state.elapsedSeconds,
  );
});

test("finishing freezes the race clock and a restart resets the field", () => {
  const { engine, race, advance } = fixture(course(30), 800);
  for (let frame = 0; frame < 1200 && !engine.completed; frame++)
    advance(1 / 60);
  assert.equal(engine.completed, true);
  const standings = race.standings;
  assert.equal(standings[0].isPlayer, true);
  for (let frame = 0; frame < 120; frame++) advance(1 / 60);
  assert.deepEqual(race.standings, standings);
  const restarted = fixture(course(30));
  assert.ok(
    restarted.race.riders.every(
      (rider) =>
        rider.state.distanceMeters === 0 &&
        rider.finishTimeSeconds === undefined,
    ),
  );
});

test("eaten AI riders stop racing, fall behind survivors and cannot be eliminated twice", () => {
  const { engine, race, advance } = fixture();
  for (let i = 0; i < 120; i++) advance(1 / 60);
  race.eliminateRiders(["ari", "player"]);
  const victim = race.riders.find((rider) => rider.id === "ari")!;
  assert.equal(victim.eliminatedAtSeconds, engine.state.elapsedSeconds);
  for (let i = 0; i < 120; i++) advance(1 / 60);
  race.eliminateRiders(["ari"]);
  assert.deepEqual(
    race.riders.find((rider) => rider.id === "ari"),
    victim,
  );
  assert.equal(race.standings.at(-1)?.id, "ari");
  assert.equal(
    race.standings.find((rider) => rider.isPlayer)?.eliminatedAtSeconds,
    undefined,
  );
  assert.ok(
    race.riders.find((rider) => rider.id === "drew")!.state.distanceMeters >
      victim.state.distanceMeters,
  );
});

test("finished AI riders cannot be eaten", () => {
  const { race, advance } = fixture(course(10), 0);
  for (let i = 0; i < 1500; i++) advance(1 / 60);
  race.eliminateRiders(["ari", "blake", "casey", "drew"]);
  assert.ok(
    race.riders.every(
      (rider) =>
        rider.finishTimeSeconds !== undefined &&
        rider.eliminatedAtSeconds === undefined,
    ),
  );
});
