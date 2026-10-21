import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseGpx } from "../src/game/route/gpx";
import type { RoutePackage } from "../src/game/route/package";
import {
  removeDuplicateCoordinates,
  smoothElevations,
} from "../scripts/route-processing";

test("shared smoothing reproduces bundled Alpe and Paris profiles without mutating GPX samples", () => {
  for (const slug of ["alpe-d-huez", "paris"]) {
    const raw = parseGpx(readFileSync(`public/${slug}.gpx`, "utf8"))[0]
      .segments[0];
    const selected =
      slug === "paris"
        ? raw.slice(6897)
        : raw.slice(
            0,
            raw.reduce(
              (best, p, i) => (p.elevation > raw[best].elevation ? i : best),
              0,
            ) + 1,
          );
    const samples = removeDuplicateCoordinates(selected);
    const before = structuredClone(samples);
    const result = smoothElevations(samples);
    const bundled = JSON.parse(
      readFileSync(`public/routes/${slug}.json`, "utf8"),
    ) as RoutePackage;
    assert.equal(result.length, bundled.samples.length);
    result.forEach((p, i) => {
      assert.equal(p.latitude, bundled.samples[i].latitude);
      assert.equal(p.longitude, bundled.samples[i].longitude);
      assert.ok(Math.abs(p.elevation - bundled.samples[i].elevation) < 1e-9);
    });
    assert.deepEqual(samples, before);
  }
});
