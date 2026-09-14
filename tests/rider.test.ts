import { test } from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "three";
import {
  lowerLegLength,
  pedalPosition,
  solveKnee,
  upperLegLength,
} from "../src/game/world/rider";

test("pedal positions stay on a fixed crank radius", () => {
  const point = new Vector3();
  for (const angle of [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2]) {
    pedalPosition(angle, 1, point);
    assert.ok(
      Math.abs(Math.hypot(point.y - 0.3, point.z + 0.06) - 0.165) < 1e-9,
    );
  }
});

test("knee solver preserves both leg segment lengths", () => {
  const hip = new Vector3(0.115, 1.015, -0.24);
  const ankle = new Vector3(0.115, 0.345, -0.02);
  const knee = solveKnee(hip, ankle, new Vector3());
  assert.ok(Math.abs(knee.distanceTo(hip) - upperLegLength) < 1e-9);
  assert.ok(Math.abs(knee.distanceTo(ankle) - lowerLegLength) < 1e-9);
});
