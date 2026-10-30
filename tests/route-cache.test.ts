import { test } from "node:test";
import assert from "node:assert/strict";
import { lookupRoute } from "../src/game/route/route";
import { route as fixture } from "./fixtures/loop-route";

test("cached segment math follows point changes and stays isolated between routes", () => {
  const route = structuredClone(fixture);
  const original = lookupRoute(0, route);
  route.points[1].y += 1;
  const changed = lookupRoute(0, route);
  assert.notEqual(changed.gradient, original.gradient);
  const a = route.points[0],
    b = route.points[1];
  assert.equal(
    changed.gradient,
    (b.y - a.y) / Math.hypot(b.x - a.x, b.z - a.z),
  );
  assert.equal(lookupRoute(0, fixture).gradient, original.gradient);
  assert.deepEqual(lookupRoute(0, route), changed);
});
