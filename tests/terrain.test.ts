import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildRoute } from "../src/game/route/package";
import {
  terrainSampler,
  terrainFingerprint,
  type TerrainPackage,
} from "../src/game/route/terrain";
import { createLandscape } from "../src/game/world/landscape";
for (const slug of ["alpe-d-huez", "paris", "marseille"]) {
  test(`${slug}: terrain matches route and preserves road heights`, () => {
    const route = buildRoute(
      JSON.parse(readFileSync(`public/routes/${slug}.json`, "utf8")),
    );
    const original = structuredClone(route);
    const data = JSON.parse(
      readFileSync(`public/routes/${slug}.terrain.json`, "utf8"),
    ) as TerrainPackage;
    const sample = terrainSampler(data, route);
    const land = createLandscape(route, sample);
    for (const p of route.points) {
      assert.ok(Number.isFinite(sample(p.x, p.z)));
      assert.ok(land.heightAt(p.x, p.z) < p.y);
    }
    assert.deepEqual(route, original);
    assert.equal(sample(data.x - 1, data.z), undefined);
    assert.throws(() =>
      terrainSampler({ ...data, fingerprint: "wrong" }, route),
    );
    const grid = {
      ...data,
      fingerprint: terrainFingerprint(route),
      width: 2,
      height: 2,
      x: 0,
      z: 0,
      spacing: 10,
      elevations: [0, 10, 20, 30],
    };
    assert.equal(terrainSampler(grid, route)(5, 5), 15);
    assert.equal(terrainSampler(grid, route)(10, 10), 30);
    assert.throws(() =>
      terrainSampler({ ...grid, elevations: [NaN, 0, 0, 0] }, route),
    );
  });
}
