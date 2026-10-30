import { readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { buildRoute } from "../src/game/route/package";
import {
  terrainFingerprint,
  type TerrainPackage,
} from "../src/game/route/terrain";
const tiles = new Map<string, Buffer>();
async function height(lat: number, lon: number) {
  const south = Math.floor(lat),
    west = Math.floor(lon);
  const key = `${south >= 0 ? "N" : "S"}${String(Math.abs(south)).padStart(2, "0")}${west >= 0 ? "E" : "W"}${String(Math.abs(west)).padStart(3, "0")}`;
  let data = tiles.get(key);
  if (!data) {
    const response = await fetch(
      `https://s3.amazonaws.com/elevation-tiles-prod/skadi/${key.slice(0, 3)}/${key}.hgt.gz`,
    );
    if (!response.ok) throw new Error(`Terrain download failed: ${key}`);
    data = gunzipSync(Buffer.from(await response.arrayBuffer()));
    tiles.set(key, data);
  }
  const size = Math.sqrt(data.length / 2);
  const row = Math.round((south + 1 - lat) * (size - 1)),
    col = Math.round((lon - west) * (size - 1));
  const value = data.readInt16BE((row * size + col) * 2);
  if (value === -32768) throw new Error(`Missing elevation: ${key}`);
  return value;
}
async function main() {
  for (const slug of ["alpe-d-huez", "paris", "marseille"]) {
    tiles.clear();
    const route = buildRoute(
      JSON.parse(await readFile(`public/routes/${slug}.json`, "utf8")),
    );
    const spacing = 32;
    const x =
      Math.floor((Math.min(...route.points.map((p) => p.x)) - 600) / spacing) *
      spacing;
    const z =
      Math.floor((Math.min(...route.points.map((p) => p.z)) - 600) / spacing) *
      spacing;
    const width =
      Math.ceil(
        (Math.max(...route.points.map((p) => p.x)) + 600 - x) / spacing,
      ) + 1;
    const rows =
      Math.ceil(
        (Math.max(...route.points.map((p) => p.z)) + 600 - z) / spacing,
      ) + 1;
    const origin = route.points[0],
      elevations: number[] = [];
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < width; i++) {
        const east = x + i * spacing,
          north = z + j * spacing,
          angle = Math.hypot(east, north) / 6371008.8;
        const bearing = Math.atan2(east, north),
          lat0 = (origin.latitude! * Math.PI) / 180,
          lon0 = (origin.longitude! * Math.PI) / 180;
        const lat = Math.asin(
          Math.sin(lat0) * Math.cos(angle) +
            Math.cos(lat0) * Math.sin(angle) * Math.cos(bearing),
        );
        const lon =
          lon0 +
          Math.atan2(
            Math.sin(bearing) * Math.sin(angle) * Math.cos(lat0),
            Math.cos(angle) - Math.sin(lat0) * Math.sin(lat),
          );
        elevations.push(
          await height((lat * 180) / Math.PI, (lon * 180) / Math.PI),
        );
      }
    const data: TerrainPackage = {
      version: 1,
      fingerprint: terrainFingerprint(route),
      spacing,
      x,
      z,
      width,
      height: rows,
      elevations,
      source: {
        tiles: [...tiles.keys()].map(
          (key) =>
            `https://s3.amazonaws.com/elevation-tiles-prod/skadi/${key.slice(0, 3)}/${key}.hgt.gz`,
        ),
        horizontalDatum: "WGS84",
        verticalDatum: "EGM96",
        acquired: new Date().toISOString().slice(0, 10),
        gridSpacingMeters: spacing,
      },
      attribution: `Mapzen Terrain Tiles; SRTM courtesy of USGS; Copernicus EU-DEM. Acquired ${new Date().toISOString().slice(0, 10)}. WGS84/EGM96. Source: https://registry.opendata.aws/terrain-tiles/`,
    };
    await writeFile(
      `public/routes/${slug}.terrain.json`,
      JSON.stringify(data) + "\n",
    );
    console.log(`${slug}: ${elevations.length} samples`);
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
