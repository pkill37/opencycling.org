import type { SimulatorTrainerSource, TrainerTelemetrySample } from "../types";
export class SimulatorSource implements SimulatorTrainerSource {
  readonly id = "simulator";
  readonly label = "Virtual trainer";
  readonly kind = "simulator" as const;
  power = 150;
  private timer?: ReturnType<typeof setInterval>;
  private callbacks = new Set<(s: TrainerTelemetrySample) => void>();
  getState() {
    return this.timer ? ("connected" as const) : ("idle" as const);
  }
  async connect() {
    if (!this.timer) {
      this.emit();
      this.timer = setInterval(() => this.emit(), 100);
    }
  }
  async disconnect() {
    clearInterval(this.timer);
    this.timer = undefined;
  }
  subscribe(cb: (s: TrainerTelemetrySample) => void) {
    this.callbacks.add(cb);
    return () => {
      this.callbacks.delete(cb);
    };
  }
  setPower(w: number) {
    this.power = Math.max(0, Math.min(1500, w));
    this.emit();
  }
  increasePower() {
    this.setPower(this.power + 25);
  }
  decreasePower() {
    this.setPower(this.power - 25);
  }
  sample(now = Date.now()): TrainerTelemetrySample {
    const power = this.power;
    return {
      source: "simulator",
      timestampMs: now,
      powerWatts: power,
      cadenceRpm: power ? Math.min(120, 50 + power * 0.14) : 0,
    };
  }
  private emit() {
    const s = this.sample();
    this.callbacks.forEach((cb) => cb(s));
  }
}
