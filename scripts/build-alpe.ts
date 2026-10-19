import { readFile, writeFile, mkdir } from "node:fs/promises";
import { parseGpx } from "../src/game/route/gpx";
import {
  buildRoute,
  horizontalDistance,
  type RoutePackage,
} from "../src/game/route/package";

async function main() {
  const [track] = parseGpx(await readFile("public/alpe-d-huez.gpx", "utf8"));
  const raw = track.segments[0];
  // This recording turns back immediately after its highest point in Alpe d'Huez.
  const finish = raw.reduce(
    (best, p, i) => (p.elevation > raw[best].elevation ? i : best),
    0,
  );
  const samples = raw
    .slice(0, finish + 1)
    .filter((p, i) => !i || horizontalDistance(raw[i - 1], p) >= 0.01);
  const distances = [0];
  for (let i = 1; i < samples.length; i++)
    distances.push(
      distances[i - 1] + horizontalDistance(samples[i - 1], samples[i]),
    );
  const total = distances.at(-1)!;
  function elevationAt(d: number) {
    let lo = 0,
      hi = samples.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (distances[mid] <= d) lo = mid;
      else hi = mid;
    }
    const t = (d - distances[lo]) / (distances[hi] - distances[lo]);
    return (
      samples[lo].elevation +
      t * (samples[hi].elevation - samples[lo].elevation)
    );
  }
  const pkg: RoutePackage = {
    schemaVersion: 1,
    id: "alpe-d-huez-test",
    name: "Alpe d’Huez (test)",
    version: "1",
    context:
      "Bourg d’Oisans parking to Alpe d’Huez summit arrival, including the valley approach. Ascent only; one traversal.",
    loop: false,
    source: {
      provider: "User-supplied GPX (GPS Visualizer creator)",
      acquired: "2026-10-19",
      license: "Unknown",
      attribution:
        "public/alpe-d-huez.gpx — Cyclo - Alpe d'Huez, la montée mythique; Oisans waypoints",
      horizontalDatum: "WGS84",
      verticalDatum: "Unknown",
      resolutionMeters: null,
    },
    processing: {
      version: "1",
      maxGapMeters: 500,
      elevationMethod: "as-supplied",
      corrections: [
        "Trimmed at the first maximum elevation (45.09497, 6.07068), before the return descent.",
        "Removed consecutive duplicate coordinates; retained all other horizontal coordinates.",
        "Smoothed source elevations using 21 equally spaced samples over a centered 100 m horizontal-distance window, narrowed symmetrically at endpoints to preserve start/finish elevations. No external elevation data.",
      ],
    },
    validation: {
      status: "unverified",
      warnings: [
        "Test fixture from supplied GPX; elevation smoothing is approximate and geographic accuracy has not been independently reviewed.",
      ],
    },
    samples: samples.map((p, i) => {
      const d = distances[i],
        radius = Math.min(50, d, total - d);
      let elevation = 0;
      for (let j = -10; j <= 10; j++)
        elevation += elevationAt(d + (radius * j) / 10) / 21;
      return { ...p, elevation };
    }),
  };
  const route = buildRoute(pkg);
  await mkdir("public/routes", { recursive: true });
  await writeFile(
    "public/routes/alpe-d-huez.json",
    JSON.stringify(pkg, null, 2) + "\n",
  );
  console.log(
    `${route.name}: ${(route.distanceMeters / 1000).toFixed(2)} km, +${route.elevationGainMeters.toFixed(0)} m, ${pkg.samples.length} samples`,
  );
}
void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
