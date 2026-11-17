import type { RiderState } from "@/types";
import { RideEngine } from "../loop/engine";

export const localOpponents = [
  { id: "ari", name: "Ari", watts: 150, color: "#5fc4dd", lane: -2 },
  { id: "blake", name: "Blake", watts: 190, color: "#e4bf51", lane: -1 },
  { id: "casey", name: "Casey", watts: 230, color: "#aa8adb", lane: 1 },
  { id: "drew", name: "Drew", watts: 280, color: "#65c491", lane: 2 },
] as const;

export interface RaceRider {
  id: string;
  name: string;
  isPlayer: boolean;
  color: string;
  lane: number;
  state: RiderState;
  finishTimeSeconds?: number;
  eliminatedAtSeconds?: number;
}
export interface RaceStanding extends RaceRider {
  rank: number;
  gapMeters: number;
}

/** Local opponents share the player's fixed simulation clock, never wall time or BLE. */
export class LocalRace {
  private steps: number;
  private opponents: { rider: RaceRider; engine: RideEngine; watts: number }[];

  constructor(private player: RideEngine) {
    this.steps = Math.floor(player.state.elapsedSeconds * 60 + 1e-6);
    this.opponents = localOpponents.map((profile) => {
      const engine = new RideEngine(player.course, { ...player.config });
      engine.seek(player.state.distanceMeters);
      engine.state.elapsedSeconds = player.state.elapsedSeconds;
      return {
        engine,
        watts: profile.watts,
        rider: {
          ...profile,
          isPlayer: false,
          state: engine.state,
          finishTimeSeconds: engine.completed
            ? engine.state.elapsedSeconds
            : undefined,
        },
      };
    });
  }

  advance() {
    const targetSteps = Math.floor(
      this.player.state.elapsedSeconds * 60 + 1e-6,
    );
    // The final player step can be fractional; let opponents reach that same instant.
    const finalFraction = this.player.completed
      ? this.player.state.elapsedSeconds - targetSteps / 60
      : 0;
    while (this.steps < targetSteps) {
      this.step(1 / 60);
      this.steps++;
    }
    if (finalFraction > 1e-8 && !this.finalStepTaken) {
      this.step(finalFraction);
      this.finalStepTaken = true;
    }
  }
  private finalStepTaken = false;

  private step(dt: number) {
    this.opponents.forEach(({ engine, watts, rider }, index) => {
      if (engine.completed || rider.eliminatedAtSeconds !== undefined) return;
      const state = engine.state;
      const progress = state.distanceMeters / engine.course.distanceMeters;
      const variation =
        Math.sin(state.elapsedSeconds / 17 + index * 1.7) * 0.06;
      const climb = Math.max(0, Math.min(0.08, state.gradient));
      const sprint = progress > 0.9 ? 0.15 : 0;
      const effort = watts * (1 + variation + climb + sprint);
      engine.step(dt, effort, 78 + index * 4 + variation * 30);
      if (engine.completed) rider.finishTimeSeconds = state.elapsedSeconds;
    });
  }

  eliminateRiders(ids: readonly string[]) {
    for (const { rider } of this.opponents) {
      if (
        ids.includes(rider.id) &&
        rider.finishTimeSeconds === undefined &&
        rider.eliminatedAtSeconds === undefined
      )
        rider.eliminatedAtSeconds = this.player.state.elapsedSeconds;
    }
  }

  get riders(): RaceRider[] {
    return this.opponents.map(({ rider }) => ({
      ...rider,
      state: { ...rider.state },
    }));
  }

  get standings(): RaceStanding[] {
    const player: RaceRider = {
      id: "player",
      name: "You",
      isPlayer: true,
      color: "#f5cf82",
      lane: 0,
      state: { ...this.player.state },
      finishTimeSeconds: this.player.completed
        ? this.player.state.elapsedSeconds
        : undefined,
    };
    const riders = [player, ...this.riders].sort((a, b) => {
      const aOut = a.eliminatedAtSeconds !== undefined;
      const bOut = b.eliminatedAtSeconds !== undefined;
      if (aOut !== bOut) return aOut ? 1 : -1;
      if (
        a.finishTimeSeconds !== undefined ||
        b.finishTimeSeconds !== undefined
      ) {
        if (a.finishTimeSeconds === undefined) return 1;
        if (b.finishTimeSeconds === undefined) return -1;
        if (a.finishTimeSeconds !== b.finishTimeSeconds)
          return a.finishTimeSeconds - b.finishTimeSeconds;
      }
      return (
        b.state.distanceMeters - a.state.distanceMeters ||
        Number(b.isPlayer) - Number(a.isPlayer) ||
        a.id.localeCompare(b.id)
      );
    });
    const lead = riders[0].state.distanceMeters;
    return riders.map((rider, index) => ({
      ...rider,
      rank: index + 1,
      gapMeters: Math.max(0, lead - rider.state.distanceMeters),
    }));
  }
}
