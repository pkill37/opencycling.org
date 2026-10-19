import type { CyclingRoute, PhysicsConfig } from "../../types";

// Backward squared-speed envelope. Excludes drag/rolling assistance, so braking
// planning is conservative in still air; adverse tailwind is accounted for.
export function brakingEnvelope(route: CyclingRoute, config: PhysicsConfig) {
  const mass = config.riderMassKg + config.bikeMassKg;
  const wind = Math.hypot(config.windEast, config.windNorth);
  const windAcceleration =
    (0.5 * config.airDensity * config.cda * wind * wind) / mass;
  const lateral = Math.min(
    config.lateralAcceleration,
    config.grip * config.gravity,
  );
  const limits = route.points.map((p) =>
    Math.min(
      config.maxSpeedMetersPerSecond,
      Math.sqrt(lateral / Math.max(Math.abs(p.curvature ?? 0), 1e-10)),
    ),
  );
  // A corner's constraint also applies over the segment immediately before it,
  // matching the conservative curvature lookup used by the HUD.
  for (let i = 0; i < limits.length - 1; i++)
    limits[i] = Math.min(limits[i], limits[i + 1]);
  for (let i = limits.length - 2; i >= 0; i--) {
    const a = route.points[i],
      b = route.points[i + 1];
    const deceleration = Math.max(
      0,
      config.brakingDeceleration +
        config.gravity * Math.sin(Math.atan(a.gradient)) -
        windAcceleration,
    );
    limits[i] = Math.min(
      limits[i],
      Math.sqrt(
        limits[i + 1] ** 2 +
          2 * deceleration * (b.distanceMeters - a.distanceMeters),
      ),
    );
  }
  return limits;
}
