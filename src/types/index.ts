export interface RoutePoint {
  x: number;
  y: number;
  z: number;
  distanceMeters: number;
  elevationMeters: number;
  gradient: number;
  latitude?: number;
  longitude?: number;
  curvature?: number;
}
export interface CyclingRoute {
  id: string;
  name: string;
  distanceMeters: number;
  elevationGainMeters: number;
  loop: boolean;
  points: RoutePoint[];
  metadata?: {
    version: string;
    context: string;
    quality: string;
    warnings: string[];
    attribution: string;
  };
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
  windEast: number;
  windNorth: number;
  powerLocation: "crank" | "wheel";
  lateralAcceleration: number;
  grip: number;
  brakingDeceleration: number;
  automaticBraking: boolean;
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
  braking?: boolean;
  brakingEnergyJoules?: number;
  targetSpeedMetersPerSecond?: number;
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
