export interface TrainerTelemetrySample {
  source: "ftms" | "cycling-power" | "heart-rate" | "simulator";
  timestampMs: number;
  powerWatts?: number;
  cadenceRpm?: number;
  speedMetersPerSecond?: number;
  heartRateBpm?: number;
  raw?: unknown;
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
}
export interface SimulatorTrainerSource extends TrainerSource {
  increasePower(): void;
  decreasePower(): void;
  sprint(): void;
  setPower(watts: number): void;
}
