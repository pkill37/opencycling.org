import { readFile, writeFile } from "node:fs/promises";
import { parseGpx, packageGpx } from "../src/game/route/gpx";
import { buildRoute } from "../src/game/route/package";

import {
  removeDuplicateCoordinates,
  smoothElevations,
} from "./route-processing";

async function main() {
  for (const city of ["marseille", "paris"] as const) {
    const track = parseGpx(await readFile(`public/${city}.gpx`, "utf8"))[0];
    // Paris: final circuit traversal starting at the earlier passage of the finish.
    const raw =
      city === "paris" ? track.segments[0].slice(6897) : track.segments[0];
    let samples = removeDuplicateCoordinates(raw);
    const corrections: string[] = [];
    if (city === "paris") {
      samples = smoothElevations(samples);
      corrections.push(
        "Selected source samples 6898 through end (one-based); removed consecutive duplicate coordinates. Smoothed supplied elevations over a centered 100 m window using 21 samples, narrowed at endpoints. No external elevation evidence.",
      );
    }
    const pkg = packageGpx(
      { ...track, segments: [samples] },
      0,
      {
        provider:
          city === "paris" ? "Cyclingstage.com" : "Marseille Tourism / Cirkwi",
        acquired: "2026-10-21",
        license: "Unknown; public download, reuse terms unconfirmed",
        attribution:
          city === "paris"
            ? "https://cdn.cyclingstage.com/images/tour-de-france/2023/stage-21-parcours.gpx"
            : "https://static.apidae-tourisme.com/filestore/objets-touristiques/plans/132/8/15599748/Balade+urbaine+le+long+de+la+Corniche+Kennedy.gpx",
        horizontalDatum: "WGS84",
        verticalDatum: "Unknown",
        resolutionMeters: null,
      },
      city === "marseille",
    );
    pkg.id = city;
    pkg.name =
      city === "paris"
        ? "Paris 2023 finale (preview)"
        : "Marseille Corniche (flat preview)";
    pkg.context =
      city === "paris"
        ? "Final circuit traversal extracted from the 2023 Tour stage GPX. Open endpoints retained; one traversal, no automatic lap closure. Alignment and elevation unverified."
        : "Catalans to Prado, in the tourism GPX direction. Walking itinerary; road alignment unverified. Missing elevations replaced with zero for a flat degraded preview.";
    pkg.processing.corrections.push(...corrections);
    const route = buildRoute(pkg);
    await writeFile(
      `public/routes/${city}.json`,
      JSON.stringify(pkg, null, 2) + "\n",
    );
    console.log(
      `${route.name}: ${route.distanceMeters.toFixed(0)} m, +${route.elevationGainMeters.toFixed(0)} m, ${samples.length} samples`,
    );
  }
}
void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
