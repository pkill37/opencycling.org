import { test } from "node:test";
import assert from "node:assert/strict";
import type { CyclingRoute } from "../src/types";
import { zombieRoutePose } from "../src/game/world/zombie-placement";
import { lookupRoute } from "../src/game/route/route";
import { route as loop } from "./fixtures/loop-route";

const open: CyclingRoute = {
  id: "straight",
  name: "Straight road",
  loop: false,
  distanceMeters: 100,
  elevationGainMeters: 0,
  points: [0, 50, 100].map((distanceMeters) => ({
    x: 0,
    y: 10,
    z: distanceMeters,
    distanceMeters,
    elevationMeters: 10,
    gradient: 0,
  })),
};

test("zombies before an open start remain the full simulated distance behind", () => {
  const zombie = zombieRoutePose(-80, open);
  assert.equal(zombie.z, -80);
  assert.equal(zombie.x, 0);
  assert.equal(zombie.y, 10);
  assert.equal(zombie.heading, 0);
});

test("approach positions remain continuous when crossing the start line", () => {
  const before = zombieRoutePose(-0.001, open);
  const after = zombieRoutePose(0.001, open);
  assert.ok(
    Math.hypot(before.x - after.x, before.y - after.y, before.z - after.z) <
      0.003,
  );
  assert.deepEqual(zombieRoutePose(25, open), lookupRoute(25, open));
});

test("loop zombies wrap their simulated distance rather than crowding the rider", () => {
  assert.deepEqual(
    zombieRoutePose(-80, loop),
    lookupRoute(loop.distanceMeters - 80, loop),
  );
  assert.deepEqual(
    zombieRoutePose(loop.distanceMeters + 80, loop),
    lookupRoute(80, loop),
  );
});

test("an uphill approach preserves distance along the initial road tangent", () => {
  const uphill: CyclingRoute = {
    ...open,
    elevationGainMeters: 100,
    points: open.points.map((point) => ({
      ...point,
      y: 10 + point.z,
      elevationMeters: 10 + point.z,
      distanceMeters: point.z * Math.SQRT2,
      gradient: 1,
    })),
    distanceMeters: 100 * Math.SQRT2,
  };
  const zombie = zombieRoutePose(-80, uphill);
  assert.ok(
    Math.abs(Math.hypot(zombie.x, zombie.y - 10, zombie.z) - 80) < 1e-9,
  );
});
