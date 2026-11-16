import { test } from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { auditWorld } from "../scripts/audit-world";
import {
  terrainFootprints,
  fitScenery,
  roadClearance,
} from "../src/game/world/placement";
import { createLandscape } from "../src/game/world/landscape";
import { addProps } from "../src/game/world/scenery";
import type { WorldMaterials } from "../src/game/world/materials";
import { route as loop } from "./fixtures/loop-route";
import type { CyclingRoute } from "../src/types";

const straight: CyclingRoute = {
  ...loop,
  id: "straight",
  distanceMeters: 1000,
  points: [
    { ...loop.points[0], x: 0, y: 0, z: 0, distanceMeters: 0 },
    { ...loop.points[1], x: 0, y: 0, z: 1000, distanceMeters: 1000 },
  ],
  loop: false,
};

test("footprint support includes interior terrain peaks and detects missing tiles", () => {
  const positions: number[] = [];
  for (let z = 0; z < 49; z++)
    for (let x = 0; x < 49; x++)
      positions.push(x * 4, x === 1 && z === 1 ? 4 : 0, z * 4);
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  const tile = new T.Mesh(geometry);
  tile.userData.centerX = 96;
  tile.userData.centerZ = 96;
  const bounds = terrainFootprints([tile]);
  assert.deepEqual(bounds({ x: 6, z: 6, width: 10, depth: 10, rotation: 0 }), {
    min: 0,
    max: 4,
    covered: true,
  });
  assert.equal(
    bounds({ x: 0, z: 0, width: 10, depth: 10, rotation: 0.5 }).covered,
    false,
  );
  geometry.dispose();
});

test("steep building sites relocate within 48m or are omitted, with small foundations", () => {
  const land = createLandscape(straight);
  land.items = [
    { x: 30, y: 0, z: 100, scale: 1, rotation: 0, kind: "building" },
  ];
  const result = fitScenery(
    land,
    straight,
    () => 0,
    (p) => ({ covered: true, min: 0, max: Math.abs(p.x - 30) < 7 ? 4 : 0.5 }),
  );
  assert.equal(result.report.relocated, 1);
  assert.equal(result.items[0].x, 38);
  assert.equal(result.items[0].y, 0.52);
  assert.equal(result.items[0].foundationBottom, -0.15);
  const rejected = fitScenery(
    land,
    straight,
    () => 0,
    () => ({ covered: true, min: 0, max: 4 }),
  );
  assert.equal(rejected.items.length, 0);
  assert.equal(rejected.report.omitted, 1);
});

test("road exclusion checks rotated full footprints instead of object centers", () => {
  const clearance = roadClearance(straight);
  assert.equal(
    clearance.footprint({ x: 8, z: 100, width: 20, depth: 4, rotation: 0 }, 8),
    0,
  );
  assert.ok(
    clearance.footprint(
      { x: 8, z: 100, width: 20, depth: 4, rotation: Math.PI / 2 },
      8,
    ) > 5.99,
  );
  assert.equal(
    clearance.footprint({ x: 0, z: 100, width: 2, depth: 2, rotation: 0 }, 8),
    0,
  );
});

test("rendered trunks remain rooted at small and large scales", () => {
  const land = createLandscape(straight);
  land.items = [0.75, 1.45].map((scale, i) => ({
    x: 30 + i * 30,
    z: 100,
    y: 2,
    scale,
    rotation: 0.4,
    kind: "pine",
  }));
  const material = new T.MeshStandardMaterial();
  const root = new T.Group();
  addProps(root, land, {
    trunk: material,
    pineFoliage: material,
  } as WorldMaterials);
  const tree = root.children.find(
    (child) => child.name === "tree-trunk",
  ) as T.InstancedMesh;
  tree.geometry.computeBoundingBox();
  for (let i = 0; i < tree.count; i++) {
    const matrix = new T.Matrix4();
    tree.getMatrixAt(i, matrix);
    assert.ok(
      Math.abs(
        tree.geometry.boundingBox!.clone().applyMatrix4(matrix).min.y - 2,
      ) < 1e-6,
    );
  }
  const geometries = new Set<T.BufferGeometry>();
  root.traverse((o) => {
    if (o instanceof T.Mesh) {
      geometries.add(o.geometry);
      if (o instanceof T.InstancedMesh) o.dispose();
    }
  });
  geometries.forEach((g) => g.dispose());
  material.dispose();
});

for (const slug of ["alpe-d-huez", "marseille", "paris"]) {
  test(`${slug}: complete rendered scenery has grounded props, clear roads and smooth surfaces`, () => {
    const report = auditWorld(slug);
    assert.equal(report.routeUnchanged, true);
    assert.ok(report.buildings > 0);
    assert.ok(report.trunks > 0);
    assert.ok(report.maxCurveError < 0.05);
    assert.ok(report.maxFoundation <= 2.002);
    assert.deepEqual(
      report.issues,
      [],
      JSON.stringify(report.issues.slice(0, 10)),
    );
  });
}

test("procedural terrain fallback uses the same placement safeguards", () => {
  const report = auditWorld("marseille", false);
  assert.deepEqual(
    report.issues,
    [],
    JSON.stringify(report.issues.slice(0, 10)),
  );
  assert.ok(report.buildings > 0);
});
