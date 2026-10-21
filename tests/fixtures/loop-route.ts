import type { CyclingRoute, RoutePoint } from "../../src/types";

// Closed-loop fixture for deterministic engine tests.
function terrainHeight(x: number, z: number) {
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
      "Bundled GPX routes are unverified previews; geographic accuracy awaits independent review.",
    ],
    attribution: "OpenRide procedural fixture",
  },
};
