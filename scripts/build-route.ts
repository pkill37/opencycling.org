import { readFile, writeFile } from "node:fs/promises";
import { parseGpx, packageGpx } from "../src/game/route/gpx";
import { buildRoute, type RoutePackage } from "../src/game/route/package";

async function main() {
  // Explicit segment selection prevents accidental joining of separate recordings.
  const [input, metadata, output, trackIndex, segmentIndex] =
    process.argv.slice(2);
  if (
    !input ||
    !metadata ||
    !output ||
    trackIndex === undefined ||
    segmentIndex === undefined
  ) {
    throw new Error(
      "Usage: npm run route:build -- input.gpx source.json output.json trackIndex segmentIndex (zero-based)",
    );
  }
  const source = JSON.parse(
    await readFile(metadata, "utf8"),
  ) as RoutePackage["source"];
  const tracks = parseGpx(await readFile(input, "utf8"));
  const track = tracks[Number(trackIndex)];
  if (!track)
    throw new Error(
      `Select a valid track: ${tracks.map((t, i) => `${i}: ${t.name}`).join(", ")}`,
    );
  const pkg = packageGpx(track, Number(segmentIndex), source);
  const route = buildRoute(pkg);
  await writeFile(output, JSON.stringify(pkg, null, 2) + "\n", { flag: "wx" });
  console.log(
    `${route.name}: ${route.distanceMeters.toFixed(1)} m, +${route.elevationGainMeters.toFixed(1)} m. UNVERIFIED. ${pkg.samples.length} samples.`,
  );
}
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
