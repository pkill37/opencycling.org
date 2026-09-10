# OpenRide MVP Specification

## Run the implementation

```sh
npm install
npm run dev:https
```

Open the local HTTPS URL printed by Next.js. Connect an FTMS/CPS trainer or choose the simulator, then start the Cedar Valley Loop. For simulator-only development, `npm run dev` also works.

```sh
npm test
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

The build exports `out/` for HTTPS static hosting. `npm start` previews that export locally. Browser tests run against the built export on port 4173.

See [implementation architecture](docs/IMPLEMENTATION.md) and [controls, setup, and hardware compatibility checklist](docs/COMPATIBILITY.md). Real trainer compatibility still needs physical hardware verification; automated checks use packet fixtures and mocked GATT devices.

---

## 1. Purpose

OpenRide is an open source virtual indoor cycling web application inspired by the core riding experience of platforms like MyWhoosh and Zwift, without copying their branding, maps, artwork, UI, characters, assets, or proprietary systems.

The goal of the MVP is not to build a full fitness platform.

The goal is to build a credible riding engine:

```text
Bluetooth trainer telemetry or simulated power input
→ telemetry normalization
→ physics simulation
→ rider motion
→ 3D route/world rendering
→ real-time HUD
→ ride completion summary
```

Everything else is out of scope unless it directly supports the riding engine.

---

## 2. Product Goal

The MVP should allow a user to:

1. open the app
2. start a predefined route
3. connect to a Bluetooth smart trainer using Web Bluetooth, or fall back to simulated power input
4. see a 3D cyclist move through a virtual world
5. see real-time telemetry
6. complete the ride
7. view a basic ride summary

The app must work without:

- account creation
- backend
- cloud sync
- multiplayer server
- payment system
- database
- authentication

The MVP should feel like a minimal open source prototype of a virtual cycling world, not a SaaS dashboard.

---

## 3. Technology Stack

Use:

- Next.js 16
- TypeScript
- React
- Static Site Generation
- Next.js App Router
- Three.js
- `@react-three/fiber` if useful
- `@react-three/drei` if useful
- CSS3
- custom lightweight responsive CSS microframework
- CSS Modules for component-specific styling

The app must be compatible with static export.

Do not require:

- backend runtime
- Node.js APIs after build
- server actions
- authentication
- database
- WebSockets
- native desktop/mobile companion app
- external CSS framework

---

## 4. Rendering and Physics Engine Decision

Use **Three.js** as the MVP rendering engine.

Do not use raw WebGL directly except for isolated low-level rendering optimizations if absolutely necessary.

Do not use WebGPU in the MVP.

Do not use a generic rigid-body physics engine such as Cannon.js, Rapier, Ammo.js, or PhysX.

The cycling simulation should be a custom deterministic physics model because the rider moves along a predefined route spline. The MVP does not require free-body bicycle dynamics, collisions, crashes, balance, or tire simulation.

### 4.1 Three.js Responsibilities

Three.js is responsible for:

- scene graph
- cameras
- lighting
- terrain
- road mesh
- rider mesh
- animation
- instanced scenery
- render loop integration

### 4.2 Custom Physics Engine Responsibilities

The custom physics engine is responsible for:

- power-to-speed conversion
- gravity on gradients
- rolling resistance
- aerodynamic drag
- acceleration
- speed integration
- distance integration
- route progress

### 4.3 Route Engine Responsibilities

The route engine is responsible for:

- distance-to-position lookup
- distance-to-heading lookup
- distance-to-gradient lookup
- distance-to-elevation lookup

### 4.4 HTML/CSS HUD Responsibilities

The HTML/CSS HUD is responsible for:

- power
- speed
- cadence
- distance
- elapsed time
- gradient
- elevation
- progress

### 4.5 Core Runtime Flow

```text
Bluetooth trainer power/cadence or simulated power input
→ telemetry normalization
→ custom cycling physics
→ distance along route
→ route lookup
→ rider transform
→ Three.js render
→ HUD update
```

### 4.6 Architecture Boundary

Do not let Three.js own the cycling simulation.

Three.js should render the current world state.

The custom physics engine should calculate the rider state.

The route engine should translate distance traveled into world-space position, heading, elevation, and gradient.

The HUD should consume telemetry derived from the simulation state.

The MVP architecture should therefore be:

```text
Bluetooth Trainer / Simulator Input
    ↓
Telemetry Normalization
    ↓
Custom Cycling Physics
    ↓
Route Engine
    ↓
Rider State
    ↓
Three.js Scene Update
    ↓
HTML/CSS HUD
```

This keeps the MVP simple, deterministic, testable, and performant.


---

## 5. Web Bluetooth Smart Trainer Requirement

Bluetooth smart-trainer connectivity is a core MVP requirement, not a later enhancement.

The MVP must prove that a browser-only static web app can connect to an indoor bike trainer, receive live cycling telemetry, normalize it, feed it into the simulation loop, and drive the Three.js rider/world/HUD in real time.

The simulator input remains necessary for development and fallback, but the MVP is not complete if it only works with keyboard-simulated power.

### 5.1 Browser-Only Constraint

Trainer connectivity must run entirely in the browser using the Web Bluetooth API.

Do not use:

- native desktop apps
- Electron
- mobile companion apps
- Node.js BLE bridges
- WebSocket BLE bridges
- local background daemons
- ANT+ USB dongle integrations
- vendor SDKs requiring native code
- cloud services

The proof point is:

```text
smart trainer
→ browser Web Bluetooth
→ GATT service discovery
→ characteristic notifications
→ normalized trainer telemetry
→ custom cycling physics
→ Three.js rider/world update
→ HTML/CSS HUD update
```

The application may still be statically hosted, but Bluetooth requires a secure browser context.

The app must therefore work on:

```text
https://localhost during development
HTTPS static hosting in production
```

The UI must detect whether `navigator.bluetooth` is available and show a clear fallback when unsupported.

### 5.2 Primary Bluetooth Protocol Target

The primary target is Bluetooth Low Energy smart trainers exposing:

```text
Fitness Machine Service / FTMS
UUID: 0x1826
```

The MVP should prioritize FTMS because it is the standard Bluetooth service for fitness machines such as smart trainers and indoor bikes.

Minimum required FTMS support:

```text
connect to a BLE trainer
identify FTMS service
read Fitness Machine Feature where available
subscribe to Indoor Bike Data notifications
parse instantaneous power when present
parse cadence when present
parse speed when present
surface unsupported/missing fields cleanly
handle disconnects
reconnect manually
```

Key FTMS UUIDs to support:

```ts
export const FTMS_SERVICE = '00001826-0000-1000-8000-00805f9b34fb';
export const FITNESS_MACHINE_FEATURE = '00002acc-0000-1000-8000-00805f9b34fb';
export const INDOOR_BIKE_DATA = '00002ad2-0000-1000-8000-00805f9b34fb';
export const FITNESS_MACHINE_STATUS = '00002ada-0000-1000-8000-00805f9b34fb';
export const FITNESS_MACHINE_CONTROL_POINT = '00002ad9-0000-1000-8000-00805f9b34fb';
```

### 5.3 Secondary Bluetooth Protocol Target

Some trainers and power meters expose Cycling Power Service instead of, or in addition to, FTMS.

Support Cycling Power Service as a secondary MVP path if feasible:

```text
Cycling Power Service / CPS
UUID: 0x1818
Cycling Power Measurement UUID: 0x2A63
Cycling Power Feature UUID: 0x2A65
```

Key CPS UUIDs:

```ts
export const CYCLING_POWER_SERVICE = '00001818-0000-1000-8000-00805f9b34fb';
export const CYCLING_POWER_MEASUREMENT = '00002a63-0000-1000-8000-00805f9b34fb';
export const CYCLING_POWER_FEATURE = '00002a65-0000-1000-8000-00805f9b34fb';
```

The MVP priority order is:

```text
1. FTMS Indoor Bike Data
2. Cycling Power Measurement
3. simulator fallback
```

Do not attempt ANT+ in the web MVP.

### 5.4 Optional Heart Rate Support

Heart rate is not required for proving the trainer integration, but it is acceptable as a small optional sensor path if it does not distract from FTMS.

```text
Heart Rate Service UUID: 0x180D
Heart Rate Measurement UUID: 0x2A37
```

If implemented, heart rate must be isolated as a generic sensor source and must not be required to ride.

### 5.5 Trainer Control Scope

The strict MVP must first implement read-only trainer telemetry.

Required:

```text
connect
subscribe
parse power/cadence/speed
feed telemetry into ride engine
```

Optional after read-only telemetry works:

```text
write FTMS control point
request control
start/resume trainer session
stop/pause trainer session
set target resistance
set simulation parameters
map route gradient to trainer resistance
```

Do not block the MVP on trainer resistance control. Reading real power from the trainer is the mandatory proof.

If trainer control is attempted, isolate it behind capability checks because not every trainer exposes the same write/control features.

### 5.6 Connection UX

The ride start flow must include explicit trainer connection states:

```text
Home
 ↓
Ride Setup
 ↓
Connect Trainer
 ├─ Web Bluetooth available → request device
 ├─ supported trainer found → connect and subscribe
 ├─ unsupported browser/device → simulator fallback
 └─ user skips → simulator fallback
 ↓
Start Ride
```

The connection panel must show:

- Web Bluetooth support status
- selected device name
- connection state
- detected services
- live raw power/cadence/speed preview
- last packet timestamp
- reconnect button
- use simulator button
- clear error messages

Do not hide Bluetooth failures behind generic errors.

### 5.7 Device Request Strategy

Use `navigator.bluetooth.requestDevice()` from a direct user gesture.

Request devices using service filters and optional services.

Example strategy:

```ts
const device = await navigator.bluetooth.requestDevice({
  filters: [
    { services: [FTMS_SERVICE] },
    { services: [CYCLING_POWER_SERVICE] }
  ],
  optionalServices: [
    FTMS_SERVICE,
    CYCLING_POWER_SERVICE,
    HEART_RATE_SERVICE
  ]
});
```

The implementation should also support a debug mode using `acceptAllDevices: true` with optional services, but this must not be the default production path.

### 5.8 BLE Data Parsing

Create dedicated parser modules for each supported GATT characteristic.

Suggested structure:

```text
src/bluetooth/
├── constants.ts
├── types.ts
├── availability.ts
├── trainer-discovery.ts
├── gatt-client.ts
├── sources/
│   ├── ftms-trainer-source.ts
│   ├── cycling-power-source.ts
│   └── simulator-source.ts
└── parsers/
    ├── parse-indoor-bike-data.ts
    ├── parse-cycling-power-measurement.ts
    └── parse-heart-rate-measurement.ts
```

Parsing must be unit-tested with static `DataView` byte fixtures.

Do not parse binary BLE packets inside React components.

Do not mix Bluetooth GATT code with physics or Three.js code.

### 5.9 Normalized Trainer Telemetry

All physical and simulated inputs must be normalized into one shape before entering the simulation.

```ts
export interface TrainerTelemetrySample {
  source: 'ftms' | 'cycling-power' | 'heart-rate' | 'simulator';
  timestampMs: number;
  powerWatts?: number;
  cadenceRpm?: number;
  speedMetersPerSecond?: number;
  heartRateBpm?: number;
  raw?: unknown;
}
```

The simulation must consume normalized telemetry, not raw Bluetooth packets.

The priority rule for power should be:

```text
real trainer power if available
else cycling power meter power if available
else simulator power
```

Cadence priority:

```text
real trainer cadence if available
else cycling power cadence if available
else simulator-estimated cadence
```

Speed policy:

```text
use virtual physics speed as authoritative world speed
use trainer-reported speed only for diagnostics unless explicitly configured otherwise
```

The virtual world should be driven by the physics engine using real power, not blindly by trainer speed.

### 5.10 Trainer Source Interface

Replace the previous simple `PowerInput` interface with a real trainer-source abstraction.

```ts
export type TrainerConnectionState =
  | 'unsupported'
  | 'idle'
  | 'requesting-device'
  | 'connecting'
  | 'discovering-services'
  | 'subscribing'
  | 'connected'
  | 'disconnected'
  | 'error';

export interface TrainerSource {
  readonly id: string;
  readonly label: string;
  readonly kind: 'bluetooth-ftms' | 'bluetooth-cps' | 'simulator';

  getState(): TrainerConnectionState;
  connect(): Promise<void>;
  disconnect(): Promise<void>;

  subscribe(
    callback: (sample: TrainerTelemetrySample) => void
  ): () => void;
}
```

The ride engine should depend on `TrainerSource`, not on Web Bluetooth directly.

### 5.11 Web Bluetooth Error Handling

Handle at minimum:

- browser does not support Web Bluetooth
- insecure context
- user cancels device chooser
- no matching devices
- GATT connection failure
- missing FTMS service
- missing Indoor Bike Data characteristic
- unsupported characteristic flags
- notification subscription failure
- device disconnect
- stale telemetry timeout

The UI should convert technical errors into useful messages.

Example:

```text
Connected to trainer, but it does not expose Indoor Bike Data. Try Cycling Power mode or simulator mode.
```

### 5.12 Telemetry Timeout

The ride must detect stale trainer data.

Example policy:

```text
if no trainer telemetry for > 3 seconds:
  show stale sensor warning
  hold last power briefly or decay toward 0 W

if no trainer telemetry for > 10 seconds:
  mark trainer disconnected/stale
  pause or offer simulator fallback
```

Do not silently keep riding forever on stale power.

### 5.13 Compatibility Testing Targets

The MVP should be tested against at least one real BLE trainer if available.

Target device classes:

```text
FTMS smart trainer
FTMS indoor bike
BLE cycling power meter
BLE cadence sensor, optional
BLE heart-rate strap, optional
```

Create a manual compatibility checklist:

```text
browser
operating system
device name
advertised services
connected service path
power received
cadence received
speed received
disconnect behavior
notes
```

### 5.14 Privacy and Security

Do not transmit Bluetooth device names, IDs, telemetry, or ride data to a server.

Do not add analytics.

Keep trainer data local to the browser.

Ask for Bluetooth access only after the user clicks a connect button.

Do not continuously scan in the background.

---

## 6. Explicit Non-Goals

Do not build these in the MVP:

- accounts
- profiles
- friends
- clubs
- chat
- events
- races
- rankings
- leaderboards
- achievements
- streaks
- XP
- levels
- garage
- bike upgrades
- cosmetics
- training plans
- structured workout library
- payments
- subscriptions
- cloud sync
- Strava integration
- Garmin integration
- FIT export
- route editor
- real multiplayer
- voice chat
- mobile companion app
- modding
- marketplace

Do not build a generic fitness app.

Do not build a dashboard-first product.

Do not spend time on gamification before the ride engine works.

---

## 7. MVP Scope

The MVP contains only the systems required to produce one rideable virtual cycling route.

### 7.1 Ride Engine

- one playable route
- Web Bluetooth smart-trainer input
- FTMS Indoor Bike Data parsing
- Cycling Power Service parsing where feasible
- simulator fallback input
- physically plausible cycling physics
- rider movement along the route
- gradient-aware speed
- real-time distance tracking
- route progress tracking
- ride completion detection

### 7.2 3D World

- one original virtual world
- one road loop
- procedural or manually defined route geometry
- terrain
- sky
- lighting
- simple scenery
- road surface
- basic environmental objects
- performant rendering

### 7.3 Rider

- one player cyclist
- simplified bike/rider model
- wheel rotation
- pedal/crank animation
- cadence-linked animation

### 7.4 HUD

- power
- speed
- cadence
- distance
- elapsed time
- gradient
- elevation
- route progress

### 7.5 Controls

- Bluetooth trainer connection controls
- keyboard simulated power controls
- optional touch controls
- camera toggle
- pause/resume
- exit ride

### 7.6 Post-Ride

- basic ride summary
- total distance
- total time
- average speed
- average power
- max power
- elevation gain

Nothing else.

---

## 8. Core Architecture

Separate the app into five major systems:

```text
UI Shell
Web Bluetooth Trainer Connectivity
Ride Simulation
3D Rendering
Telemetry/HUD
```

Recommended structure:

```text
src/
├── app/
│   ├── page.tsx
│   └── ride/
│       └── page.tsx
│
├── components/
│   ├── hud/
│   ├── ride/
│   └── ui/
│
├── game/
│   ├── loop/
│   ├── physics/
│   ├── route/
│   ├── rider/
│   ├── world/
│   └── camera/
│
├── bluetooth/
│   ├── constants.ts
│   ├── types.ts
│   ├── availability.ts
│   ├── trainer-discovery.ts
│   ├── gatt-client.ts
│   ├── sources/
│   └── parsers/
│
├── input/
│   └── simulator/
│
├── styles/
│   ├── index.css
│   ├── reset.css
│   ├── tokens.css
│   ├── base.css
│   ├── layout.css
│   ├── hud.css
│   └── utilities.css
│
├── types/
└── data/
    └── routes/
```

Keep the simulation independent from React.

React should display state.

React should not own the 60 FPS physics loop.

---

## 9. Application Flow

The MVP flow is:

```text
Home
 ↓
Ride Setup
 ↓
Connect Trainer or Use Simulator
 ↓
Start Ride
 ↓
Ride Screen
 ↓
Finish Ride
 ↓
Ride Summary
```

The home screen should be minimal.

It only needs:

- OpenRide title
- connect trainer button
- use simulator button
- start ride button
- route name
- route distance
- route elevation gain
- basic controls/help

Avoid building a full product dashboard.

---

## 10. Route System

Implement a real route abstraction.

Do not hard-code movement directly into the scene.

Use route points:

```ts
export interface RoutePoint {
  x: number;
  y: number;
  z: number;
  distanceMeters: number;
  elevationMeters: number;
  gradient: number;
}

export interface CyclingRoute {
  id: string;
  name: string;
  distanceMeters: number;
  elevationGainMeters: number;
  loop: boolean;
  points: RoutePoint[];
}
```

The rider should move along a route curve.

Use:

```text
THREE.CatmullRomCurve3
```

or an equivalent Three.js curve/path representation.

The route system must provide:

- position at distance
- heading at distance
- gradient at distance
- elevation at distance
- route progress
- remaining distance

This is one of the most important parts of the MVP.

---

## 11. Road Generation

Generate a road from the route path.

The road should follow the route spline.

Minimum road features:

- road mesh
- road width
- basic shoulders
- simple center line or edge markings

Avoid hand-modeling the entire world.

Build reusable geometry generation utilities.

The road must visually align with the rider path.

---

## 12. Terrain and World Rendering

Create one simple original world.

Target style:

```text
low-poly
clean
readable
fast
pleasant
non-photorealistic
```

The world should include:

- terrain
- road
- grass/ground
- trees
- rocks
- a few buildings or simple structures
- distant hills or mountains
- sky
- sunlight
- ambient light

Use simple geometry.

Use instancing for repeated objects.

Do not use heavy post-processing.

Do not use large imported asset packs unless absolutely necessary.

Performance matters more than visual richness.

---

## 13. Rider Model

Create a simple cyclist model.

It can be procedural geometry.

Minimum requirements:

- bike frame
- two wheels
- handlebars
- rider torso
- head
- arms
- legs
- pedals/crank

Animate:

- wheel rotation based on speed
- crank rotation based on cadence
- simple leg movement based on cadence
- slight rider lean or body motion if easy

Do not spend excessive time on character realism.

The rider only needs to look believable enough for an MVP.

---

## 14. Physics Model

Implement a deterministic cycling physics model.

Inputs:

- rider power
- rider weight
- bike weight
- gradient
- rolling resistance
- aerodynamic drag
- air density
- drivetrain efficiency

Outputs:

- acceleration
- speed
- distance traveled

Use a simplified but plausible model:

```text
P = F × v
```

Forces:

- gravity force on gradient
- rolling resistance
- aerodynamic drag

Suggested formulas:

```text
Fg = m × g × sin(theta)

Frr = Crr × m × g × cos(theta)

Fd = 0.5 × rho × CdA × v²
```

Represent gradient as a decimal, not a percentage:

```ts
0.06  // 6%
-0.03 // -3%
```

Convert gradient to slope angle:

```ts
const slopeAngle = Math.atan(gradient);
```

Use configurable constants:

```ts
export interface PhysicsConfig {
  riderMassKg: number;
  bikeMassKg: number;
  crr: number;
  cda: number;
  airDensity: number;
  drivetrainEfficiency: number;
  gravity: number;
  maxDriveForce: number;
  maxSpeedMetersPerSecond: number;
}
```

Suggested defaults:

```ts
export const defaultPhysicsConfig: PhysicsConfig = {
  riderMassKg: 75,
  bikeMassKg: 9,
  crr: 0.004,
  cda: 0.32,
  airDensity: 1.225,
  drivetrainEfficiency: 0.97,
  gravity: 9.80665,
  maxDriveForce: 900,
  maxSpeedMetersPerSecond: 30
};
```

Use a low-speed force clamp to avoid division by zero or unrealistic launch acceleration:

```ts
const effectivePower = powerWatts * config.drivetrainEfficiency;

const driveForce = Math.min(
  effectivePower / Math.max(speedMetersPerSecond, 1.0),
  config.maxDriveForce
);
```

Then compute:

```text
netForce = driveForce - gravityForce - rollingResistance - aeroDrag
acceleration = netForce / totalMass
speed = max(0, speed + acceleration × dt)
distance = distance + speed × dt
```

The model does not need to be perfect.

It does need to behave believably:

- more power means faster speed
- steeper climb means lower speed
- descent means higher speed
- zero power causes deceleration
- heavier rider is slower uphill

---

## 15. Simulation Loop

Do not couple physics to React rendering.

Use a dedicated game loop:

```text
requestAnimationFrame
  ↓
accumulate delta time
  ↓
fixed-step physics update
  ↓
update rider state
  ↓
update Three.js scene
  ↓
publish lower-frequency HUD state
```

Target:

- physics: 60 Hz fixed timestep
- HUD updates: 5–10 Hz
- rendering: `requestAnimationFrame`

React should not rerender the whole ride UI at 60 FPS.

---

## 16. Simulator Fallback Input

The MVP must support real Bluetooth trainer input. The virtual trainer simulator exists only as a fallback and development tool.

Keyboard controls:

```text
Arrow Up / W      increase power
Arrow Down / S    decrease power
Space             temporary sprint
1                 100 W
2                 150 W
3                 200 W
4                 250 W
5                 300 W
6                 400 W
7                 500 W
8                 600 W
9                 800 W
C                 change camera
H                 toggle HUD
P                 pause/resume
Esc               exit ride
```

Simulator telemetry should include:

- power
- cadence
- speed
- distance
- elapsed time
- gradient
- elevation

Cadence can be estimated from power with small noise.

Heart rate is out of scope for the first MVP unless trivial.

---

## 17. Telemetry

Use a central telemetry state fed by normalized Bluetooth or simulator input.

```ts
export interface TrainerTelemetrySample {
  source: 'ftms' | 'cycling-power' | 'heart-rate' | 'simulator';
  timestampMs: number;
  powerWatts?: number;
  cadenceRpm?: number;
  speedMetersPerSecond?: number;
  heartRateBpm?: number;
  raw?: unknown;
}

export interface TelemetrySample {
  timestampMs: number;
  elapsedSeconds: number;
  powerWatts: number;
  cadenceRpm: number;
  speedMetersPerSecond: number;
  distanceMeters: number;
  elevationMeters: number;
  gradient: number;
}
```

Telemetry drives:

- HUD
- ride summary
- debug overlay

Do not let UI components calculate core simulation values independently.

---

## 18. HUD

The HUD should be large, readable, and ride-focused.

Show:

- power
- speed
- cadence
- gradient
- distance
- elapsed time
- route progress

Example:

```text
          248 W

        31.4 km/h

CAD 88       6.3%

12.4 km      14:32
```

Use an HTML/CSS overlay.

Do not render important telemetry text inside Three.js unless it is part of the world.

The HUD must not obscure the road centerline.

---

## 19. Camera System

Implement at least two cameras:

- chase camera
- first-person camera

Optional third camera:

- cinematic side/rear camera

The default should be chase camera.

The camera should:

- follow the rider smoothly
- look slightly ahead on the route
- avoid excessive shaking
- remain usable during climbs and descents

Shortcut:

```text
C
```

cycles cameras.

---

## 20. Rendering Performance

Target:

- 60 FPS on desktop/laptop
- 30 FPS minimum on weaker devices

Use:

- `InstancedMesh` for trees and rocks
- low-poly geometry
- minimal materials
- few lights
- limited shadows
- no expensive post-processing
- no huge textures
- no unnecessary React Three Fiber component explosion

The MVP scene should be simple enough to run smoothly.

Performance debug overlay should show:

- FPS
- frame time
- speed
- distance
- power
- gradient
- camera mode

Toggle:

```text
F3
```

---

## 21. Custom CSS3 Responsive Microframework

Build only the CSS needed for the MVP.

Use:

- CSS custom properties
- mobile-first CSS
- fluid typography
- fluid spacing
- basic layout primitives
- safe-area support
- touch targets
- HUD primitives

Do not build a large design system.

Files:

```text
src/styles/
├── index.css
├── reset.css
├── tokens.css
├── base.css
├── layout.css
├── hud.css
└── utilities.css
```

Include only essential primitives:

- `.container`
- `.stack`
- `.cluster`
- `.grid`
- `.fullscreen`
- `.sr-only`
- `.hidden`
- `.button`
- `.hud`
- `.hud-panel`
- `.metric`
- `.metric--hero`
- `.metric--primary`
- `.metric--secondary`

Mobile support must focus on the ride screen.

Phone portrait:

- large central power/speed
- compact secondary metrics
- minimal controls

Phone landscape:

- HUD at screen edges
- clear center view
- touch power controls if enabled

Desktop:

- full HUD
- debug overlay available
- larger world view

Do not over-engineer responsive behavior.

---

## 22. Touch Support

The MVP should be usable on mobile/tablet in simulator mode.

Provide optional touch controls:

- increase power
- decrease power
- sprint
- camera
- pause

Minimum touch target:

```text
44px
```

Touch controls should not cover the rider or road center.

---

## 23. Ride Completion

A ride completes when:

```text
distance >= route distance
```

For loop routes, complete after one lap.

Then show a summary:

- distance
- time
- average speed
- average power
- max power
- elevation gain

No charts required for the strict MVP.

No ride history required for the strict MVP.

Persistence is optional and should not distract from the ride engine.

---

## 24. Essential TypeScript Interfaces

Define at minimum:

```ts
export interface RoutePoint {
  x: number;
  y: number;
  z: number;
  distanceMeters: number;
  elevationMeters: number;
  gradient: number;
}

export interface CyclingRoute {
  id: string;
  name: string;
  distanceMeters: number;
  elevationGainMeters: number;
  loop: boolean;
  points: RoutePoint[];
}

export interface PhysicsConfig {
  riderMassKg: number;
  bikeMassKg: number;
  crr: number;
  cda: number;
  airDensity: number;
  drivetrainEfficiency: number;
  gravity: number;
  maxDriveForce: number;
  maxSpeedMetersPerSecond: number;
}

export interface RiderState {
  distanceMeters: number;
  speedMetersPerSecond: number;
  accelerationMetersPerSecondSq: number;
  powerWatts: number;
  cadenceRpm: number;
  elevationMeters: number;
  gradient: number;
  elapsedSeconds: number;
}

export interface TelemetrySample {
  timestampMs: number;
  elapsedSeconds: number;
  powerWatts: number;
  cadenceRpm: number;
  speedMetersPerSecond: number;
  distanceMeters: number;
  elevationMeters: number;
  gradient: number;
}

export interface RideSummary {
  routeId: string;
  distanceMeters: number;
  elapsedSeconds: number;
  averageSpeedMetersPerSecond: number;
  averagePowerWatts: number;
  maxPowerWatts: number;
  elevationGainMeters: number;
}

export interface TrainerTelemetrySample {
  source: 'ftms' | 'cycling-power' | 'heart-rate' | 'simulator';
  timestampMs: number;
  powerWatts?: number;
  cadenceRpm?: number;
  speedMetersPerSecond?: number;
  heartRateBpm?: number;
  raw?: unknown;
}

export type TrainerConnectionState =
  | 'unsupported'
  | 'idle'
  | 'requesting-device'
  | 'connecting'
  | 'discovering-services'
  | 'subscribing'
  | 'connected'
  | 'disconnected'
  | 'error';

export interface TrainerSource {
  readonly id: string;
  readonly label: string;
  readonly kind: 'bluetooth-ftms' | 'bluetooth-cps' | 'simulator';

  getState(): TrainerConnectionState;
  connect(): Promise<void>;
  disconnect(): Promise<void>;

  subscribe(
    callback: (sample: TrainerTelemetrySample) => void
  ): () => void;
}

export interface SimulatorTrainerSource extends TrainerSource {
  increasePower(): void;
  decreasePower(): void;
  sprint(): void;
  setPower(powerWatts: number): void;
}
```

Do not define interfaces for systems that are not part of the MVP.

---

## 25. Build Stages

### Stage 1 — Static Shell and Trainer Setup UI

Implement:

- home page
- ride page
- basic navigation
- connect trainer button
- use simulator button
- start ride button
- route metadata
- global styles

No complex dashboard.

### Stage 2 — Web Bluetooth Trainer Spike

Implement:

- Web Bluetooth availability detection
- secure-context checks
- requestDevice from user click
- FTMS service discovery
- Indoor Bike Data notification subscription
- parser for power/cadence/speed fields
- normalized trainer telemetry output
- connection status UI
- disconnect handling
- simulator fallback

At the end of this stage, the app must prove that live trainer power can reach application state in the browser.

### Stage 3 — Route Engine

Implement:

- route data
- route interpolation
- distance to position
- distance to gradient
- distance to elevation
- route progress

This stage is critical.

### Stage 4 — 3D World

Implement:

- Three.js canvas
- terrain
- road mesh from route
- sky
- lighting
- simple scenery
- camera placeholder

Verify visual alignment between road and route.

### Stage 5 — Rider and Camera

Implement:

- simple cyclist model
- movement along route
- wheel animation
- pedal animation
- chase camera
- first-person camera
- camera toggle

### Stage 6 — Physics and Input

Implement:

- Bluetooth trainer power input
- simulator fallback power input
- cycling physics
- speed calculation
- gradient effect
- distance integration
- pause/resume

At the end of this stage, the app must be rideable with real trainer power when available and simulator power otherwise.

### Stage 7 — HUD and Telemetry

Implement:

- real-time HUD
- telemetry state
- elapsed time
- distance
- speed
- power
- cadence
- gradient
- progress

### Stage 8 — Ride Completion

Implement:

- route finish detection
- ride summary
- restart ride
- return home

### Stage 9 — Performance Pass

Implement:

- instanced scenery
- FPS/debug overlay
- mobile rendering sanity
- basic quality controls if needed

Do not add new product features in this stage.

Only improve reliability and frame rate.

---

## 26. Testing Priorities

Test the core engine.

### 26.1 Bluetooth and Parser Tests

- unsupported browser is detected
- insecure context is detected
- cancelled device request is handled
- FTMS Indoor Bike Data parser extracts power from fixture packets
- FTMS Indoor Bike Data parser extracts cadence from fixture packets where present
- CPS parser extracts instantaneous power from fixture packets
- stale telemetry warning triggers after timeout
- disconnect state is surfaced correctly
- simulator fallback works when Bluetooth is unavailable

### 26.2 Physics Tests

- zero power causes deceleration
- higher power increases speed
- positive gradient reduces speed
- negative gradient increases speed
- distance increases over time
- rider stops at route completion

### 26.3 Route Tests

- distance lookup returns valid position
- gradient lookup works
- elevation lookup works
- route progress reaches 100%

### 26.4 Input Tests

- trainer telemetry changes rider power
- simulator power increases
- simulator power decreases
- number keys set power
- pause stops simulation
- resume restarts simulation

Do not write tests for non-MVP systems.

---

## 27. Success Criteria

The MVP is successful when:

- a user can open the static app
- a user can connect a BLE smart trainer in a supported browser
- live trainer power reaches the simulation loop
- a user can start a ride
- a user can use simulator fallback if Bluetooth is unavailable
- a user can increase/decrease simulator power
- the cyclist moves faster/slower based on power
- climbs and descents affect speed
- the road/world moves smoothly
- live telemetry is readable
- the route can be completed
- a basic ride summary is shown

This is the core.

Do not add secondary product features until this works.

---

## 28. First Deliverable From the Coding Agent

Start by producing a technical implementation plan for the strict MVP only.

Include:

1. architecture overview
2. minimal directory structure
3. dependency list
4. Web Bluetooth trainer architecture
5. FTMS/CPS parsing design
6. connection UX and fallback behavior
7. route engine design
8. road generation design
9. terrain/world rendering plan
10. rider/camera plan
11. physics model
12. simulation loop design
13. telemetry/HUD design
14. custom CSS MVP plan
15. stage-by-stage implementation plan

Then begin implementation stage by stage.

Do not generate unrelated platform features.

Do not add gamification.

Do not add social features.

Do not add non-cycling platform features.

Bluetooth smart-trainer connectivity is part of the MVP and must be implemented before the MVP is considered proven.

Focus 100% on:

```text
Web Bluetooth smart-trainer connectivity
riding simulation
3D world rendering
route geometry
performance
telemetry
```
