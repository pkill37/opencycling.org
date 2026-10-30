import type { CyclingRoute } from "../../types";

export interface TerrainPackage {
  version: 1;
  fingerprint: string;
  spacing: number;
  x: number;
  z: number;
  width: number;
  height: number;
  elevations: number[];
  attribution: string;
  source?: {
    tiles: string[];
    horizontalDatum: string;
    verticalDatum: string;
    acquired: string;
    gridSpacingMeters: number;
  };
}
export function terrainFingerprint(route: CyclingRoute) {
  let hash = 2166136261;
  for (const p of route.points) {
    const text = `${p.latitude},${p.longitude},${p.y};`;
    for (let i = 0; i < text.length; i++)
      hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  }
  return (hash >>> 0).toString(16);
}
export function terrainSampler(data: TerrainPackage, route: CyclingRoute) {
  if (
    data.version !== 1 ||
    data.fingerprint !== terrainFingerprint(route) ||
    !Number.isFinite(data.spacing) ||
    data.spacing <= 0 ||
    !Number.isFinite(data.x) ||
    !Number.isFinite(data.z) ||
    !Number.isInteger(data.width) ||
    !Number.isInteger(data.height) ||
    data.width < 2 ||
    data.height < 2 ||
    data.width * data.height > 2000000 ||
    data.elevations.length !== data.width * data.height ||
    !data.elevations.every(Number.isFinite)
  )
    throw new Error("Invalid terrain package");
  const sample = (x: number, z: number) => {
    const u = (x - data.x) / data.spacing,
      v = (z - data.z) / data.spacing;
    if (u < 0 || v < 0 || u > data.width - 1 || v > data.height - 1)
      return undefined;
    const i = Math.min(data.width - 2, Math.floor(u)),
      j = Math.min(data.height - 2, Math.floor(v));
    const a = u - i,
      b = v - j,
      n = j * data.width + i;
    return (
      (data.elevations[n] * (1 - a) + data.elevations[n + 1] * a) * (1 - b) +
      (data.elevations[n + data.width] * (1 - a) +
        data.elevations[n + data.width + 1] * a) *
        b
    );
  };
  return Object.assign(sample, { data });
}
export async function loadTerrain(route: CyclingRoute) {
  const slug = route.id === "alpe-d-huez-test" ? "alpe-d-huez" : route.id;
  if (!["alpe-d-huez", "paris", "marseille"].includes(slug)) return undefined;
  try {
    const response = await fetch(`/routes/${slug}.terrain.json`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return undefined;
    return terrainSampler(await response.json(), route);
  } catch {
    return undefined;
  }
}
export type ElevationSampler = ReturnType<typeof terrainSampler>;
