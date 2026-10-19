import type { CyclingRoute, RoutePoint } from "../../types";

// Explicit synthetic fallback for exercising the runtime while curated data is reviewed.
export function terrainHeight(x: number, z: number) {
  return 12 + 9 * Math.sin(x / 150) * Math.cos(z / 190) + 4 * Math.sin(z / 105);
}
const points: RoutePoint[] = [];
let distance = 0,
  gain = 0;
for (let i = 0; i <= 1600; i++) {
  const a = (i / 1600) * Math.PI * 2;
  const x = Math.sin(a) * 270,
    z = Math.cos(a) * 225;
  const y = terrainHeight(x, z);
  const prev = points[i - 1];
  if (prev) {
    distance += Math.hypot(x - prev.x, y - prev.y, z - prev.z);
    gain += Math.max(0, y - prev.y);
  }
  points.push({
    x,
    y,
    z,
    distanceMeters: distance,
    elevationMeters: y,
    gradient: 0,
  });
}
for (let i = 0; i < points.length - 1; i++) {
  const a = points[i],
    b = points[i + 1];
  a.gradient = (b.y - a.y) / Math.hypot(b.x - a.x, b.z - a.z);
}
export const route: CyclingRoute = {
  id: "synthetic-demo",
  name: "Synthetic training loop",
  distanceMeters: distance,
  elevationGainMeters: gain,
  loop: true,
  points,
  metadata: {
    version: "demo-1",
    context: "Synthetic fixture, not a real course. One lap.",
    quality: "Synthetic — geographic accuracy not applicable",
    warnings: [
      "Curated Alpe d’Huez, Marseille and Paris packages await source and reference review.",
    ],
    attribution: "OpenRide procedural fixture",
  },
};

export function lookupRoute(distanceMeters: number, r: CyclingRoute = route) {
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
