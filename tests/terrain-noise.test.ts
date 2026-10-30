import { test } from "node:test";
import assert from "node:assert/strict";
import { terrainNoise, terrainRelief } from "../src/game/world/noise";

test("terrain relief stays bounded, repeatable and continuous across lattice boundaries", () => {
  for (let i = -100; i <= 100; i++) {
    for (const scale of [1, 29, 83, 220]) {
      const x = i * scale,
        z = (i + 0.37) * scale;
      const sample = terrainRelief(x, z);
      assert.ok(Math.abs(sample) <= 1);
      assert.equal(sample, terrainRelief(x, z));
      assert.ok(
        Math.abs(terrainRelief(x - 0.001, z) - terrainRelief(x + 0.001, z)) <
          0.001,
      );
      assert.ok(
        Math.abs(terrainNoise(i - 0.00001, z) - terrainNoise(i + 0.00001, z)) <
          0.00001,
      );
    }
  }
  assert.notEqual(terrainRelief(47, 92), terrainRelief(92, 47));
});
