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
function segmentForDistance(distanceMeters: number, r: CyclingRoute) {
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
  return {
    a,
    b,
    lo,
    hi,
    t: (d - a.distanceMeters) / (b.distanceMeters - a.distanceMeters),
  };
}
export function lookupRoute(distanceMeters: number, r: CyclingRoute) {
  const d = Math.max(0, Math.min(distanceMeters, r.distanceMeters));
  const { a, b, lo, hi, t } = segmentForDistance(d, r);
  const segment = segmentAt(r, lo);
  const mix = (a: number, b: number) => a + (b - a) * t;
  const before = r.points[Math.max(0, lo - 1)],
    after = r.points[Math.min(r.points.length - 1, hi + 1)];
  const curve = (p0: number, p1: number, p2: number, p3: number) => {
    const value =
      0.5 *
      (2 * p1 +
        (-p0 + p2) * t +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
        (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
    // GPS tracks can contain very tight corners. Keep the smoothing from
    // inventing a loop or crossing the original segment bounds.
    return Math.max(Math.min(p1, p2), Math.min(Math.max(p1, p2), value));
  };
  const smoothX = curve(before.x, a.x, b.x, after.x),
    smoothZ = curve(before.z, a.z, b.z, after.z),
    smoothY = mix(a.y, b.y);
  const lookDistance = Math.min(
    0.75,
    Math.max(0.1, (b.distanceMeters - a.distanceMeters) * 0.2),
  );
  const lookBefore = Math.max(0, d - lookDistance),
    lookAfter = Math.min(r.distanceMeters, d + lookDistance);
  const sample = (sampleDistance: number) => {
    const sampleLookup = lookupLinear(sampleDistance, r);
    return {
      x: sampleLookup.x,
      z: sampleLookup.z,
      y: sampleLookup.y,
    };
  };
  const previous = sample(lookBefore),
    next = sample(lookAfter),
    horizontal = Math.hypot(next.x - previous.x, next.z - previous.z);
  return {
    x: smoothX,
    y: smoothY,
    z: smoothZ,
    elevationMeters: smoothY,
    gradient:
      d === 0 || d === r.distanceMeters
        ? segment.gradient
        : (next.y - previous.y) / Math.max(horizontal, 0.01),
    curvature: Math.max(Math.abs(a.curvature ?? 0), Math.abs(b.curvature ?? 0)),
    heading:
      horizontal > 0.01
        ? Math.atan2(next.x - previous.x, next.z - previous.z)
        : segment.heading,
    progress: d / r.distanceMeters,
    remainingDistanceMeters: r.distanceMeters - d,
    index: lo,
  };
}

function lookupLinear(distanceMeters: number, r: CyclingRoute) {
  const { a, b, t } = segmentForDistance(distanceMeters, r);
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}
