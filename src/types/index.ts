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
export interface TelemetrySample extends Omit<
  RiderState,
  "accelerationMetersPerSecondSq"
> {
  timestampMs: number;
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
