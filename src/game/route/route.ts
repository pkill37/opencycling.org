import type { CyclingRoute } from "../../types";

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
  const t = (d - a.distanceMeters) / (b.distanceMeters - a.distanceMeters);
  const mix = (a: number, b: number) => a + (b - a) * t;
  return {
    x: mix(a.x, b.x),
    y: mix(a.y, b.y),
    z: mix(a.z, b.z),
    elevationMeters: mix(a.elevationMeters, b.elevationMeters),
    // The rendered reference line is piecewise linear: use its exact slope.
    gradient: (b.y - a.y) / Math.hypot(b.x - a.x, b.z - a.z),
    curvature: Math.max(Math.abs(a.curvature ?? 0), Math.abs(b.curvature ?? 0)),
    heading: Math.atan2(b.x - a.x, b.z - a.z),
    progress: d / r.distanceMeters,
    remainingDistanceMeters: r.distanceMeters - d,
    index: lo,
  };
}
