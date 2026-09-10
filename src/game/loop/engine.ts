import type { RiderState, RideSummary, CyclingRoute } from "../../types";
import type {
  TrainerSource,
  TrainerTelemetrySample,
} from "../../bluetooth/types";
import { route, lookupRoute } from "../route/route";
import { stepPhysics } from "../physics/cycling";
export class RideEngine {
  state: RiderState = {
    distanceMeters: 0,
    speedMetersPerSecond: 0,
    accelerationMetersPerSecondSq: 0,
    powerWatts: 0,
    cadenceRpm: 0,
    elevationMeters: 0,
    gradient: 0,
    elapsedSeconds: 0,
  };
  paused = false;
  completed = false;
  warning = "";
  source?: TrainerSource;
  private samples = new Map<string, TrainerTelemetrySample>();
  private fieldTimes = new Map<string, number>();
  private unsubscribe?: () => void;
  private connectedAt = 0;
  private energy = 0;
  private peak = 0;
  private gain = 0;
  private accumulator = 0;
  constructor(public course: CyclingRoute = route) {
    const p = lookupRoute(0, course);
    this.state.elevationMeters = p.elevationMeters;
    this.state.gradient = p.gradient;
  }
  setPaused(paused: boolean) {
    this.paused = paused;
    if (paused) this.accumulator = 0;
  }
  attach(source: TrainerSource, now = Date.now()) {
    this.unsubscribe?.();
    this.samples.clear();
    this.fieldTimes.clear();
    this.source = source;
    this.connectedAt = now;
    this.warning = "";
    this.unsubscribe = source.subscribe((s) => this.ingest(s));
  }
  ingest(s: TrainerTelemetrySample) {
    const clean = { ...s };
    for (const field of [
      "powerWatts",
      "cadenceRpm",
      "speedMetersPerSecond",
    ] as const) {
      const v = s[field];
      if (v !== undefined && Number.isFinite(v)) {
        clean[field] = Math.max(0, v);
        this.fieldTimes.set(`${s.source}:${field}`, s.timestampMs);
      } else delete clean[field];
    }
    this.samples.set(s.source, { ...this.samples.get(s.source), ...clean });
  }
  input(now: number) {
    const real = this.source?.kind !== "simulator",
      order = real ? ["ftms", "cycling-power"] : ["simulator"];
    const select = (field: "powerWatts" | "cadenceRpm") => {
      for (const key of order) {
        const sample = this.samples.get(key),
          time = this.fieldTimes.get(`${key}:${field}`);
        if (
          sample?.[field] !== undefined &&
          time !== undefined &&
          now - time <= 3000
        )
          return { value: sample[field], age: now - time };
      }
      return undefined;
    };
    let power = select("powerWatts");
    if (!power) {
      for (const key of order) {
        const sample = this.samples.get(key),
          time = this.fieldTimes.get(`${key}:powerWatts`);
        if (sample?.powerWatts !== undefined && time !== undefined) {
          const age = now - time;
          if (!power || age < power.age)
            power = { value: sample.powerWatts, age };
        }
      }
    }
    const age = power?.age ?? now - this.connectedAt;
    this.warning = real
      ? age > 10000
        ? "Trainer power lost. Reconnect or use the simulator."
        : age > 3000
          ? "Trainer power is stale — slowing down."
          : !power
            ? "Waiting for trainer power. Missing power? Try Cycling Power mode or the simulator."
            : ""
      : "";
    if (real && age > 10000) this.paused = true;
    const watts =
      (power?.value ?? 0) *
      (age > 3000 ? Math.max(0, 1 - (age - 3000) / 7000) : 1);
    return {
      power: watts,
      cadence:
        select("cadenceRpm")?.value ??
        (watts ? Math.min(120, 50 + watts * 0.14) : 0),
    };
  }
  advance(delta: number, now = Date.now()) {
    const input = this.input(now);
    if (this.paused || this.completed) {
      this.accumulator = 0;
      return;
    }
    this.accumulator += Math.min(Math.max(0, delta), 0.25);
    while (this.accumulator >= 1 / 60 && !this.completed) {
      this.step(1 / 60, input.power, input.cadence);
      this.accumulator -= 1 / 60;
    }
  }
  step(dt: number, power: number, cadence: number) {
    if (this.paused || this.completed) return;
    const s = this.state,
      p = lookupRoute(s.distanceMeters, this.course),
      next = stepPhysics(s.speedMetersPerSecond, power, p.gradient, dt);
    const remaining = this.course.distanceMeters - s.distanceMeters,
      fraction = next.distance > remaining ? remaining / next.distance : 1,
      used = dt * fraction;
    s.distanceMeters = Math.min(
      this.course.distanceMeters,
      s.distanceMeters + next.distance,
    );
    const position = lookupRoute(s.distanceMeters, this.course);
    this.gain += Math.max(0, position.elevationMeters - s.elevationMeters);
    this.energy += power * used;
    this.peak = Math.max(this.peak, power);
    Object.assign(s, {
      speedMetersPerSecond: next.speed,
      accelerationMetersPerSecondSq: next.acceleration,
      powerWatts: power,
      cadenceRpm: cadence,
      elevationMeters: position.elevationMeters,
      gradient: position.gradient,
      elapsedSeconds: s.elapsedSeconds + used,
    });
    if (s.distanceMeters >= this.course.distanceMeters) {
      this.completed = true;
      s.speedMetersPerSecond = 0;
    }
  }
  summary(): RideSummary {
    const s = this.state;
    return {
      routeId: this.course.id,
      distanceMeters: s.distanceMeters,
      elapsedSeconds: s.elapsedSeconds,
      averageSpeedMetersPerSecond: s.elapsedSeconds
        ? s.distanceMeters / s.elapsedSeconds
        : 0,
      averagePowerWatts: s.elapsedSeconds ? this.energy / s.elapsedSeconds : 0,
      maxPowerWatts: this.peak,
      elevationGainMeters: this.gain,
    };
  }
  dispose() {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }
}
