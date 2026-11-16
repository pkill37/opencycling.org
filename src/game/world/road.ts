import type { CyclingRoute } from "../../types";
import { lookupRoute } from "../route/route";
import { createTexturedGeometry } from "./geometry";

export const ROAD_HALF_WIDTH = 3.4;
export const ROAD_SHOULDER = 4.15;
const cache = new WeakMap<CyclingRoute, RoadSample[]>();
export type RoadSample = ReturnType<typeof lookupRoute> & { distance: number };

export function roadPose(distance: number, route: CyclingRoute) {
  const p = lookupRoute(distance, route);
  const before = lookupRoute(Math.max(0, distance - 0.15), route);
  const after = lookupRoute(
    Math.min(route.distanceMeters, distance + 0.15),
    route,
  );
  return {
    ...p,
    // Pitch follows the same smooth height curve as the mesh, rather than the
    // piecewise-linear GPX gradient used by physics.
    gradient:
      (after.y - before.y) /
      Math.max(0.001, Math.hypot(after.x - before.x, after.z - before.z)),
  };
}

export function roadOffset(
  p: Pick<RoadSample, "x" | "y" | "z" | "heading">,
  lateral: number,
) {
  return {
    x: p.x + Math.cos(p.heading) * lateral,
    y: p.y,
    z: p.z - Math.sin(p.heading) * lateral,
  };
}

export function roadSamples(route: CyclingRoute): RoadSample[] {
  const cached = cache.get(route);
  if (cached) return cached;
  const at = (distance: number): RoadSample => ({
    ...lookupRoute(distance, route),
    distance,
  });
  const distances = new Set([
    0,
    route.distanceMeters,
    ...route.points.map((p) => p.distanceMeters),
  ]);
  // Include dash boundaries so painted lines can follow every bend exactly.
  for (let d = 0; d < route.distanceMeters; d += 9) {
    distances.add(d);
    distances.add(Math.min(d + 2.7, route.distanceMeters));
  }
  for (let d = 0; d < route.distanceMeters; d += 4) distances.add(d);
  const seeds = [...distances].sort((a, b) => a - b).map(at);
  const samples: RoadSample[] = [seeds[0]];
  const subdivide = (a: RoadSample, b: RoadSample, depth: number) => {
    let error = 0;
    for (const t of [0.25, 0.5, 0.75]) {
      const p = at(a.distance + (b.distance - a.distance) * t);
      for (const lateral of [-6.5, 0, 6.5]) {
        const aa = roadOffset(a, lateral),
          bb = roadOffset(b, lateral),
          pp = roadOffset(p, lateral);
        error = Math.max(
          error,
          Math.hypot(
            pp.x - aa.x - (bb.x - aa.x) * t,
            pp.y - aa.y - (bb.y - aa.y) * t,
            pp.z - aa.z - (bb.z - aa.z) * t,
          ),
        );
      }
    }
    if (error > 0.025 && depth < 12 && b.distance - a.distance > 0.01) {
      const middle = at((a.distance + b.distance) / 2);
      subdivide(a, middle, depth + 1);
      subdivide(middle, b, depth + 1);
    } else samples.push(b);
  };
  for (let i = 1; i < seeds.length; i++) subdivide(seeds[i - 1], seeds[i], 0);
  cache.set(route, samples);
  return samples;
}

export function roadStrip(
  route: CyclingRoute,
  inner: number,
  outer: number,
  lift: number,
  height?: (x: number, z: number, p: RoadSample, lateral: number) => number,
  dashed = false,
) {
  const samples = roadSamples(route);
  const positions: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  for (const p of samples) {
    for (const lateral of [inner, (inner + outer) / 2, outer]) {
      const point = roadOffset(p, lateral);
      // Test winding at the same precision as the GPU vertex buffer. Closely
      // spaced source/dash samples can otherwise collapse after Float32 rounding.
      positions.push(
        Math.fround(point.x),
        Math.fround((height?.(point.x, point.z, p, lateral) ?? p.y) + lift),
        Math.fround(point.z),
      );
      uvs.push(lateral / 8, p.distance / 8);
    }
  }
  const triangle = (a: number, b: number, c: number) => {
    const ax = positions[b * 3] - positions[a * 3],
      az = positions[b * 3 + 2] - positions[a * 3 + 2];
    const bx = positions[c * 3] - positions[a * 3],
      bz = positions[c * 3 + 2] - positions[a * 3 + 2];
    const normal = az * bx - ax * bz;
    if (Math.abs(normal) < 1e-10) return;
    // The inside of a very tight hairpin may fold back. Keep every face upward
    // and split at the centerline, instead of twisting a full-width quad.
    indices.push(a, normal > 0 ? b : c, normal > 0 ? c : b);
  };
  for (let i = 1; i < samples.length; i++) {
    if (
      dashed &&
      ((samples[i - 1].distance + samples[i].distance) / 2) % 9 > 2.7
    )
      continue;
    for (let side = 0; side < 2; side++) {
      const a = (i - 1) * 3 + side,
        b = a + 1,
        c = i * 3 + side,
        d = c + 1;
      triangle(a, c, b);
      triangle(b, c, d);
    }
  }
  return createTexturedGeometry(positions, uvs, indices);
}
