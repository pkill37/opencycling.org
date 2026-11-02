import type {
  RiderState,
  RideSummary,
  CyclingRoute,
  PhysicsConfig,
} from "../../types";
import type {
  TrainerSource,
  TrainerTelemetrySample,
  TrainerControlSource,
} from "../../bluetooth/types";
import {
  clampResistance,
  resistanceForGrade,
} from "../../bluetooth/ftms-control";
import { lookupRoute } from "../route/route";
import { stepPhysics, defaultPhysicsConfig } from "../physics/cycling";
import { brakingEnvelope } from "../physics/cornering";
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
  private speedLimits: number[];
  private trainerControl = false;
  private controlBusy = false;
  private lastControlMs = 0;
  private controlWarning = "";
  private lastResistance?: number;
  private simulationControlFailed = false;
  constructor(
    public course: CyclingRoute,
    public config: PhysicsConfig = { ...defaultPhysicsConfig },
  ) {
    this.speedLimits = brakingEnvelope(course, config);
    const p = lookupRoute(0, course);
    this.state.elevationMeters = p.elevationMeters;
    this.state.gradient = p.gradient;
  }
  setPaused(paused: boolean) {
    this.paused = paused;
    if (paused) this.accumulator = 0;
    if (paused && this.trainerControl) {
      this.trainerControl = false;
      const control = this.source as
        (TrainerSource & Partial<TrainerControlSource>) | undefined;
      void control?.releaseControl?.();
    }
  }
  enableTrainerControl(enabled: boolean) {
    this.trainerControl = enabled;
    if (enabled) this.controlWarning = "";
  }
  setControlWarning(message: string) {
    this.controlWarning = message;
    this.warning = message;
  }
  attach(source: TrainerSource, now = Date.now()) {
    this.unsubscribe?.();
    this.samples.clear();
    this.fieldTimes.clear();
    this.source = source;
    this.connectedAt = now;
    this.warning = "";
    this.controlWarning = "";
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
    const powerWarning = real
      ? age > 10000
        ? "Trainer power lost. Reconnect or use the simulator."
        : age > 3000
          ? "Trainer power is stale — slowing down."
          : !power
            ? "Waiting for trainer power. Missing power? Try Cycling Power mode or the simulator."
            : ""
      : "";
    this.warning = [this.controlWarning, powerWarning]
      .filter(Boolean)
      .join(" ");
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
      p = lookupRoute(s.distanceMeters, this.course);
    this.publishTrainerControl(p.gradient, s.speedMetersPerSecond, p.heading);
    const a = this.course.points[p.index],
      b = this.course.points[p.index + 1];
    const t =
      (s.distanceMeters - a.distanceMeters) /
      (b.distanceMeters - a.distanceMeters);
    const target = Math.sqrt(
      this.speedLimits[p.index] ** 2 * (1 - t) +
        this.speedLimits[p.index + 1] ** 2 * t,
    );
    const free = stepPhysics(
      s.speedMetersPerSecond,
      power,
      p.gradient,
      dt,
      this.config,
      p.heading,
    );
    const braking = this.config.automaticBraking && free.speed > target;
    const mass = this.config.riderMassKg + this.config.bikeMassKg;
    // Cut propulsion while braking. Brake force is bounded, never teleport speed.
    const coast = braking
      ? stepPhysics(
          s.speedMetersPerSecond,
          0,
          p.gradient,
          dt,
          this.config,
          p.heading,
        )
      : free;
    const force = braking
      ? mass *
        Math.min(
          this.config.brakingDeceleration,
          Math.max(0, (coast.speed - target) / dt),
        )
      : 0;
    const next = braking
      ? stepPhysics(
          s.speedMetersPerSecond,
          0,
          p.gradient,
          dt,
          this.config,
          p.heading,
          force,
        )
      : free;
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
      braking: force > 0,
      brakingEnergyJoules:
        (s.brakingEnergyJoules ?? 0) + force * next.distance * fraction,
      targetSpeedMetersPerSecond: target,
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
    if (this.trainerControl) {
      const control = this.source as
        (TrainerSource & Partial<TrainerControlSource>) | undefined;
      void control?.releaseControl?.();
    }
    this.trainerControl = false;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }
  private publishTrainerControl(
    gradient: number,
    speed: number,
    heading: number,
  ) {
    if (!this.trainerControl || this.controlBusy || !this.source) return;
    const control = this.source as TrainerSource &
      Partial<TrainerControlSource>;
    const capabilities = control.controlCapabilities;
    if (!capabilities?.supported) {
      if (control.controlStatusMessage) {
        this.trainerControl = false;
        this.setControlWarning(control.controlStatusMessage);
      }
      return;
    }
    const now = Date.now();
    if (now - this.lastControlMs < 250) return;
    this.lastControlMs = now;
    this.controlBusy = true;
    const targetResistance = resistanceForGrade(
      gradient,
      speed,
      this.config,
      capabilities,
    );
    const sendResistance = async () => {
      if (!control.setTargetResistance)
        throw new Error("Trainer resistance control is unavailable.");
      const range = capabilities.resistanceRange ?? {
        min: 0,
        max: 100,
        step: 0.1,
      };
      const previous = this.lastResistance ?? range.min;
      const maxDelta = Math.max(1, range.step);
      const smoothed = Math.max(
        previous - maxDelta,
        Math.min(previous + maxDelta, targetResistance),
      );
      const next = clampResistance(smoothed, capabilities);
      await control.setTargetResistance(next);
      this.lastResistance = next;
    };
    const operation = async () => {
      if (
        capabilities.supportsSimulationParameters &&
        control.setSimulationParameters &&
        !this.simulationControlFailed
      ) {
        try {
          await control.setSimulationParameters({
            windSpeedMetersPerSecond:
              this.config.windEast * Math.sin(heading) +
              this.config.windNorth * Math.cos(heading),
            gradePercent: gradient * 100,
            rollingResistanceCoefficient: this.config.crr,
            windResistanceCoefficient: this.config.cda * this.config.airDensity,
          });
          return;
        } catch (error) {
          if (!capabilities.supportsResistanceLevel) throw error;
          this.simulationControlFailed = true;
          this.logControlFallback(error);
        }
      }
      if (capabilities.supportsResistanceLevel) {
        await sendResistance();
        return;
      }
      throw new Error("Trainer control path is unsupported.");
    };
    void operation()
      .catch((error: unknown) => {
        this.trainerControl = false;
        this.setControlWarning(
          `Trainer control unavailable — virtual resistance only. ${error instanceof Error ? error.message : "Command rejected."}`,
        );
      })
      .finally(() => {
        this.controlBusy = false;
      });
  }
  private logControlFallback(error: unknown) {
    this.warning = `Simulation-grade trainer control rejected; using resistance-level fallback. ${error instanceof Error ? error.message : "Command rejected."}`;
  }
}
