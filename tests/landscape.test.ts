import { terrainSampler as sampleElevation } from "../src/game/route/terrain";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as T from "three";
import { buildRoute, projectGeographic } from "../src/game/route/package";
import { lookupRoute } from "../src/game/route/route";
import { createLandscape, regionForRoute } from "../src/game/world/landscape";
import {
  addTerrain,
  addVerges,
  terrainSampler,
} from "../src/game/world/scenery";
import type { WorldMaterials } from "../src/game/world/materials";

function course(id: string) {
  return buildRoute(
    JSON.parse(readFileSync(`public/routes/${id}.json`, "utf8")),
  );
}

for (const [id, region] of [
  ["alpe-d-huez", "alpine"],
  ["marseille", "mediterranean"],
  ["paris", "paris"],
] as const) {
  test(`${id}: deterministic, geographically grounded scenery preserves the GPX`, () => {
    const route = course(id);
    const original = structuredClone(route);
    const land = createLandscape(route);
    assert.equal(land.region, region);
    assert.deepEqual(land.items, createLandscape(route).items);
    assert.deepEqual(route, original);
    assert.ok(land.items.length > 100);
    for (let d = 0; d <= route.distanceMeters; d += 3) {
      const p = lookupRoute(d, route);
      assert.equal(
        land.isWater(p.x, p.z),
        false,
        `water intersects road at ${d}m`,
      );
      assert.ok(land.heightAt(p.x, p.z) <= p.y - 0.1);
    }
    for (const item of land.items) {
      assert.equal(land.isWater(item.x, item.z), false);
      assert.ok(
        land.roadAt(item.x, item.z).distance >=
          (item.kind === "building"
            ? 16 * item.scale + 7
            : item.kind === "lamp"
              ? 5.5
              : 4 * item.scale + 7),
      );
      assert.ok(Number.isFinite(item.y));
    }
    const origin = {
      latitude: route.points[0].latitude!,
      longitude: route.points[0].longitude!,
      elevation: route.points[0].y,
    };
    for (const point of route.points) {
      assert.deepEqual(
        projectGeographic(origin, {
          latitude: point.latitude!,
          longitude: point.longitude!,
          elevation: point.y,
        }),
        { x: point.x, z: point.z },
      );
    }
    if (id === "marseille")
      assert.ok(route.points.every((p) => p.y === 0 && p.gradient === 0));
    if (id === "paris")
      assert.deepEqual(
        land.landmarks.map((l) => l.kind),
        ["arc", "obelisk"],
      );
    if (id === "alpe-d-huez") {
      assert.equal(land.water.length, 0);
      assert.ok(land.items.some((p) => p.kind === "pine"));
      assert.ok(land.items.some((p) => p.kind === "rock" && p.y > 1500));
    }
  });
}

test("imported route names do not choose a regional profile", () => {
  const route = course("paris");
  route.id = "imported";
  assert.equal(regionForRoute(route), "neutral");
  route.id = "paris";
  route.points[0].latitude = 0;
  assert.equal(regionForRoute(route), "neutral");
});

for (const id of ["alpe-d-huez", "marseille", "paris"])
  test(`${id}: terrain seams and prop heights match rendered road clearance`, () => {
    const route = course(id);
    const elevation = sampleElevation(
      JSON.parse(readFileSync(`public/routes/${id}.terrain.json`, "utf8")),
      route,
    );
    const root = new T.Group();
    const material = new T.MeshStandardMaterial();
    const tiles = addTerrain(root, route, createLandscape(route, elevation), {
      grass: material,
      stone: material,
    } as WorldMaterials);
    addVerges(root, route, createLandscape(route), {
      grass: material,
      stone: material,
      gravel: material,
    } as WorldMaterials);
    const vertices = new Map<string, number>();
    const normals = new Map<string, number[]>();
    for (const tile of tiles) {
      const p = tile.geometry.getAttribute("position");
      for (let i = 0; i < p.count; i++) {
        const key = `${p.getX(i)},${p.getZ(i)}`;
        if (vertices.has(key)) assert.equal(p.getY(i), vertices.get(key));
        vertices.set(key, p.getY(i));
        const n = tile.geometry.getAttribute("normal");
        const normal = [n.getX(i), n.getY(i), n.getZ(i)];
        if (normals.has(key)) assert.deepEqual(normal, normals.get(key));
        normals.set(key, normal);
      }
    }
    // Raycast the actual rendered triangles, not just the height function.
    root.updateMatrixWorld(true);
    const groundAt = terrainSampler(tiles, () => NaN);
    const ray = new T.Raycaster();
    for (let d = 0; d < route.distanceMeters; d += 15) {
      const p = lookupRoute(d, route);
      ray.set(new T.Vector3(p.x, p.y + 1000, p.z), new T.Vector3(0, -1, 0));
      const hits = ray.intersectObjects(root.children);
      assert.ok(hits.length, `missing terrain at ${d}m`);
      assert.ok(hits[0].point.y < p.y, `terrain covers road at ${d}m`);
      const terrainHits = ray.intersectObjects(tiles);
      assert.ok(
        Math.abs(groundAt(p.x, p.z) - terrainHits[0].point.y) < 1e-6,
        `ground sampler differs from triangles at ${d}m`,
      );
    }
    tiles.forEach((tile) => tile.geometry.dispose());
    root.children.forEach((child) => {
      if (child instanceof T.Mesh && !tiles.includes(child))
        child.geometry.dispose();
    });
    material.dispose();
  });
