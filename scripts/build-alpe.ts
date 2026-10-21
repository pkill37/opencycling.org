import { readFile, writeFile, mkdir } from "node:fs/promises";
import { parseGpx } from "../src/game/route/gpx";
import { buildRoute, type RoutePackage } from "../src/game/route/package";

import {
  removeDuplicateCoordinates,
  smoothElevations,
} from "./route-processing";

async function main() {
  const [track] = parseGpx(await readFile("public/alpe-d-huez.gpx", "utf8"));
  const raw = track.segments[0];
  // This recording turns back immediately after its highest point in Alpe d'Huez.
  const finish = raw.reduce(
    (best, p, i) => (p.elevation > raw[best].elevation ? i : best),
    0,
  );
  const samples = removeDuplicateCoordinates(raw.slice(0, finish + 1));
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
    samples: smoothElevations(samples),
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
