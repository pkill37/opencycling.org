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
  private presentationTime = 0;
  // Playback can advance on every animation frame without changing fixed-step physics.
  get renderElapsedSeconds() {
    return this.completed ? this.state.elapsedSeconds : this.presentationTime;
  }
  private speedLimits: number[];
  private gear = 11;
  get selectedGear() {
    return this.gear;
  }
  get trainerControlActive() {
    return (
      this.trainerControl &&
      !this.paused &&
      !this.completed &&
      this.source?.getState() === "connected" &&
      Boolean(this.source.controlCapabilities?.supported)
    );
  }
  shiftGear(direction: -1 | 1) {
    if (!this.trainerControlActive) return;
    this.gear = Math.max(1, Math.min(21, this.gear + direction));
  }
  private controlRequested = false;
  private controlGeneration = 0;
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
    if (paused && (this.trainerControl || this.controlRequested)) {
      this.enableTrainerControl(false);
      const control = this.source as
        (TrainerSource & Partial<TrainerControlSource>) | undefined;
      void control?.releaseControl?.();
    }
  }
  seek(distanceMeters: number) {
    const distance = Math.max(
      0,
      Math.min(distanceMeters, this.course.distanceMeters),
    );
    const position = lookupRoute(distance, this.course);
    this.state.distanceMeters = distance;
    this.state.elevationMeters = position.elevationMeters;
    this.state.gradient = position.gradient;
    this.state.braking = false;
    this.state.targetSpeedMetersPerSecond = undefined;
    this.completed = distance >= this.course.distanceMeters;
    if (this.completed) this.state.speedMetersPerSecond = 0;
    this.accumulator = 0;
    this.presentationTime = this.state.elapsedSeconds;
  }
  enableTrainerControl(enabled: boolean) {
    this.controlGeneration++;
    this.controlRequested = false;
    this.trainerControl = enabled;
    this.lastControlMs = -Infinity;
    if (enabled) this.controlWarning = "";
  }
  async requestTrainerControl(): Promise<boolean> {
    if (this.trainerControlActive) return true;
    if (this.controlRequested) return false;
    const control = this.source as
      (TrainerSource & Partial<TrainerControlSource>) | undefined;
    if (this.paused || this.completed || control?.getState() !== "connected")
      throw new Error("Resume the ride with a connected trainer first.");
    if (!control.controlCapabilities?.supported || !control.requestControl)
      throw new Error(
        "This trainer connection does not support resistance control.",
      );
    const generation = ++this.controlGeneration;
    this.controlRequested = true;
    try {
      await control.requestControl();
      if (generation !== this.controlGeneration) return false;
      if (this.paused || this.completed || control.getState() !== "connected") {
        this.enableTrainerControl(false);
        await control.releaseControl?.();
        return false;
      }
      this.enableTrainerControl(true);
      this.warning = "";
      return true;
    } catch (error) {
      if (generation !== this.controlGeneration) return false;
      throw error;
    } finally {
      if (generation === this.controlGeneration) this.controlRequested = false;
    }
  }
  setControlWarning(message: string) {
    this.controlWarning = message;
    this.warning = message;
  }
  attach(source: TrainerSource, now = Date.now()) {
    this.enableTrainerControl(false);
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
    // Keep the displayed clock steady across pause/resume, which clears the
    // accumulator. The simulation catches up within one fixed step.
    this.presentationTime = Math.max(
      this.presentationTime,
      this.state.elapsedSeconds + this.accumulator,
    );
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
    if (this.trainerControl || this.controlRequested) {
      const control = this.source as
        (TrainerSource & Partial<TrainerControlSource>) | undefined;
      void control?.releaseControl?.();
    }
    this.enableTrainerControl(false);
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }
  private publishTrainerControl(
    gradient: number,
    speed: number,
    heading: number,
  ) {
    if (!this.trainerControl || this.controlBusy || !this.source) return;
    if (!this.trainerControlActive) {
      this.enableTrainerControl(false);
      this.setControlWarning(
        "Trainer control unavailable — " +
          ((this.source as TrainerSource & Partial<TrainerControlSource>)
            .controlStatusMessage ||
            "trainer disconnected or control permission lost; using virtual resistance only."),
      );
      return;
    }
    const generation = this.controlGeneration;
    const isCurrent = () =>
      generation === this.controlGeneration && this.trainerControlActive;
    const control = this.source as TrainerSource &
      Partial<TrainerControlSource>;
    const capabilities = control.controlCapabilities;
    if (!capabilities?.supported) return;
    const now = Date.now();
    if (now - this.lastControlMs < 250) return;
    this.lastControlMs = now;
    this.controlBusy = true;
    const gearOffset = this.gear - 11;
    const range = capabilities.resistanceRange ?? {
      min: 0,
      max: 100,
      step: 0.1,
    };
    const targetResistance = clampResistance(
      resistanceForGrade(gradient, speed, this.config, capabilities) +
        gearOffset * 0.02 * (range.max - range.min),
      capabilities,
    );
    const sendResistance = async () => {
      if (!isCurrent()) return;
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
      if (isCurrent()) this.lastResistance = next;
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
            gradePercent: gradient * 100 + gearOffset,
            rollingResistanceCoefficient: this.config.crr,
            windResistanceCoefficient: this.config.cda * this.config.airDensity,
          });
          return;
        } catch (error) {
          if (!isCurrent()) return;
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
        if (!isCurrent()) return;
        this.enableTrainerControl(false);
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
