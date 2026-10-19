# PRD: Geographically Accurate Route Simulation

Status: Draft for review  
Date: 2026-10-16  
Product: OpenRide

## 1. Product decision

Replace the generic fictional-world experience with geographically grounded cycling simulation. Prioritize accurate course geometry, elevation, gradients, and cycling dynamics over realistic or attractive graphics.

Launch with three curated Tour de France-associated routes representing coast, town, and climb. Build the route pipeline so it can subsequently reconstruct rideable courses from user-provided GPX files and supporting geographic datasets.

The primary value is route familiarization and training: understanding climb sequences, pacing demands, bends, descents, and course progression.

### Conversation decisions

- Google Street View and recorded cycling video were considered and rejected as the direction for this change.
- Use GPS/GPX, satellite or aerial imagery, elevation, and supporting geographic data.
- Keep continuous 3D movement, with procedural geometry grounded in real geography.
- Visual realism, elaborate scenery, and aesthetic polish are not priorities.
- Physics and route dynamics must reflect the best available evidence, with uncertainty and assumptions made explicit.
- Start with three curated routes; arbitrary GPX reconstruction is a subsequent capability built on the same pipeline.

## 2. Goals and non-goals

### Goals

1. Reproduce course distance, horizontal alignment, road elevation, gradients, and meaningful curvature as accurately as source data permits.
2. Simulate power-driven progression using gravity, aerodynamic drag, rolling resistance, drivetrain losses, and inertia.
3. Model cornering and anticipatory braking using documented, configurable assumptions.
4. Make rendering and simulation consume one authoritative route representation.
5. Provide repeatable results independent of rendering frame rate.
6. Expose data provenance, processing choices, confidence, and model parameters.
7. Establish a reusable GPX-to-route-package workflow.

### Non-goals for the initial release

- Street View, prerecorded video, or photorealistic reconstruction.
- Detailed buildings, vegetation, landmarks, or traffic simulation.
- Universal survey-grade accuracy from arbitrary GPX uploads.
- Real-time road conditions or exact predictions of outdoor race performance.
- Multiplayer, drafting packs, steering controls, or full tire/contact mechanics.
- Backend services, accounts, databases, or runtime server processing.
- Automatic trainer resistance control; existing Bluetooth remains read-only.

## 3. Target users and jobs

- A cyclist preparing for a known event wants to rehearse pacing and learn the course's climbs, descents, and turns.
- A rider wants repeatable indoor sessions on a recognizable real-world course.
- A GPX owner wants to convert a personal or event route into a rideable simulation, understanding where supporting data is incomplete.

Success means the course is useful for preparation and repeatable training, rather than merely recognizable in screenshots.

## 4. Initial route shortlist

These are proposed candidates, not yet validated route packages. Exact editions, endpoints, source rights, and data quality must be confirmed before commitment.

| Theme | Candidate | Historical association | Main validation purpose |
| --- | --- | --- | --- |
| Climb | Alpe d'Huez from Bourg-d'Oisans | Iconic Tour summit ascent; approximately 14 km depending on endpoints | Elevation, sustained gradients, 21 hairpins, road/terrain alignment |
| Coast | Marseille Corniche Kennedy segment | Associated with the 2017 Marseille time trial | Rolling grades, coastal road alignment, repeated bends |
| Town | Classic Champs-Élysées finishing circuit | Historic Tour finale circuit; select a specific edition | Flat-road dynamics, intersections, repeated laps, surface assumptions |

Implementation order: Alpe d'Huez, Marseille, Paris.

The coastal subset must be labeled as a selected segment or Tour-inspired route if it does not reproduce the complete historical course. Paris must use an explicitly selected historical layout rather than assuming all editions have identical routing. Distances and grades are derived from validated packages, not the approximate shortlist descriptions.

Fallback candidates discussed: Nice's Promenade des Anglais for coast, Pau for town, and Mont Ventoux from Bédoin for climb. Revisit only if primary candidates lack suitable data.

## 5. Data strategy

### Source roles

| Source | Use | Limitations |
| --- | --- | --- |
| GPX/GPS track | Course direction, alignment, sequencing, optional elevation evidence | Position drift, altitude noise, missing points, wrong branches |
| Barometric recordings | Independent elevation-profile evidence | Pressure drift and inconsistent calibration |
| High-resolution elevation or LiDAR | Terrain reference and road-height evidence where available | Ground surfaces may not represent bridges, tunnels, or elevated roads |
| Orthorectified aerial/satellite imagery | Alignment, bend and road-edge verification; geographic context | Cannot reliably establish grade, camber, or current surface condition |
| Road datasets such as OpenStreetMap | Connectivity, road classification, structures, available surface tags | Completeness and accuracy vary |
| Surveyed or authoritative course information | Resolve geometry, elevation, and historical-course ambiguity | Availability and redistribution rights vary |

Select providers after a corridor-specific availability and licensing review. Prefer open, redistributable data compatible with static route packages. Do not assume Google satellite imagery can be downloaded, processed, or redistributed as route assets.

Imagery is primarily a validation input. Runtime image textures are optional and not required for the initial product.

### Provenance requirements

Record dataset/provider, acquisition date, resolution, coordinate reference system, vertical datum when available, license/attribution, processing version, and manual corrections. Preserve original input files where permitted.

Each segment should distinguish measured or sourced values from inferred defaults. Unknown source accuracy must remain unknown rather than being converted into false precision.

## 6. Route reconstruction requirements

### 6.1 Ingestion and normalization

- Validate GPX coordinates, segment boundaries, ordering, and optional elevation.
- Detect duplicate samples, outliers, gaps, implausible jumps, and discontinuous tracks.
- Support explicit selection of a track when a file contains multiple candidates.
- Preserve direction and route topology, including crossings and out-and-back sections.
- Normalize coordinates into metric local frames suitable for geometry and physics; preserve geographic coordinates for provenance and lookup.
- Resolve horizontal/vertical datum differences before combining datasets.
- Define and consistently apply distance conventions, including horizontal distance for gradient calculation and road-path distance for progression.

### 6.2 Horizontal geometry

- Use confidence-based alignment to road data and imagery.
- Never blindly snap a course to the closest road.
- Preserve switchbacks, intentional race deviations, gravel segments, and repeated visits to the same location.
- Use adaptive sampling: tighter sampling where curvature or slope changes, coarser where justified.
- Avoid smoothing that cuts corners or materially changes route length.
- Define the simulated path convention, initially a validated reference line rather than an inferred optimal racing line.

### 6.3 Elevation and gradient

- Select elevation evidence by local quality rather than a single global preference.
- Correct spikes and drift using corroborating sources.
- Apply source-aware smoothing that retains genuine short climbs and gradient changes.
- Derive gradient from the corrected elevation profile and horizontal distance.
- Handle bridge decks, tunnels, retaining walls, road cuts, and stacked roads explicitly.
- Flag unsupported structures and uncertain profiles for review.
- Define the elevation-gain calculation and smoothing method so metrics are reproducible.

### 6.4 Road and terrain geometry

- Generate a continuous road ribbon from the authoritative route.
- Ensure road grade and curve geometry match simulation inputs.
- Use simple terrain for orientation; terrain resolution must not dictate incorrect road height.
- Represent bridges and tunnels minimally where necessary for physical continuity.
- Store width, surface, and camber only when supported; otherwise identify assumed values.

## 7. Simulation requirements

### 7.1 Longitudinal model

Model propulsion from wheel power against gravitational force, rolling resistance, and aerodynamic drag, with inertia governing acceleration.

Configurable inputs:

- Rider mass and bike mass.
- Drivetrain efficiency and the assumed power-measurement location.
- Aerodynamic drag area (CdA).
- Rolling-resistance coefficient (Crr).
- Air density and wind vector.
- Local route gradient and available surface information.

Requirements:

- Handle starts and near-zero speeds without unstable division by speed.
- Preserve sensible coasting and downhill behavior.
- Resolve wind relative to rider direction and avoid unphysical drag behavior.
- Use a fixed simulation timestep independent of rendering.
- Document simplifications, including treatment of rotating inertia and lateral wind.
- Provide a deterministic baseline with explicitly stated weather and rider parameters.

### 7.2 Cornering and braking

- Estimate curvature from validated geometry, not raw GPS jitter.
- Calculate a conservative target speed using configurable grip and lateral-acceleration assumptions.
- Look ahead and brake early enough to meet the target given braking limits and slope.
- Record braking losses and communicate automatic braking to the rider.
- Avoid oscillation and abrupt speed changes at sample boundaries.
- Do not present the result as an exact safe outdoor cornering speed.

Automatic braking is the recommended initial interaction. Final defaults and whether to offer an unbraked comparison mode remain open decisions.

### 7.3 Trainer boundary

Retain the existing browser-only, read-only FTMS-primary/CPS-fallback telemetry flow. Power drives virtual progression. Gradients affect simulated speed but do not command physical trainer resistance.

Resistance control would require a separate product and architecture decision. It must not be implied by this release's training claims.

## 8. User experience

### Route selection and preview

Show:

- Route identity, exact endpoints, direction, and historical-course context.
- Distance, elevation gain, elevation profile, and major climbs.
- Surface assumptions, rider parameters, and environmental settings.
- Source quality summary and flagged segments.
- Route-package version for repeatable comparisons.

### Riding

- Plain road ribbon, simple terrain, and continuous camera motion.
- Existing power, cadence, speed, elapsed time, and distance HUD.
- Current gradient, elevation profile position, and upcoming turn/climb information.
- Optional distance markers, hairpin numbers, and gradient/confidence overlays.
- Clear indication when automatic braking is active.

### GPX import

Validate and preview the selected course before generating or loading its world. Explain missing elevation/context and offer a reviewable degraded result where appropriate. Do not silently bridge large track gaps or imply a raw GPX has curated-route accuracy.

Automatic reconstruction and curated reconstruction share the same format and runtime. Curated routes add reviewed corrections and stronger validation.

## 9. Technical architecture

### Existing foundation

- `src/game/loop/engine.ts` already separates ride progression from rendering and accepts a course.
- `src/game/route/route.ts` currently generates a fictional course using Three.js and provides route lookup.
- Three.js rendering lives under `src/game/world`.
- The application is a backend-free Next.js static export.

### Proposed flow

```text
GPX + elevation + geographic evidence
                 ↓
Offline validation and reconstruction
                 ↓
Versioned route package
                 ↓
Trainer/simulator → RideEngine → geographic route lookup
                                      ↓
                              renderer and HUD
```

### Components

1. Renderer-independent geographic route model and lookup.
2. Offline data-ingestion and route-building tool.
3. Route-package schema, validation, and versioning.
4. Longitudinal physics and cornering/braking modules.
5. Minimal road/terrain renderer with chunked loading where needed.
6. Route preview, diagnostics, and subsequent GPX import flow.

### Route-package contents

- Manifest: identity, endpoints, direction, lap behavior, version, source attribution.
- Reference geometry: geographic/local coordinates, cumulative distance, road elevation, gradient, heading, curvature.
- Optional segment attributes: surface, width, structures, assumed parameters.
- Confidence/provenance references and correction records.
- Terrain and road geometry chunks or reproducible generation inputs.
- Validation report and processing configuration.

Keep simulation authoritative outside Three.js. Visual level-of-detail changes must not affect physics. Load the world after ride start, preserving the lightweight landing page.

### Deployment and arbitrary GPX

Build curated packages offline and serve them as static assets. Development-time tools may process files and datasets; the browser runtime must not gain server dependencies.

Generalize next into a local GPX-to-package builder. Browser-side GPX parsing/preview can precede full browser reconstruction. Full browser generation depends on dataset access, download volume, memory, provider terms, and cross-origin support.

A hosted route-processing service is outside this plan and requires an explicit future decision.

## 10. Delivery phases

### Phase 0 — Data feasibility and reference definition

- Confirm exact historical courses and endpoints.
- Inventory geographic/elevation sources and redistribution permissions.
- Establish independent reference measurements and achievable error budgets.
- Identify bridges, tunnels, hairpins, intersections, and uncertain segments.

Exit: Alpe d'Huez sources and validation criteria are sufficient for a defensible prototype.

### Phase 1 — Alpe d'Huez vertical slice

- Implement geographic route model, GPX processing, and corrected elevation profile.
- Build minimal road and terrain geometry.
- Integrate trainer/simulator progression and longitudinal physics.
- Display profile, gradient, distance, and data diagnostics.

Exit: Full ascent is rideable, deterministic, and validated against independent references within agreed tolerances.

### Phase 2 — Cornering and dynamics validation

- Implement curvature processing, lookahead braking, and braking-loss reporting.
- Validate downhill and switchback behavior using suitable course sections or controlled fixtures.
- Tune documented defaults and check parameter sensitivity.

Exit: Corners produce stable, explainable speed behavior; energy and braking checks pass.

### Phase 3 — Coast and town packages

- Produce Marseille and Paris routes through the same pipeline.
- Validate rolling grades, intersections, lap continuity, and available surface metadata.
- Improve tooling for manual corrections and source comparison.

Exit: All three curated packages meet their documented accuracy criteria and runtime checks.

### Phase 4 — Generalized GPX workflow

- Deliver a reusable local route builder and package import.
- Add GPX validation/preview and confidence reporting.
- Evaluate bounded browser reconstruction using supported data sources.

Exit: A new GPX can become a rideable package without route-specific application code; unsupported cases are explicitly identified.

## 11. Validation and acceptance

### Accuracy budget

During Phase 0, set numerical tolerances for each route based on source precision and independent references. Do not invent universal centimeter-level or gradient guarantees.

Measure:

- Total distance error and local alignment error.
- Elevation error at reference points.
- Gradient agreement over multiple distance windows.
- Elevation-gain agreement under a declared calculation method.
- Curve/hairpin position and radius plausibility.
- Percentage of route with unresolved or inferred data.

Publishing a curated route requires documented tolerances, measured outcomes, and review of unresolved exceptions. Without credible reference data, accuracy is unverified rather than passed.

### Route acceptance

- No unexplained geometry jumps or elevation discontinuities.
- No artificial gradient spikes from source noise.
- Hairpins and repeated crossings preserve topology.
- Structures use the intended road elevation.
- Renderer and physics agree on position, heading, and grade.
- Circuit lap boundaries are continuous and do not introduce speed or elevation artifacts.

### Physics acceptance

- Analytical flat-road and constant-grade equilibrium checks.
- Uphill/downhill/coasting scenarios with energy-balance checks.
- Stable behavior at zero and very low power/speed.
- Expected response to changes in mass, drag, rolling resistance, and wind.
- Anticipatory braking respects the configured deceleration constraints when physically achievable.
- Consistent outcomes across different render-frame schedules for identical simulation inputs.

### Integration checks

- Run `npm run check` and focused meaningful route/physics tests.
- Update relevant Playwright flows for route selection, simulator riding, and mocked Bluetooth.
- Verify static export, no landing-page world initialization, and lazy world loading.
- Validate loading and memory on agreed target hardware; record frame-time and package-size budgets during the prototype.
- Physical trainer compatibility remains subject to the existing manual hardware checklist.

## 12. Risks and mitigations

| Risk | Response |
| --- | --- |
| Elevation noise changes training demands | Cross-check sources, source-aware smoothing, profile diagnostics |
| Terrain model misrepresents bridges/tunnels | Explicit structure handling and curated corrections |
| GPS smoothing destroys hairpins | Topology-aware alignment and geometry review |
| Unknown rider parameters dominate speed predictions | Expose parameters, presets, and sensitivity rather than promise exact times |
| Cornering depends on unavailable camber/grip | Configurable conservative assumptions and clear model limits |
| Large datasets complicate static deployment | Offline processing and compact corridor packages |
| Satellite data cannot be redistributed | Use permitted sources; omit runtime textures when unnecessary |
| Arbitrary GPX quality varies widely | Confidence reports and a distinction between automatic and curated validation |

## 13. Open decisions

1. Exact historical edition, endpoints, direction, and lap behavior for each route.
2. Data providers, available resolutions, and source licensing.
3. Numerical accuracy tolerances after the data audit.
4. Default rider/bike parameters and environmental baseline.
5. Initial cornering/braking defaults and user controls.
6. First GPX delivery surface: local builder/package import, then scope of browser generation.
7. Target devices and performance/package-size budgets.

## 14. Definition of success

OpenRide can load three documented real-world courses and simulate repeatable power-driven rides whose geometry, gradients, and dynamics are supported by validated data and explicit assumptions. A reusable route-building workflow can turn additional GPX courses into the same runtime format. Simple visuals faithfully explain the course without changing or disguising its physical model.
