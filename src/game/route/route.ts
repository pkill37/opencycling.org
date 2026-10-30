import type { CyclingRoute } from "../../types";

const segmentCache = new WeakMap<
  CyclingRoute,
  Map<
    number,
    {
      ax: number;
      ay: number;
      az: number;
      bx: number;
      by: number;
      bz: number;
      heading: number;
      gradient: number;
    }
  >
>();
function segmentAt(r: CyclingRoute, i: number) {
  let cache = segmentCache.get(r);
  if (!cache) {
    cache = new Map();
    segmentCache.set(r, cache);
  }
  const a = r.points[i],
    b = r.points[i + 1];
  let value = cache.get(i);
  if (
    !value ||
    value.ax !== a.x ||
    value.ay !== a.y ||
    value.az !== a.z ||
    value.bx !== b.x ||
    value.by !== b.y ||
    value.bz !== b.z
  ) {
    value = {
      ax: a.x,
      ay: a.y,
      az: a.z,
      bx: b.x,
      by: b.y,
      bz: b.z,
      heading: Math.atan2(b.x - a.x, b.z - a.z),
      gradient: (b.y - a.y) / Math.hypot(b.x - a.x, b.z - a.z),
    };
    cache.set(i, value);
  }
  return value;
}
export function lookupRoute(distanceMeters: number, r: CyclingRoute) {
  const d = Math.max(0, Math.min(distanceMeters, r.distanceMeters));
  let lo = 0,
    hi = r.points.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (r.points[mid].distanceMeters <= d) lo = mid;
    else hi = mid;
  }
  const a = r.points[lo],
    b = r.points[hi];
  const segment = segmentAt(r, lo);
  const t = (d - a.distanceMeters) / (b.distanceMeters - a.distanceMeters);
  const mix = (a: number, b: number) => a + (b - a) * t;
  return {
    x: mix(a.x, b.x),
    y: mix(a.y, b.y),
    z: mix(a.z, b.z),
    elevationMeters: mix(a.elevationMeters, b.elevationMeters),
    // The rendered reference line is piecewise linear: use its exact slope.
    gradient: segment.gradient,
    curvature: Math.max(Math.abs(a.curvature ?? 0), Math.abs(b.curvature ?? 0)),
    heading: segment.heading,
    progress: d / r.distanceMeters,
    remainingDistanceMeters: r.distanceMeters - d,
    index: lo,
  };
}
