import type * as T from "three";
import type { CyclingRoute } from "../../types";
import type { Landscape, SceneryItem, Region } from "./landscape";
import { roadSamples } from "./road";

export interface Footprint {
  x: number;
  z: number;
  width: number;
  depth: number;
  rotation: number;
}
export interface GroundBounds {
  min: number;
  max: number;
  covered: boolean;
}
export type FootprintGround = (footprint: Footprint) => GroundBounds;
export interface FittedItem extends SceneryItem {
  foundationBottom?: number;
}

export function buildingSize(region: Region) {
  return {
    width: region === "paris" ? 23 : 16,
    depth: 14,
    height: region === "paris" ? 20 : region === "mediterranean" ? 12 : 8,
  };
}

export function footprintCorners(p: Footprint) {
  return [
    [-1, -1],
    [-1, 1],
    [1, 1],
    [1, -1],
  ].map(([x, z]) => ({
    x:
      p.x +
      ((x * p.width) / 2) * Math.cos(p.rotation) +
      ((z * p.depth) / 2) * Math.sin(p.rotation),
    z:
      p.z -
      ((x * p.width) / 2) * Math.sin(p.rotation) +
      ((z * p.depth) / 2) * Math.cos(p.rotation),
  }));
}

function localPoint(p: { x: number; z: number }, box: Footprint) {
  const x = p.x - box.x,
    z = p.z - box.z,
    c = Math.cos(box.rotation),
    s = Math.sin(box.rotation);
  return { x: x * c - z * s, z: x * s + z * c };
}

function segmentBoxDistance(
  a: { x: number; z: number },
  b: { x: number; z: number },
  width: number,
  depth: number,
) {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  let from = 0,
    to = 1;
  for (const [start, delta, half] of [
    [a.x, dx, width / 2],
    [a.z, dz, depth / 2],
  ]) {
    if (Math.abs(delta) < 1e-12) {
      if (Math.abs(start) > half) {
        from = 1;
        to = 0;
        break;
      }
      continue;
    }
    const t0 = (-half - start) / delta,
      t1 = (half - start) / delta;
    from = Math.max(from, Math.min(t0, t1));
    to = Math.min(to, Math.max(t0, t1));
  }
  if (from <= to) return 0;
  const endpoint = (p: { x: number; z: number }) =>
    Math.hypot(
      Math.max(0, Math.abs(p.x) - width / 2),
      Math.max(0, Math.abs(p.z) - depth / 2),
    );
  let distance = Math.min(endpoint(a), endpoint(b));
  for (const x of [-width / 2, width / 2])
    for (const z of [-depth / 2, depth / 2]) {
      const t = Math.max(
        0,
        Math.min(
          1,
          ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1),
        ),
      );
      distance = Math.min(
        distance,
        Math.hypot(x - a.x - t * dx, z - a.z - t * dz),
      );
    }
  return distance;
}

export function footprintTouchesWater(box: Footprint, land: Landscape) {
  if (footprintCorners(box).some((p) => land.isWater(p.x, p.z))) return true;
  return land.water.some((polygon) =>
    polygon.some(
      (a, i) =>
        segmentBoxDistance(
          localPoint(a, box),
          localPoint(polygon[(i + 1) % polygon.length], box),
          box.width,
          box.depth,
        ) === 0,
    ),
  );
}

export function footprintInWater(box: Footprint, land: Landscape) {
  if (!footprintCorners(box).every((p) => land.isWater(p.x, p.z))) return false;
  // All hull corners must be wet and no shoreline may cross the hull interior.
  return !land.water.some((polygon) =>
    polygon.some(
      (a, i) =>
        segmentBoxDistance(
          localPoint(a, box),
          localPoint(polygon[(i + 1) % polygon.length], box),
          box.width,
          box.depth,
        ) === 0,
    ),
  );
}

// Clip the final terrain triangles against the oriented footprint. Extrema at
// clipped vertices are exact; corner/center probes miss ridges under buildings.
export function terrainFootprints(tiles: T.Mesh[]): FootprintGround {
  const index = new Map(
    tiles.map((tile) => [
      `${Math.floor(tile.userData.centerX / 192)},${Math.floor(tile.userData.centerZ / 192)}`,
      tile,
    ]),
  );
  type Vertex = { x: number; y: number; z: number };
  return (footprint) => {
    const corners = footprintCorners(footprint);
    const minX = Math.floor(Math.min(...corners.map((p) => p.x)) / 4),
      maxX = Math.floor(Math.max(...corners.map((p) => p.x)) / 4);
    const minZ = Math.floor(Math.min(...corners.map((p) => p.z)) / 4),
      maxZ = Math.floor(Math.max(...corners.map((p) => p.z)) / 4);
    let min = Infinity,
      max = -Infinity,
      covered = true;
    const cos = Math.cos(footprint.rotation),
      sin = Math.sin(footprint.rotation);
    for (let gx = minX; gx <= maxX; gx++)
      for (let gz = minZ; gz <= maxZ; gz++) {
        const tx = Math.floor(gx / 48),
          tz = Math.floor(gz / 48);
        const tile = index.get(`${tx},${tz}`);
        const positions = tile?.geometry.getAttribute("position");
        const a = (gz - tz * 48) * 49 + gx - tx * 48;
        const ids = [a, a + 1, a + 49, a + 50];
        const vertices = ids.map((id, i) => {
          const x = gx * 4 + (i % 2) * 4 - footprint.x,
            z = gz * 4 + Math.floor(i / 2) * 4 - footprint.z;
          return {
            x: x * cos - z * sin,
            z: x * sin + z * cos,
            y: positions?.getY(id) ?? 0,
          };
        });
        for (const triangle of [
          [0, 2, 1],
          [1, 2, 3],
        ]) {
          let polygon = triangle.map((i) => vertices[i]);
          for (const [axis, bound, sign] of [
            ["x", footprint.width / 2, 1],
            ["x", -footprint.width / 2, -1],
            ["z", footprint.depth / 2, 1],
            ["z", -footprint.depth / 2, -1],
          ] as const) {
            const clipped: Vertex[] = [];
            for (let i = 0; i < polygon.length; i++) {
              const start = polygon[i],
                end = polygon[(i + 1) % polygon.length];
              const insideStart = (start[axis] - bound) * sign <= 1e-8,
                insideEnd = (end[axis] - bound) * sign <= 1e-8;
              if (insideStart) clipped.push(start);
              if (insideStart !== insideEnd) {
                const t = (bound - start[axis]) / (end[axis] - start[axis]);
                clipped.push({
                  x: start.x + (end.x - start.x) * t,
                  y: start.y + (end.y - start.y) * t,
                  z: start.z + (end.z - start.z) * t,
                });
              }
            }
            polygon = clipped;
          }
          if (polygon.length < 3) continue;
          if (!tile) {
            covered = false;
            continue;
          }
          for (const vertex of polygon) {
            min = Math.min(min, vertex.y);
            max = Math.max(max, vertex.y);
          }
        }
      }
    return {
      min,
      max,
      covered: covered && Number.isFinite(min) && Number.isFinite(max),
    };
  };
}

// Index the same centerline used to build the road, including all switchbacks.
export function roadClearance(route: CyclingRoute) {
  const samples = roadSamples(route);
  const cells = new Map<string, number[]>();
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1],
      b = samples[i];
    for (
      let x = Math.floor(Math.min(a.x, b.x) / 32);
      x <= Math.floor(Math.max(a.x, b.x) / 32);
      x++
    )
      for (
        let z = Math.floor(Math.min(a.z, b.z) / 32);
        z <= Math.floor(Math.max(a.z, b.z) / 32);
        z++
      ) {
        const key = `${x},${z}`,
          values = cells.get(key) ?? [];
        values.push(i);
        cells.set(key, values);
      }
  }
  const nearby = (x: number, z: number, radius: number) => {
    const candidates = new Set<number>();
    for (
      let cx = Math.floor((x - radius) / 32);
      cx <= Math.floor((x + radius) / 32);
      cx++
    )
      for (
        let cz = Math.floor((z - radius) / 32);
        cz <= Math.floor((z + radius) / 32);
        cz++
      )
        for (const i of cells.get(`${cx},${cz}`) ?? []) candidates.add(i);
    return candidates;
  };
  const distanceAt = (x: number, z: number, radius: number) => {
    let distance = Infinity;
    for (const i of nearby(x, z, radius)) {
      const a = samples[i - 1],
        b = samples[i],
        dx = b.x - a.x,
        dz = b.z - a.z;
      const t = Math.max(
        0,
        Math.min(
          1,
          ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1),
        ),
      );
      distance = Math.min(
        distance,
        Math.hypot(x - a.x - dx * t, z - a.z - dz * t),
      );
    }
    return distance;
  };
  return Object.assign(distanceAt, {
    footprint: (box: Footprint, margin: number) => {
      let distance = Infinity;
      for (const i of nearby(
        box.x,
        box.z,
        Math.hypot(box.width, box.depth) / 2 + margin,
      )) {
        const a = localPoint(samples[i - 1], box),
          b = localPoint(samples[i], box);
        distance = Math.min(
          distance,
          segmentBoxDistance(a, b, box.width, box.depth),
        );
      }
      return distance;
    },
  });
}

export function itemRadius(item: SceneryItem, region: Region) {
  return (
    item.scale *
    (item.kind === "building"
      ? Math.hypot(Math.max(buildingSize(region).width, 19.1), 14) / 2
      : item.kind === "lamp"
        ? 0.45
        : item.kind === "rock"
          ? 3.6
          : 4.9)
  );
}

export function fitScenery(
  land: Landscape,
  route: CyclingRoute,
  groundAt: (x: number, z: number) => number,
  bounds: FootprintGround,
) {
  const clearance = roadClearance(route);
  const shoulder =
    land.region === "paris" || land.region === "mediterranean" ? 6.5 : 5.4;
  const placed: FittedItem[] = [];
  const report = { relocated: 0, omitted: 0, foundations: 0 };
  const safe = (item: SceneryItem) => {
    const radius = itemRadius(item, land.region);
    const envelope = { ...item, width: radius * 2, depth: radius * 2 };
    if (item.kind === "building") {
      const size = buildingSize(land.region);
      envelope.width = Math.max(size.width, 19.1) * item.scale;
      envelope.depth = 14 * item.scale;
    }
    if (clearance.footprint(envelope, shoulder + 1) < shoulder + 0.02)
      return false;
    if (
      land.landmarks.some(
        (l) => Math.hypot(l.x - item.x, l.z - item.z) < 65 + radius,
      )
    )
      return false;
    if (
      placed.some(
        (other) =>
          Math.hypot(other.x - item.x, other.z - item.z) <
          radius + itemRadius(other, land.region) + 1,
      )
    )
      return false;
    // Also check the occupied envelope, not just the center, against water.
    return !footprintTouchesWater(envelope, land);
  };
  for (const original of [
    ...land.items.filter((i) => i.kind !== "building"),
    ...land.items.filter((i) => i.kind === "building"),
  ]) {
    let fitted: FittedItem | undefined;
    const offsets = original.kind === "building" ? 49 : 1;
    for (let attempt = 0; attempt < offsets && !fitted; attempt++) {
      const radius = attempt === 0 ? 0 : Math.ceil(attempt / 8) * 8;
      const angle = (((attempt - 1) % 8) * Math.PI) / 4;
      const item: FittedItem = {
        ...original,
        x: original.x + Math.cos(angle) * radius,
        z: original.z + Math.sin(angle) * radius,
      };
      if (!safe(item)) continue;
      if (item.kind === "building") {
        const size = buildingSize(land.region);
        const site = bounds({
          ...item,
          width: size.width * item.scale,
          depth: size.depth * item.scale,
        });
        if (!site.covered || site.max - site.min > 1.98) continue;
        item.y = site.max + 0.02;
        item.foundationBottom = site.min - 0.15;
      } else {
        const supportRadius =
          item.kind === "lamp"
            ? 0.16 * item.scale
            : item.kind === "rock"
              ? 1.2 * item.scale
              : 0.48 * item.scale;
        const site = bounds({
          ...item,
          width: supportRadius * 2,
          depth: supportRadius * 2,
        });
        if (
          !site.covered ||
          site.max - site.min > (item.kind === "rock" ? 2 : 0.8)
        )
          continue;
        item.y =
          item.kind === "rock"
            ? site.min
            : Math.min(groundAt(item.x, item.z), site.min) - 0.03;
      }
      fitted = item;
      if (attempt > 0) report.relocated++;
    }
    if (fitted) {
      placed.push(fitted);
      if (fitted.foundationBottom !== undefined) report.foundations++;
    } else report.omitted++;
  }
  return { items: placed, report };
}
