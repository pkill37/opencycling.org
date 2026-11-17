# Terrain assets

[Documentation index](../README.md)

Run `npx tsx scripts/build-terrain.ts` to rebuild the three bundled terrain sidecars, then `npx prettier --write public/routes/*.terrain.json`.
The builder downloads Mapzen Skadi HGT tiles from the public AWS terrain bucket and samples a 32 m local grid with a 600 m border. Source resolution varies; this is illustrative terrain, not surveyed road geometry. HGT elevations use WGS84/EGM96. Assets include acquisition date and attribution; route fingerprints prevent reuse against changed GPS geometry.

Terrain data loads only when starting a ride. Missing or invalid assets use procedural terrain. Imported GPX files remain procedural. Road elevations and physics are preserved, with terrain blended into the road corridor. Marseille's flat preview therefore deliberately flattens nearby terrain.

Source: https://registry.opendata.aws/terrain-tiles/
Attribution: Mapzen; SRTM courtesy of USGS; European terrain produced using Copernicus data and information funded by the European Union — EU-DEM layers.

Surface detail is generated in code with deterministic noise and analytic rock/soil shading; no new third-party image assets are required.

World generation runs in a short-lived Web Worker. Geometry buffers are transferred to the main thread, where Three.js attaches them to the scene. Leaving a loading ride terminates its worker; browsers that cannot start a worker use synchronous generation. `npm run dev`, `npm run dev:https`, and `npm run build` automatically bundle the worker with esbuild. The generated `public/world/terrain-worker.js` is ignored by Git.

Road segment math and shared terrain samples are cached within generation; seam corrections visit tile boundaries only. Terrain farther than 450 m uses a cheaper material without bump mapping or fine procedural rock detail, returning to full detail inside 350 m to avoid rapid switching at the boundary.
