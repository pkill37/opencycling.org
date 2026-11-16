# Strict MVP implementation plan

1. **Architecture:** a static Next.js 16 App Router shell owns navigation and low-frequency UI snapshots. Browser-only trainer sources emit normalized samples. A standalone deterministic engine owns physics and statistics; Three.js renders its current state.
2. **Directories:** `src/app`, `components`, `bluetooth/{sources,parsers}`, `game/{physics,route,loop,world}`, `types`, `styles`, and `tests`.
3. **Dependencies:** Next.js, React, React DOM, Three.js; TypeScript, TSX, Web Bluetooth types, and Playwright for development. No backend or external assets.
4. **Bluetooth:** gesture-triggered service-filtered discovery, FTMS first and CPS fallback, optional feature reads, notifications, explicit connection states, manual reconnect and full listener cleanup. FTMS control is opt-in: the source owns acknowledged control-point writes, range clamping, serialization and cleanup; CPS remains read-only.
5. **Parsing:** bounds-checked little-endian DataView parsers respect optional field offsets. CPS crank revolution/event-time deltas account for rollover. Test binary fixtures, malformed packets and absent fields.
6. **Connection UX:** availability/security status, device/services/features, live optional fields and timestamp, actionable errors, reconnect and simulator selection. Power expires independently of unrelated packets: decay after 3 seconds and pause after 10 seconds.
7. **Route:** original closed Catmull-Rom loop sampled into an arc-length table. Binary-search distance lookup interpolates position, elevation, heading and decimal gradient. One lap completes the ride.
8. **Road:** reusable ribbon mesh built from the same sampled route and lateral normals, with shoulders and edge/center markings.
9. **World:** procedural terrain fitted beneath GPX road elevation, regional vegetation, geographically anchored water and simplified landmarks, sunlight, fog, distant alpine hills and instanced props. Reuse small local textures, limit pixel ratio and avoid postprocessing. See `GEOGRAPHIC-ROUTES.md` for scenery assumptions and geographic limitations.
10. **Rider/cameras:** procedural bike and cyclist, speed-linked wheels, cadence-linked pedals and articulated legs; smoothly following chase and first-person cameras.
11. **Physics:** configurable mass, drag, rolling resistance, drivetrain efficiency, gravity, low-speed drive-force clamp and speed cap, using the README formulas.
12. **Loop:** requestAnimationFrame accumulator at 60 Hz, bounded catch-up, independent 10 Hz HUD publication. Pause on hidden tab; do not count paused time.
13. **Telemetry/HUD:** authoritative physics speed, normalized input power/cadence, distance/elevation/gradient/time/progress. Time-weighted power and average speed for summary. Debug FPS/frame time and source diagnostics.
14. **Trainer control boundary:** the engine publishes a route-gradient control state with an in-game gear offset to the trainer source. Simulation parameters are preferred and target resistance is a bounded fallback; virtual physics remains authoritative and continues after control failure.
15. **CSS:** small mobile-first custom-property microframework plus component CSS Modules; readable edge HUD, safe-area padding and 44px touch controls.
16. **Stages:** shell/setup → Bluetooth/parser tests → route → procedural scene → rider/cameras → fixed-step engine/input → HUD → completion/summary → build, browser checks and performance sanity.

## Verification and limits

Run `npm test`, `npm run typecheck`, `npm run build`, and `npm run test:e2e`. Serve `out/` from HTTPS static hosting; `npm run dev:https` provides HTTPS development. Physical trainer compatibility and device-specific frame rates require manual testing (see COMPATIBILITY.md).

Implementation references: [Next.js static export](https://nextjs.org/docs/app/guides/static-exports), [Bluetooth GATT Specification Supplement](https://btprodspecificationrefs.blob.core.windows.net/gatt-specification-supplement/GATT_Specification_Supplement.pdf).

Local races add four deterministic AI cyclists in every local mode. `LocalRace` advances independent `RideEngine` instances on the player's fixed simulation clock, using route gradient, varying effort and a finishing sprint. No NPC engine owns a trainer source. Standings use progress for unfinished riders and elapsed finish time for completed riders; the HUD highlights the player and labels AI riders. The renderer only reads snapshots and renders nearby opponents in matching jersey colors. Pause and summary freeze the race, restart resets it, and simulator seeking resets the field at the selected location.

A visible-frame readiness countdown starts only after the 3D world is prepared. `RaceCountdown` gates the shared simulation delta until START, keeping the player, NPCs, ghost clock, survival timer, and trainer gradient output stationary during 1, 2, 3. A frame crossing START contributes only its post-start time. Hidden tabs do not consume countdown time; every new ride resets the countdown.
