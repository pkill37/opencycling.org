import type { PhysicsConfig } from "../../types";
export const defaultPhysicsConfig: PhysicsConfig = {
  riderMassKg: 75,
  bikeMassKg: 9,
  crr: 0.004,
  cda: 0.32,
  airDensity: 1.225,
  drivetrainEfficiency: 0.97,
  gravity: 9.80665,
  maxDriveForce: 900,
  maxSpeedMetersPerSecond: 30,
  windEast: 0,
  windNorth: 0,
  powerLocation: "crank",
  lateralAcceleration: 2,
  grip: 0.6,
  brakingDeceleration: 3,
  automaticBraking: true,
};
export function stepPhysics(
  speed: number,
  power: number,
  gradient: number,
  dt: number,
  config = defaultPhysicsConfig,
  heading = 0,
  brakingForce = 0,
) {
  const mass = config.riderMassKg + config.bikeMassKg,
    theta = Math.atan(gradient);
  const drive = Math.min(
    (Math.max(0, power) *
      (config.powerLocation === "wheel" ? 1 : config.drivetrainEfficiency)) /
      Math.max(speed, 1),
    config.maxDriveForce,
  );
  const relativeEast = speed * Math.sin(heading) - config.windEast;
  const relativeNorth = speed * Math.cos(heading) - config.windNorth;
  const along =
    relativeEast * Math.sin(heading) + relativeNorth * Math.cos(heading);
  const resistance =
    mass * config.gravity * Math.sin(theta) +
    config.crr * mass * config.gravity * Math.cos(theta) +
    0.5 *
      config.airDensity *
      config.cda *
      Math.hypot(relativeEast, relativeNorth) *
      along;
  const acceleration = (drive - resistance - brakingForce) / mass;
  const nextSpeed = Math.max(
    0,
    Math.min(config.maxSpeedMetersPerSecond, speed + acceleration * dt),
  );
  return {
    speed: nextSpeed,
    acceleration: (nextSpeed - speed) / dt,
    distance: (speed + nextSpeed) * 0.5 * dt,
  };
}
