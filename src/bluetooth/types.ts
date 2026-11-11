export interface TrainerTelemetrySample {
  source: "ftms" | "cycling-power" | "heart-rate" | "simulator";
  timestampMs: number;
  powerWatts?: number;
  cadenceRpm?: number;
  speedMetersPerSecond?: number;
  heartRateBpm?: number;
  raw?: unknown;
}
export interface TrainerControlCapabilities {
  supported: boolean;
  supportsSimulationParameters: boolean;
  supportsResistanceLevel: boolean;
  resistanceRange?: { min: number; max: number; step: number };
}
export interface SimulationParameters {
  windSpeedMetersPerSecond: number;
  gradePercent: number;
  rollingResistanceCoefficient: number;
  windResistanceCoefficient: number;
}
export interface TrainerControlSource {
  readonly controlCapabilities: TrainerControlCapabilities;
  readonly controlStatusMessage?: string;
  requestControl(): Promise<void>;
  setSimulationParameters(parameters: SimulationParameters): Promise<void>;
  setTargetResistance(level: number): Promise<void>;
  releaseControl(): Promise<void>;
}
export type TrainerConnectionState =
  | "unsupported"
  | "idle"
  | "requesting-device"
  | "connecting"
  | "discovering-services"
  | "subscribing"
  | "connected"
  | "disconnected"
  | "error";
export interface TrainerSource {
  readonly id: string;
  readonly label: string;
  readonly kind: "bluetooth-ftms" | "bluetooth-cps" | "simulator";
  getState(): TrainerConnectionState;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  subscribe(callback: (sample: TrainerTelemetrySample) => void): () => void;
  readonly controlCapabilities?: TrainerControlCapabilities;
}
export interface SimulatorTrainerSource extends TrainerSource {
  increasePower(): void;
  decreasePower(): void;
  setPower(watts: number): void;
}
