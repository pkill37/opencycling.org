# Road and scenery validation

[Documentation index](../README.md)

Run `npm run world:audit` to inspect Alpe d’Huez, Marseille, and Paris without a browser. Pass a route slug to narrow the sweep, for example `npm run world:audit -- alpe-d-huez`.

The command writes a JSON report for each route to `test-results/<slug>-geometry.json` and exits unsuccessfully when it finds an issue. Reports include coordinates and route distances for failures, placement counts, retained landmarks, and geometry measurements. These are generated artifacts; rerun the command after browser tests, which clear `test-results/`.

The audit checks the actual generated terrain triangles and transformed scenery instances. It covers road winding, curve approximation, terrain clearance across the road width at one-metre intervals, retaining-wall support at separated switchbacks, building foundations, tree and guardrail bases, full object footprints against every nearby road passage, and shoreline placement. Landmark parts are checked separately; boats require a fully wet hull footprint. It also verifies that route data was not modified.

Road and shoulder strips share adaptive sampling, including painted-line boundaries. The maximum subdivision error is 2.5 cm, with a 5 cm audit limit. Building support uses exact terrain-triangle extrema clipped to the oriented footprint. Exposed foundations are limited to 2 m. Unsafe buildings try deterministic positions every 8 m within 48 m, then are omitted. Monument assemblies that cannot satisfy the same support and clearance checks are omitted as a whole, avoiding detached upper sections. Harbour houses are fitted independently and invalid boats are omitted.

Run `npm run check` for regression coverage. The placement tests include all three measured maps, procedural terrain fallback, interior terrain ridges, rotated road exclusions, scaled trunks, and rejected or relocated buildings.

Run `npm run test:e2e -- --grep 'inspect road and scenery'` for the visual sweep. It uses the simulator minimap to visit regular intervals and previously problematic locations, capturing chase, first-person, and oblique views. The pause dialog is hidden only in these inspection captures. Review screenshots for road-layer gaps, detached scenery, retaining walls, and rider alignment; automated geometry checks do not replace that review.
