import { build } from "esbuild";

await build({
  entryPoints: ["src/game/world/terrain.worker.ts"],
  outfile: "public/world/terrain-worker.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  legalComments: "eof",
});
