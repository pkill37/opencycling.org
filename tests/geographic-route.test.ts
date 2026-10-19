import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { parseGpx, packageGpx } from "../src/game/route/gpx";
import {
  buildRoute,
  validatePackage,
  type RoutePackage,
} from "../src/game/route/package";
import { lookupRoute } from "../src/game/route/route";
import {
  stepPhysics,
  defaultPhysicsConfig as defaults,
} from "../src/game/physics/cycling";
import { RideEngine } from "../src/game/loop/engine";
import { brakingEnvelope } from "../src/game/physics/cornering";

const source: RoutePackage["source"] = {
  provider: "Test",
  acquired: "2026-10-16",
  license: "CC0",
  attribution: "Synthetic analytical fixture",
  horizontalDatum: "WGS84",
  verticalDatum: "Synthetic",
  resolutionMeters: null,
};
test("offline CLI produces a loadable package and refuses to overwrite output", async () => {
  const directory = await mkdtemp(join(tmpdir(), "openride-route-"));
  try {
    const input = join(directory, "input.gpx"),
      metadata = join(directory, "source.json"),
      output = join(directory, "route.json");
    await writeFile(
      input,
      '<gpx><trk><name>CLI fixture</name><trkseg><trkpt lat="45" lon="6"><ele>700</ele></trkpt><trkpt lat="45.001" lon="6"><ele>710</ele></trkpt></trkseg></trk></gpx>',
    );
    await writeFile(metadata, JSON.stringify(source));
    const args = [
      "--import",
      "tsx",
      "scripts/build-route.ts",
      input,
      metadata,
      output,
      "0",
      "0",
    ];
    execFileSync(process.execPath, args, { stdio: "pipe" });
    const route = buildRoute(JSON.parse(await readFile(output, "utf8")));
    assert.equal(route.name, "CLI fixture");
    assert.equal(route.elevationGainMeters, 10);
    assert.throws(() =>
      execFileSync(process.execPath, args, { stdio: "pipe" }),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
function fixture(elevation = 0) {
  return packageGpx(
    {
      name: "Analytical fixture",
      segments: [
        Array.from({ length: 101 }, (_, i) => ({
          latitude: 45 + i * 0.0001,
          longitude: 6,
          elevation: i * elevation,
        })),
      ],
    },
    0,
    source,
  );
}
test("metric geometry has exact rendered slope and reproducible road length/gain", () => {
  const course = buildRoute(fixture(1));
  assert.ok(
    Math.abs(course.distanceMeters - Math.hypot(1111.9508, 100)) < 0.01,
  );
  assert.equal(course.elevationGainMeters, 100);
  const p = lookupRoute(course.distanceMeters / 2, course);
  assert.ok(Math.abs(p.elevationMeters - 50) < 1e-6);
  assert.ok(Math.abs(p.gradient - 100 / 1111.9508) < 1e-6);
  assert.ok(p.curvature < 1e-8);
  assert.equal(lookupRoute(Infinity, course).progress, 1);
});
test("validation rejects gaps, duplicates, invalid coordinates and false curated claims", () => {
  const p = fixture();
  for (const alter of [
    (p: RoutePackage) => {
      p.samples[2].latitude = 91;
    },
    (p: RoutePackage) => {
      p.samples[2] = { ...p.samples[1] };
    },
    (p: RoutePackage) => {
      p.samples[2].latitude += 0.1;
    },
    (p: RoutePackage) => {
      p.samples[2].elevation = 1000;
    },
    (p: RoutePackage) => {
      p.loop = true;
    },
  ]) {
    const copy = structuredClone(p);
    alter(copy);
    assert.throws(() => buildRoute(copy));
  }
  assert.throws(() =>
    validatePackage({ ...p, validation: { status: "passed", warnings: [] } }),
  );
});
test("GPX keeps explicit tracks, segments, direction and namespace; missing elevation requires consent", () => {
  const tracks = parseGpx(
    `<g:gpx xmlns:g="urn:gpx"><g:trk><g:name>Crossing</g:name><g:trkseg><g:trkpt lat="45" lon="6"/><g:trkpt lat="45.001" lon="6"/></g:trkseg><g:trkseg><g:trkpt lat="46" lon="6"/></g:trkseg></g:trk><g:trk><g:trkseg/></g:trk></g:gpx>`,
  );
  assert.equal(tracks.length, 2);
  assert.equal(tracks[0].segments.length, 2);
  assert.throws(() => packageGpx(tracks[0], 0, source), /Missing elevation/);
  const p = packageGpx(tracks[0], 0, source, true);
  assert.deepEqual(
    p.samples.map((s) => s.elevation),
    [0, 0],
  );
  assert.equal(p.samples[0].latitude, 45);
  assert.match(p.validation.warnings.join(" "), /FLAT DEGRADED/);
  assert.throws(() => parseGpx("<!DOCTYPE gpx><gpx/>"));
  assert.throws(() => parseGpx("<gpx>"));
});
test("analytical equilibrium on flat and constant grades", () => {
  for (const grade of [0, 0.07, -0.01]) {
    const speed = 10,
      mass = defaults.riderMassKg + defaults.bikeMassKg,
      theta = Math.atan(grade);
    const resistance =
      mass *
        defaults.gravity *
        (Math.sin(theta) + defaults.crr * Math.cos(theta)) +
      0.5 * defaults.airDensity * defaults.cda * speed ** 2;
    const power = (resistance * speed) / defaults.drivetrainEfficiency;
    assert.ok(
      Math.abs(stepPhysics(speed, power, grade, 1 / 60).speed - speed) < 1e-10,
    );
  }
});
test("wind projection preserves tailwind sign and wheel power avoids drivetrain loss", () => {
  assert.ok(
    stepPhysics(5, 0, 0, 0.1, { ...defaults, windNorth: 20 }).speed > 5,
  );
  assert.ok(
    stepPhysics(5, 0, 0, 0.1, { ...defaults, windNorth: 20 }, Math.PI).speed <
      5,
  );
  assert.ok(
    stepPhysics(5, 250, 0, 0.1, { ...defaults, powerLocation: "wheel" }).speed >
      stepPhysics(5, 250, 0, 0.1).speed,
  );
});
test("lossless coasting conserves gravitational plus kinetic energy within integration tolerance", () => {
  const config = { ...defaults, crr: 0, cda: 0 };
  const grade = -0.05,
    dt = 1 / 60,
    mass = config.riderMassKg + config.bikeMassKg;
  let speed = 3,
    distance = 0;
  for (let i = 0; i < 600; i++) {
    const next = stepPhysics(speed, 0, grade, dt, config);
    speed = next.speed;
    distance += next.distance;
  }
  const heightLost = -Math.sin(Math.atan(grade)) * distance;
  assert.ok(
    Math.abs(
      0.5 * mass * (speed ** 2 - 9) - mass * config.gravity * heightLost,
    ) < 1e-6,
  );
});
test("lookahead braking slows before a corner with bounded force and accumulated loss", () => {
  const course = buildRoute(fixture());
  course.points[30].curvature = 0.2;
  const envelope = brakingEnvelope(course, defaults);
  assert.ok(envelope[20] < defaults.maxSpeedMetersPerSecond);
  const engine = new RideEngine(course);
  engine.state.speedMetersPerSecond = 20;
  let brakedBefore = false;
  for (
    let i = 0;
    i < 3000 && engine.state.distanceMeters < course.points[30].distanceMeters;
    i++
  ) {
    engine.step(1 / 60, 0, 0);
    if (
      engine.state.braking &&
      engine.state.distanceMeters < course.points[29].distanceMeters
    )
      brakedBefore = true;
    assert.ok(engine.state.accelerationMetersPerSecondSq > -5);
  }
  assert.ok(brakedBefore);
  assert.ok(engine.state.speedMetersPerSecond < 3.3);
  assert.ok((engine.state.brakingEnergyJoules ?? 0) > 0);
});
