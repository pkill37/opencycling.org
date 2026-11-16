import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ghostAtTime,
  ghostTimeAtDistance,
  type GhostRun,
} from "../src/lib/ghost";
import { RideEngine } from "../src/game/loop/engine";
import { route } from "./fixtures/loop-route";

function run(points: [number, number][]): GhostRun {
  return {
    routeId: route.id,
    elapsedSeconds: points.at(-1)![0],
    samples: points.map(([elapsedSeconds, distanceMeters]) => ({
      elapsedSeconds,
      distanceMeters,
      speedMetersPerSecond: 5,
      cadenceRpm: 80,
    })),
  };
}

test("ghost speed is continuous across unevenly spaced recordings", () => {
  const ghost = run([
    [0, 0],
    [1, 2],
    [4, 26],
    [5, 29],
  ]);
  for (const sample of ghost.samples) {
    assert.equal(
      ghostAtTime(ghost, sample.elapsedSeconds).distanceMeters,
      sample.distanceMeters,
    );
  }
  for (const time of [1, 4]) {
    const before = ghostAtTime(ghost, time - 1e-5);
    const after = ghostAtTime(ghost, time + 1e-5);
    assert.ok(
      Math.abs(before.speedMetersPerSecond - after.speedMetersPerSecond) <
        0.001,
    );
  }
  const time = 2;
  const epsilon = 1e-5;
  const velocity =
    (ghostAtTime(ghost, time + epsilon).distanceMeters -
      ghostAtTime(ghost, time - epsilon).distanceMeters) /
    (2 * epsilon);
  assert.ok(
    Math.abs(velocity - ghostAtTime(ghost, time).speedMetersPerSecond) < 1e-6,
  );
});

test("ghost interpolation stays monotonic, preserves stops and agrees with time gaps", () => {
  const ghost = run([
    [0, 0],
    [0.1, 0.01],
    [3, 20],
    [4, 20],
    [10, 21],
  ]);
  let previous = 0;
  for (let i = 0; i <= 1000; i++) {
    const time = i / 100;
    const sample = ghostAtTime(ghost, time);
    assert.ok(sample.distanceMeters >= previous - 1e-10);
    assert.ok(sample.distanceMeters >= 0 && sample.distanceMeters <= 21);
    assert.ok(sample.speedMetersPerSecond >= 0);
    if ((time > 0 && time < 3) || (time > 4 && time < 10)) {
      assert.ok(
        Math.abs(ghostTimeAtDistance(ghost, sample.distanceMeters) - time) <
          1e-6,
      );
    }
    previous = sample.distanceMeters;
  }
  assert.equal(ghostAtTime(ghost, 3.5).distanceMeters, 20);
  assert.equal(ghostAtTime(ghost, 3.5).speedMetersPerSecond, 0);
  assert.equal(ghostAtTime(ghost, -1).distanceMeters, 0);
  assert.equal(ghostAtTime(ghost, 100).distanceMeters, 21);
});

test("legacy duplicate start and finish samples produce finite playback", () => {
  const ghost = run([
    [0, 0],
    [0, 0],
    [2, 10],
    [2, 10],
  ]);
  for (let i = 0; i <= 200; i++) {
    const sample = ghostAtTime(ghost, i / 100);
    assert.ok(
      Number.isFinite(sample.distanceMeters + sample.speedMetersPerSecond),
    );
    assert.ok(sample.distanceMeters >= 0 && sample.distanceMeters <= 10);
  }
});

test("ghost playback advances on every frame at 144 Hz without changing physics", () => {
  const engine = new RideEngine(route);
  const ghost = run([
    [0, 0],
    [10, 50],
  ]);
  let previousDistance = 0;
  let repeatedPhysicsFrames = 0;
  for (let frame = 1; frame <= 144; frame++) {
    const previousTime = engine.state.elapsedSeconds;
    engine.advance(1 / 144, 0);
    if (previousTime === engine.state.elapsedSeconds) repeatedPhysicsFrames++;
    const sample = ghostAtTime(ghost, engine.renderElapsedSeconds);
    assert.ok(sample.distanceMeters > previousDistance);
    assert.ok(Math.abs(sample.distanceMeters - (frame / 144) * 5) < 1e-9);
    previousDistance = sample.distanceMeters;
  }
  assert.ok(repeatedPhysicsFrames > 0);
  assert.ok(engine.renderElapsedSeconds - engine.state.elapsedSeconds < 1 / 60);
});

test("ghost playback freezes on pause, resumes without reversing and clamps at completion", () => {
  const engine = new RideEngine(route);
  engine.advance(0.024, 0);
  const before = engine.renderElapsedSeconds;
  engine.setPaused(true);
  engine.advance(0.25, 0);
  assert.equal(engine.renderElapsedSeconds, before);
  engine.setPaused(false);
  for (let i = 0; i < 10; i++) {
    const previous = engine.renderElapsedSeconds;
    engine.advance(1 / 144, 0);
    assert.ok(engine.renderElapsedSeconds >= previous);
  }
  engine.seek(route.distanceMeters);
  assert.equal(engine.renderElapsedSeconds, engine.state.elapsedSeconds);
});
