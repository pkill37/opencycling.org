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
};
export function stepPhysics(
  speed: number,
  power: number,
  gradient: number,
  dt: number,
  config = defaultPhysicsConfig,
) {
  const mass = config.riderMassKg + config.bikeMassKg,
    theta = Math.atan(gradient);
  const drive = Math.min(
    (Math.max(0, power) * config.drivetrainEfficiency) / Math.max(speed, 1),
    config.maxDriveForce,
  );
  const resistance =
    mass * config.gravity * Math.sin(theta) +
    config.crr * mass * config.gravity * Math.cos(theta) +
    0.5 * config.airDensity * config.cda * speed * speed;
  const acceleration = (drive - resistance) / mass;
  const nextSpeed = Math.max(
    0,
    Math.min(config.maxSpeedMetersPerSecond, speed + acceleration * dt),
  );
  return {
    speed: nextSpeed,
    acceleration,
    distance: (speed + nextSpeed) * 0.5 * dt,
  };
}
