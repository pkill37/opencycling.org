# Architecture

[Documentation index](../README.md)

OpenCycling.org is a Next.js 16 App Router static export using React and Three.js. There is no runtime server, database, authentication service or remote ride session. Both `/` and `/ride/` render the client experience; `/ride/` opens setup and is marked `noindex`.

## Runtime boundaries

```text
Trainer / simulator → normalized telemetry → RideEngine → route lookup
                                                ↓              ↓
                                          ride statistics   Three.js / HUD
                                                ↓
                                      optional trainer control
```

- `src/bluetooth/`: browser-only sources, packet parsers, availability diagnostics and acknowledged FTMS writes.
- `src/game/physics/`, `route/`, `loop/`: dynamics, validated route data, progression and ride statistics.
- `src/game/modes/`: AI races, countdown and zombie pursuit; no Three.js or trainer ownership.
- `src/game/world/`: rendering and visual animation only. It reads simulation state and does not advance riders.
- `src/game/audio/`: browser audio synthesis and lifecycle, independent of rendering and physics.
- `src/components/`: setup, low-frequency HUD snapshots, input and summaries.
- `src/lib/`: site metadata, browser-local ghosts and browser utilities.

Three.js is dynamically imported after Start. Terrain preparation uses a short-lived worker with synchronous fallback; leaving a loading ride cancels preparation. See [terrain](../routes/terrain.md) for ownership and caching details.

## Ride engine and physics

The engine uses fixed 1/60-second steps, a frame accumulator and a 250 ms frame cap. HUD snapshots publish separately, roughly every 100 ms. Route distance determines position and virtual speed remains independent of the trainer's reported wheel speed. Paused and hidden time does not advance the race.

The forward-only longitudinal model uses:

```text
theta = atan(gradient)
drive = min(power × efficiency / max(speed, 1), maxDriveForce)
resistance = mass × gravity × sin(theta)
           + Crr × mass × gravity × cos(theta)
           + aerodynamic drag from relative air velocity
acceleration = (drive - resistance - brakingForce) / mass
```

Wheel-power input bypasses drivetrain losses. Speed is clamped and distance uses trapezoidal integration. Defaults, wind projection and numerical limits are defined in [cycling.ts](../../src/game/physics/cycling.ts); anticipatory corner braking is in [cornering.ts](../../src/game/physics/cornering.ts). These are training assumptions, not outdoor corner-speed guidance. [Route dynamics](../routes/pipeline.md#dynamics-baseline-and-limitations) records the limitations.

Route lookup interpolates the shared sampled course for physics and rendering. Packages preserve source coordinates and provenance; illustrative terrain and landmarks do not change road elevations. See the [route pipeline](../routes/pipeline.md).

## Trainer telemetry and control

Discovery is user-triggered, FTMS first with Cycling Power Service fallback. Bounds-checked little-endian parsers handle optional fields, missing metrics and crank-counter rollover. Power freshness is independent of cadence: stale power decays after three seconds and pauses the ride after ten seconds.

Control requires explicit consent during setup or through **Enable trainer gears** during a ride. The source owns control-point indications, command serialization, timeouts, range clamping and cleanup. The engine publishes desired load; hardware responses never become authoritative for virtual progression.

- Prefer FTMS simulation parameters; fall back to supported target resistance if simulation control fails.
- Use Request Control (`0x00`), Target Resistance (`0x04`), Indoor Bike Simulation Parameters (`0x11`) and Stop (`0x08`) through the existing source boundary.
- Gears range from 1–21, with 11 neutral. Each step offsets transmitted grade by one percentage point, or target resistance by 2% of its supported range. Resistance targets are smoothed and quantized.
- Pause, finish, disconnect, disposal or control failure stops further resistance updates. Pending requests cannot re-enable an ended control session. CPS-only connections remain read-only.

The canonical interfaces are [trainer types](../../src/bluetooth/types.ts); encoding is in [ftms-control.ts](../../src/bluetooth/ftms-control.ts). Physical behavior requires the [compatibility checklist](../trainer-compatibility.md).

## Local races and modes

A visible-frame **1 → 2 → 3 → START** countdown begins after world preparation. Only post-START time reaches the player, AI, ghost clock, zombie pursuit and trainer-gradient output. Hidden tabs do not consume countdown time.

Every local mode includes four AI cyclists. `LocalRace` advances independent engines using the player's simulation clock, varying effort, climbs and a finishing sprint. NPC engines have no trainer source. Standings sort surviving riders by progress and completed riders by finish time; eliminated riders rank below survivors. Pause freezes the field, restart resets it, and simulator seeking resets opponents at the selected distance.

Ghosts replay the player's best saved run from browser storage. They are separate from the AI leaderboard. Summaries use time-weighted ride statistics and retain the player's race position.

Zombies pursue both the player and unfinished AI riders. An eaten AI stops racing, briefly collapses, disappears and is labeled **EATEN**. The attacker feeds for 2.5 seconds before continuing. Finished AI riders are safe; catching the player ends the ride. Hordes near surviving AI remain simulated even when the player is far ahead.

Zombie rendering follows each simulated position at all threat levels, including pauses and the summary. Loops wrap approach distances; open routes extend the initial tangent behind the start and ground models on terrain. Four articulated variants use batched rigid joints, ragged clothing, sunken eyes and animated jaws.

`ZombieAudio` unlocks Web Audio in a user gesture and synthesizes proximity-based growls with a feeding variant. It allocates no audio context on initial landing, runs only after START, supports HUD/`M` muting, and stops voices on pause, hidden tabs or ride end. Component cleanup closes the context; unavailable audio does not prevent riding.
