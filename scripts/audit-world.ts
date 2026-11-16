import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as T from "three";
import { buildRoute } from "../src/game/route/package";
import { terrainSampler as measuredTerrain } from "../src/game/route/terrain";
import { createLandscape } from "../src/game/world/landscape";
import { buildScenery } from "../src/game/world/scenery";
import {
  roadSamples,
  roadOffset,
  roadStrip,
  roadPose,
} from "../src/game/world/road";
import {
  roadClearance,
  footprintTouchesWater,
  footprintInWater,
} from "../src/game/world/placement";
import type { WorldMaterials } from "../src/game/world/materials";

export interface WorldIssue {
  kind: string;
  x: number;
  z: number;
  distance?: number;
  value: number;
}

export function auditWorld(slug: string, measured = true) {
  const route = buildRoute(
    JSON.parse(readFileSync(`public/routes/${slug}.json`, "utf8")),
  );
  const original = JSON.stringify(route);
  const elevation = measured
    ? measuredTerrain(
        JSON.parse(readFileSync(`public/routes/${slug}.terrain.json`, "utf8")),
        route,
      )
    : undefined;
  const land = createLandscape(route, elevation);
  const material = new T.MeshStandardMaterial();
  const materials = Object.fromEntries(
    [
      "grass",
      "grassFar",
      "stone",
      "gravel",
      "water",
      "trunk",
      "pineFoliage",
      "broadleafFoliage",
      "rock",
      "facade",
      "roof",
      "dark",
    ].map((key) => [key, material]),
  ) as unknown as WorldMaterials;
  const root = new T.Group();
  const { groundAt, footprintGround, report, tiles } = buildScenery(
    root,
    route,
    land,
    materials,
  );
  const issues: WorldIssue[] = [];
  const clearance = roadClearance(route);
  const samples = roadSamples(route);
  const supports = [-1, 1].map((side) => {
    const mesh = root.children.find(
      (child) =>
        child.name ===
        (side === 1 ? "road-retaining-right" : "road-retaining-left"),
    ) as T.Mesh;
    return {
      positions: mesh.geometry.getAttribute("position"),
      used: new Set(Array.from(mesh.geometry.index!.array)),
    };
  });
  let maxCurveError = 0,
    maxRoadGroundGap = 0,
    minRoadGroundGap = Infinity;
  const road = roadStrip(route, -3.4, 3.4, 0.02);
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1],
      b = samples[i];
    for (const t of [0.25, 0.5, 0.75]) {
      const d = a.distance + (b.distance - a.distance) * t,
        p = roadPose(d, route);
      for (const lateral of [-6.5, 0, 6.5]) {
        const aa = roadOffset(a, lateral),
          bb = roadOffset(b, lateral),
          actual = roadOffset(p, lateral);
        const error = Math.hypot(
          actual.x - aa.x - (bb.x - aa.x) * t,
          actual.y - aa.y - (bb.y - aa.y) * t,
          actual.z - aa.z - (bb.z - aa.z) * t,
        );
        maxCurveError = Math.max(maxCurveError, error);
        if (error > 0.05)
          issues.push({
            kind: "road-chord",
            x: p.x,
            z: p.z,
            distance: d,
            value: error,
          });
      }
    }
  }
  let roadSegment = 1;
  for (let distance = 0; distance < route.distanceMeters; distance += 1) {
    const p = roadPose(distance, route);
    while (
      roadSegment < samples.length - 1 &&
      samples[roadSegment].distance < distance
    )
      roadSegment++;
    const supported = (side: number) => {
      const support = supports[side === 1 ? 1 : 0],
        a = (roadSegment - 1) * 2,
        b = roadSegment * 2;
      if (![a, a + 1, b, b + 1].every((i) => support.used.has(i))) return false;
      const t =
        (distance - samples[roadSegment - 1].distance) /
        (samples[roadSegment].distance - samples[roadSegment - 1].distance);
      const y =
        support.positions.getY(a) * (1 - t) + support.positions.getY(b) * t;
      const x =
        support.positions.getX(a) * (1 - t) + support.positions.getX(b) * t;
      const z =
        support.positions.getZ(a) * (1 - t) + support.positions.getZ(b) * t;
      const bottom =
        support.positions.getY(a + 1) * (1 - t) +
        support.positions.getY(b + 1) * t;
      return (
        Math.abs(y - (p.y - 0.035)) < 0.05 && bottom <= groundAt(x, z) + 0.2
      );
    };
    for (const lateral of [-3.4, -2.2, 0, 2.2, 3.4]) {
      const point = roadOffset(p, lateral),
        gap = p.y + 0.02 - groundAt(point.x, point.z);
      minRoadGroundGap = Math.min(minRoadGroundGap, gap);
      maxRoadGroundGap = Math.max(maxRoadGroundGap, gap);
      if (gap < 0.01)
        issues.push({ kind: "buried-road", ...point, distance, value: gap });
      if (
        gap > 8 &&
        !(lateral === 0
          ? supported(-1) || supported(1)
          : supported(Math.sign(lateral)))
      )
        issues.push({
          kind: "unsupported-road",
          ...point,
          distance,
          value: gap,
        });
    }
  }
  const positions = road.getAttribute("position"),
    indices = road.index!;
  for (let i = 0; i < indices.count; i += 3) {
    const a = indices.getX(i),
      b = indices.getX(i + 1),
      c = indices.getX(i + 2);
    const area =
      (positions.getZ(b) - positions.getZ(a)) *
        (positions.getX(c) - positions.getX(a)) -
      (positions.getX(b) - positions.getX(a)) *
        (positions.getZ(c) - positions.getZ(a));
    if (area <= 0)
      issues.push({
        kind: "road-face",
        x: positions.getX(a),
        z: positions.getZ(a),
        value: area,
      });
  }
  root.updateMatrixWorld(true);
  let instances = 0,
    buildings = 0,
    trunks = 0,
    maxFoundation = 0;
  const matrix = new T.Matrix4(),
    position = new T.Vector3(),
    quaternion = new T.Quaternion(),
    scale = new T.Vector3();
  root.traverse((object) => {
    if (!(object instanceof T.Mesh) || tiles.includes(object)) return;
    if (
      object.parent &&
      ["arc", "obelisk", "harbour"].includes(object.parent.name)
    ) {
      object.geometry.computeBoundingBox();
      const local = object.geometry
        .boundingBox!.clone()
        .applyMatrix4(object.matrix);
      const center = local
        .getCenter(new T.Vector3())
        .applyMatrix4(object.parent.matrixWorld);
      const size = local.getSize(new T.Vector3());
      const footprint = {
        x: center.x,
        z: center.z,
        width: size.x,
        depth: size.z,
        rotation: object.parent.rotation.y,
      };
      const minY = local.min.y + object.parent.position.y,
        maxY = local.max.y + object.parent.position.y;
      const deck = land.roadAt(center.x, center.z).y;
      if (minY < deck + 4.5 && clearance.footprint(footprint, 7) < 6.5)
        issues.push({
          kind: "landmark-on-road",
          x: center.x,
          z: center.z,
          value: minY - deck,
        });
      if (object.userData.waterSupported) {
        if (
          !footprintInWater(footprint, land) ||
          Math.abs(object.position.y + 2.5) > 0.001
        )
          issues.push({
            kind: "boat-placement",
            x: center.x,
            z: center.z,
            value: object.position.y,
          });
      } else if (
        object.userData.grounded ||
        object.name === "landmark-foundation"
      ) {
        const site = footprintGround(footprint);
        if (!site.covered || footprintTouchesWater(footprint, land))
          issues.push({
            kind: "landmark-site",
            x: center.x,
            z: center.z,
            value: 0,
          });
        if (
          object.userData.grounded &&
          (Math.abs(minY - site.max - 0.02) > 0.05 || minY - site.min > 2.01)
        )
          issues.push({
            kind: "landmark-base",
            x: center.x,
            z: center.z,
            value: minY - site.max,
          });
        if (
          object.name === "landmark-foundation" &&
          (minY > site.min - 0.1 || maxY < site.max)
        )
          issues.push({
            kind: "landmark-foundation",
            x: center.x,
            z: center.z,
            value: minY - site.min,
          });
      }
      return;
    }
    if (!(object instanceof T.InstancedMesh)) return;
    object.geometry.computeBoundingBox();
    const local = object.geometry.boundingBox!;
    for (let i = 0; i < object.count; i++) {
      instances++;
      object.getMatrixAt(i, matrix);
      matrix.premultiply(object.matrixWorld);
      matrix.decompose(position, quaternion, scale);
      const center = local.getCenter(new T.Vector3()).applyMatrix4(matrix);
      const orientation = new T.Euler().setFromQuaternion(quaternion, "YXZ");
      const alignedSize = local
        .clone()
        .applyMatrix4(
          new T.Matrix4().makeRotationY(-orientation.y).multiply(matrix),
        )
        .getSize(new T.Vector3());
      const footprint = {
        x: center.x,
        z: center.z,
        width: alignedSize.x,
        depth: alignedSize.z,
        rotation: orientation.y,
      };
      const box = local.clone().applyMatrix4(matrix);
      const lane = object.name.startsWith("guard-")
        ? 4.15
        : land.region === "alpine"
          ? 5.4
          : 6.5;
      const separation = clearance.footprint(footprint, lane + 1);
      if (separation < lane - 0.03)
        issues.push({
          kind: "prop-on-road",
          x: center.x,
          z: center.z,
          value: separation,
        });
      if (
        !object.name.startsWith("guard-") &&
        footprintTouchesWater(footprint, land)
      )
        issues.push({
          kind: "prop-in-water",
          x: center.x,
          z: center.z,
          value: 0,
        });
      if (object.name === "building") {
        buildings++;
        const site = footprintGround(footprint);
        if (!site.covered || Math.abs(box.min.y - site.max - 0.02) > 0.002)
          issues.push({
            kind: "building-base",
            x: center.x,
            z: center.z,
            value: box.min.y - site.max,
          });
        maxFoundation = Math.max(maxFoundation, box.min.y - site.min);
        if (box.min.y - site.min > 2.002)
          issues.push({
            kind: "tall-foundation",
            x: center.x,
            z: center.z,
            value: box.min.y - site.min,
          });
      }
      if (object.name === "foundation") {
        const site = footprintGround(footprint);
        if (box.min.y > site.min - 0.1 || box.max.y < site.max)
          issues.push({
            kind: "foundation-contact",
            x: center.x,
            z: center.z,
            value: box.min.y - site.min,
          });
      }
      if (object.name === "tree-trunk" || object.name === "guard-post") {
        if (object.name === "tree-trunk") trunks++;
        const gap = box.min.y - groundAt(center.x, center.z);
        if (gap > 0.02 || gap < -1)
          issues.push({
            kind: "prop-base",
            x: center.x,
            z: center.z,
            value: gap,
          });
      }
    }
  });
  const diagnostics = {
    slug,
    measured,
    samples: samples.length,
    instances,
    buildings,
    trunks,
    maxCurveError,
    minRoadGroundGap,
    maxRoadGroundGap,
    maxFoundation,
    landmarks: root.children
      .filter((c) => ["arc", "obelisk", "harbour"].includes(c.name))
      .map((c) => c.name),
    placement: report,
    routeUnchanged: JSON.stringify(route) === original,
    issues,
  };
  const geometries = new Set<T.BufferGeometry>();
  root.traverse((object) => {
    if (object instanceof T.Mesh) {
      geometries.add(object.geometry);
      if (object instanceof T.InstancedMesh) object.dispose();
    }
  });
  geometries.forEach((g) => g.dispose());
  road.dispose();
  material.dispose();
  return diagnostics;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync("test-results", { recursive: true });
  for (const slug of process.argv.slice(2).length
    ? process.argv.slice(2)
    : ["alpe-d-huez", "marseille", "paris"]) {
    const report = auditWorld(slug);
    writeFileSync(
      `test-results/${slug}-geometry.json`,
      JSON.stringify(report, null, 2),
    );
    const counts = Object.fromEntries(
      [...new Set(report.issues.map((issue) => issue.kind))].map((kind) => [
        kind,
        report.issues.filter((issue) => issue.kind === kind).length,
      ]),
    );
    console.log(JSON.stringify({ ...report, issues: counts }));
    if (report.issues.length) process.exitCode = 1;
  }
}
