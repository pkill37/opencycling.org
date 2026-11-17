# Geographic route pipeline

[Documentation index](../README.md)

## Virtual gradient and optional trainer resistance

Route gradients always feed OpenCycling.org's deterministic virtual physics. An FTMS trainer may optionally receive route grade adjusted by the selected in-game gear after the rider explicitly enables control; simulation parameters are preferred and target resistance is used only when necessary. Hardware control is never required for route progression, and a rejected or disconnected command falls back to virtual resistance without stopping the ride.

## Delivery status

Candidate GPX/KML sources have now been located and inspected; see the
[route source inventory](sources.md) for direct downloads, measured file
properties, importer diagnostics and remaining data gaps.

Implemented: renderer-independent reference geometry, version-1 package validation,
local GPX builder, browser GPX/package selection and preview, exact road-profile
lookup, configurable longitudinal dynamics, anticipatory automatic braking, and a
minimal road renderer consuming the engine's selected course.

**The three bundled routes are unverified previews.** Independent reference
measurements are still needed before geographic accuracy can be confirmed.
Imported packages are also unverified;
the schema deliberately cannot assert curated validation. The package format does not establish geographic accuracy.

### Data feasibility queue (implementation order)

| Candidate                  | Required before publication                                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alpe d'Huez                | Choose start and summit finish; source full reference line, elevation evidence and rights; independently locate 21 hairpins; review road cuts/structures. |
| Marseille Corniche Kennedy | Choose endpoints and direction; compare with 2017 TT; label selected coastal segment rather than entire TT; review structures and rolling profile.        |
| Paris                      | Select historical edition and finishing-circuit layout; review intersections, surface assumptions and exact closed-lap seam.                              |

For each, record acquisition date, resolution (unknown stays null), CRS and vertical
datum, rights, corrections and processing version. Audit IGN/open elevation,
permitted GPX sources and OSM corridor coverage before selecting providers. Do not
mix vertical datums or derive road-deck elevation from terrain automatically.
Original data should be preserved only where redistribution rights allow it.

Set distance/alignment, elevation and multi-window gradient tolerances **after**
the audit. Publish independent references, measured errors, unresolved percentage
and reviewed exceptions. Neither a plausible length nor valid JSON passes accuracy
review. Current imports have 100% independently unverified geometry.

## Local builder

### Alpe d’Huez test ascent

Select **Alpe d’Huez (GPX test ascent)** in ride setup. The static package is
loaded on selection from `public/routes/alpe-d-huez.json`.
Regenerate it from `public/alpe-d-huez.gpx` with `npm run route:alpe`.
The 15.77 km route includes the Bourg d’Oisans approach and ends at the first
summit maximum (45.09497, 6.07068), before the recorded return descent.
Consecutive duplicates are removed and source elevations are averaged over a
100 m distance window (narrowed at endpoints); horizontal alignment is retained.
The resulting gain is approximately 1,137 m. Processing details and source
provenance are stored in the package. This is an unverified testing fixture.

### Generic GPX builder

```sh
npm run route:build -- input.gpx source.json route.json 0 0
```

Track and segment indices are zero-based and mandatory. Output is never overwritten.
Import the JSON in the setup screen; inspect the preview and select **Use reviewed
preview** before starting. Browser processing stays local and does not upload data.
GPX parsing is loaded on demand. JSON route assets may also be served by static
hosting; the runtime requires no geographic provider or server API.

Example `source.json` (replace unknowns only with evidenced values):

```json
{
  "provider": "Recording owner",
  "acquired": "2026-10-16",
  "license": "Unknown — local use only",
  "attribution": "Recording owner; redistribution not reviewed",
  "horizontalDatum": "WGS84",
  "verticalDatum": "Unknown",
  "resolutionMeters": null
}
```

`src/game/route/package.ts` defines the versioned format and runtime validation.
Direction is input order. Crossings and repeated visits are retained; only exact
consecutive duplicates are removed during GPX import. Separate segments are never
joined. Missing elevation fails by default. Browser users may explicitly request a
flat degraded preview: **the entire track** becomes flat, with a prominent warning.
Such a track is unsuitable for climb preparation. Non-finite/out-of-range points,
gaps over 500 m, grades over 50%, vertical-only segments and unsupported datums fail
with diagnostics, rather than being silently repaired. These are ingestion limits,
not accuracy guarantees; plausible but erroneous data still needs review.

The first sample defines an azimuthal-equidistant east/north metric frame, with a
100 km radius bound. Road distance is cumulative 3D segment length. Grade uses
horizontal segment length; reference samples define the road; runtime lookup uses smooth interpolation
for position and heading, shared by physics and rendering. Elevation gain sums positive supplied elevation differences, with no smoothing.
Curvature uses the circumcircle of adjacent reference samples; no snapping or racing
line optimization occurs. Raw GPS jitter may materially change curvature and gain.
Source-aware smoothing, adaptive reconstruction, independent alignment checks,
structures, terrain evidence and curated correction tools remain future work.

Packages can express a closed circuit only if the final coordinate and height
explicitly equal the first. The current session traverses one lap; repeated laps
and validated seam tangent/grade checks remain pending. The schema contains
reproducible ribbon inputs, not terrain meshes. Width 6.8 m and zero camber are
assumed. No fictional terrain is allowed to override the supplied road height.

## Illustrative scenery

Bundled routes now have deterministic regional scenery: wooded alpine slopes and
open rocky upper ground at Alpe d’Huez; Mediterranean water, pale shoreline,
seawalls and warm buildings at Marseille; tree-lined avenues, gardens, stone
facades, the Arc de Triomphe and the Concorde obelisk at Paris. The Seine and
Mediterranean use simplified geographic outlines projected into the same metric
frame as the GPX. Vallon des Auffes has a simplified fishing-port/arch cue.

These are recognizable illustrations, **not surveyed reconstructions**. Coastline
anchors, vegetation zones, building styles, landmarks and water heights are
renderer-only assumptions. The Marseille coastline includes a 25 m westward
visual clearance margin; its sea is at -2.5 m relative to the degraded flat road.
The Seine is drawn at an illustrative 26 m. Ground is fitted to nearby GPX road
segments, lowered beneath the road triangles, and joined by roadside verges.
Road coordinates, heights, gradients, curvature and physics remain unchanged.
Numbered alpine bend signs are deferred until their locations are verified.

Geographic context references:
[Alpe d’Huez's official climb description](https://www.alpedhuez.com/en/activities/summer-activities/bike/the-21-bends/),
[Marseille Tourism's Corniche description](https://www.marseille-tourisme.com/en/discover-marseille/culture-heritage/discover-the-sites-and-monuments-in-marseille/la-corniche-kennedy/),
and [Paris's Champs-Élysées map](https://cdn.paris.fr/paris/2024/07/03/plan-web-champs-elysees-240701-XlMi.pdf).
No external geographic imagery or building datasets are downloaded at runtime.

Scenery loads with the world after ride start. Existing local WebP textures are
reused; small facade/stone/roof patterns are drawn locally. Failed texture loads
retain solid-colour materials. Vegetation and repeated props use spatially
batched instances; terrain uses 192 m tiles with shared boundary heights. Terrain
allocation is capped at 900 tiles, general roadside prop sampling at about 1,800
stations, and Paris avenue trees at about 1,200 stations, with up to two candidates
per station. Large imports receive bounded previews, not complete terrain coverage
for the maximum supported import. Imported routes use neutral scenery unless
their package ID and starting geography match a bundled profile. Material and
texture ownership includes unused assets and late-loading textures on teardown.

## Dynamics baseline and limitations

- 75 kg rider, 9 kg bike, CdA 0.32 m², Crr 0.004, air density 1.225 kg/m³.
- Crank power, 97% drivetrain efficiency (wheel-power selection bypasses losses).
- Zero wind. Wind vectors describe motion **toward** east/north, in m/s.
- Drag uses relative airspeed magnitude times its along-course component, so strong
  tailwinds may propel the rider. Lateral force, yaw-dependent CdA and balance are
  omitted. No drafting or rotating inertia.
- Propulsion uses power divided by max(speed, 1 m/s), capped at 900 N. This explicit
  launch approximation sacrifices power below 1 m/s for stability. The forward-only
  model does not roll backward. A 30 m/s numerical ceiling remains a declared limit.
- Fixed 1/60 s integration, trapezoidal distance, no rendering input to physics.
  Frames over 250 ms are capped intentionally (background time is not ride time).
  Frame-rate comparisons require identical step-level telemetry; live packets are
  sampled at frame entry and stale-input handling uses wall time.
- Corner target: sqrt(min(2 m/s², 0.6 × g) / absolute curvature), capped at 30 m/s.
  Backward squared-speed planning uses a 3 m/s² brake-force/mass bound, slope and a
  conservative tailwind allowance. Propulsion is cut when braking. The model cannot
  guarantee a target if the rider is initialized too fast or downhill gravity/wind
  exceeds available braking. Braking loss integrates force × distance.
- The target is a training assumption, **not a safe outdoor corner speed**. Grip,
  camber, surface and raw curvature have not been independently validated.
- FTMS-primary/CPS-fallback remains browser-only. Terrain always changes virtual
  speed; optional FTMS control also sends route grade with the rider’s gear offset
  to the trainer after explicit consent. CPS remains read-only.

## Budgets and release gates

Bounded import: 20 MB file, 100,000 samples, 500 km total distance, 100 km local-frame
radius. These are defensive implementation bounds, not proven device budgets.
The renderer builds the ribbon in one allocation; chunked loading is still pending.
Record package sizes, peak memory and frame-time percentiles on agreed target
devices before raising these limits or publishing the curated release.

Run `npm run check` and `npm run test:e2e`. Hardware trainer verification remains
the separate [trainer compatibility checklist](../trainer-compatibility.md). Independent geographic
reference acceptance, physical-device performance measurements and curated route
publication remain release blockers even when automated software tests pass.
