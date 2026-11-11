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
  const segmentLength = Math.max(b.distanceMeters - a.distanceMeters, 0.001);
  const tangentAt = (index: number, coordinate: "x" | "y" | "z") => {
    const current = r.points[index];
    const previous = r.points[Math.max(0, index - 1)];
    const next = r.points[Math.min(r.points.length - 1, index + 1)];
    if (previous === current)
      return (
        ((next[coordinate] - current[coordinate]) /
          Math.max(next.distanceMeters - current.distanceMeters, 0.001)) *
        segmentLength
      );
    if (next === current)
      return (
        ((current[coordinate] - previous[coordinate]) /
          Math.max(current.distanceMeters - previous.distanceMeters, 0.001)) *
        segmentLength
      );
    return (
      ((next[coordinate] - previous[coordinate]) /
        Math.max(next.distanceMeters - previous.distanceMeters, 0.001)) *
      segmentLength
    );
  };
  const hermite = (
    start: number,
    end: number,
    startTangent: number,
    endTangent: number,
  ) => {
    const t2 = t * t,
      t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * start +
      (t3 - 2 * t2 + t) * startTangent +
      (-2 * t3 + 3 * t2) * end +
      (t3 - t2) * endTangent
    );
  };
  const tangentXAtStart = tangentAt(lo, "x"),
    tangentXAtEnd = tangentAt(hi, "x"),
    tangentZAtStart = tangentAt(lo, "z"),
    tangentZAtEnd = tangentAt(hi, "z"),
    tangentYAtStart = tangentAt(lo, "y"),
    tangentYAtEnd = tangentAt(hi, "y");
  const smoothX = hermite(a.x, b.x, tangentXAtStart, tangentXAtEnd),
    smoothZ = hermite(a.z, b.z, tangentZAtStart, tangentZAtEnd),
    smoothY = hermite(a.y, b.y, tangentYAtStart, tangentYAtEnd);
  const tangentHermite = (
    start: number,
    end: number,
    startTangent: number,
    endTangent: number,
  ) => {
    const t2 = t * t;
    return (
      (6 * t2 - 6 * t) * start +
      (3 * t2 - 4 * t + 1) * startTangent +
      (-6 * t2 + 6 * t) * end +
      (3 * t2 - 2 * t) * endTangent
    );
  };
  const tangentX = tangentHermite(a.x, b.x, tangentXAtStart, tangentXAtEnd),
    tangentZ = tangentHermite(a.z, b.z, tangentZAtStart, tangentZAtEnd),
    tangentLength = Math.hypot(tangentX, tangentZ);
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
      tangentLength > 0.01
        ? Math.atan2(tangentX, tangentZ)
        : horizontal > 0.01
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
