import { CatmullRomCurve3, Vector3 } from "three";
import type { CyclingRoute, RoutePoint } from "../../types";
export function terrainHeight(x: number, z: number) {
  return 12 + 9 * Math.sin(x / 150) * Math.cos(z / 190) + 4 * Math.sin(z / 105);
}
const controls = Array.from({ length: 16 }, (_, i) => {
  const a = (i / 16) * Math.PI * 2,
    x = Math.sin(a) * (270 + 35 * Math.cos(a * 3)),
    z = Math.cos(a) * (225 + 25 * Math.sin(a * 2));
  return new Vector3(x, terrainHeight(x, z) + 0.18, z);
});
export const curve = new CatmullRomCurve3(controls, true, "centripetal");
curve.arcLengthDivisions = 4000;
const points: RoutePoint[] = [];
let distance = 0,
  gain = 0;
for (let i = 0; i <= 1600; i++) {
  const p = curve.getPointAt(i / 1600);
  if (i) {
    const prev = points[i - 1];
    distance += Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z);
    gain += Math.max(0, p.y - prev.y);
  }
  points.push({
    x: p.x,
    y: p.y,
    z: p.z,
    distanceMeters: distance,
    elevationMeters: p.y,
    gradient: 0,
  });
}
for (let i = 0; i < points.length; i++) {
  const a = points[Math.max(0, i - 1)],
    b = points[Math.min(points.length - 1, i + 1)];
  points[i].gradient =
    (b.y - a.y) / Math.max(0.001, Math.hypot(b.x - a.x, b.z - a.z));
}
export const route: CyclingRoute = {
  id: "cedar-valley",
  name: "Cedar Valley Loop",
  distanceMeters: distance,
  elevationGainMeters: gain,
  loop: true,
  points,
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
    b = r.points[hi],
    t =
      (d - a.distanceMeters) /
      Math.max(0.0001, b.distanceMeters - a.distanceMeters),
    mix = (a: number, b: number) => a + (b - a) * t;
  return {
    x: mix(a.x, b.x),
    y: mix(a.y, b.y),
    z: mix(a.z, b.z),
    elevationMeters: mix(a.elevationMeters, b.elevationMeters),
    gradient: mix(a.gradient, b.gradient),
    heading: Math.atan2(b.x - a.x, b.z - a.z),
    progress: d / r.distanceMeters,
    remainingDistanceMeters: r.distanceMeters - d,
  };
}
