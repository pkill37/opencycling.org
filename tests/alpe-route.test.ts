import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildRoute } from "../src/game/route/package";
import { lookupRoute } from "../src/game/route/route";

test("Alpe test package follows the ascent and ends before the return descent", () => {
  const route = buildRoute(
    JSON.parse(readFileSync("public/routes/alpe-d-huez.json", "utf8")),
  );
  assert.equal(route.loop, false);
  assert.equal(route.points[0].latitude, 45.05435);
  assert.equal(route.points.at(-1)!.latitude, 45.09497);
  assert.equal(route.points.at(-1)!.longitude, 6.07068);
  assert.ok(route.distanceMeters > 15500 && route.distanceMeters < 16000);
  assert.ok(
    route.elevationGainMeters > 1100 && route.elevationGainMeters < 1200,
  );
  assert.ok(Math.abs(route.points[0].y - 719) < 0.001);
  assert.ok(Math.abs(route.points.at(-1)!.y - 1843.276) < 0.001);
  for (let d = 0; d <= route.distanceMeters; d += 10) {
    const point = lookupRoute(d, route);
    assert.ok(Number.isFinite(point.heading));
    assert.ok(Number.isFinite(point.gradient));
    assert.ok(Math.abs(point.gradient) < 0.5);
  }
});
