import type { RiderState } from "@/types";

export interface ZombieState {
  id: number;
  distanceMeters: number;
  gapMeters: number;
}

export interface ZombiesSnapshot {
  active: boolean;
  caught: boolean;
  survivedSeconds: number;
  score: number;
  nearestGapMeters: number;
  threat: "safe" | "warning" | "danger" | "caught";
  zombies: ZombieState[];
}

const config = {
  startGapMeters: 80,
  catchDistanceMeters: 6,
  despawnBehindMeters: 220,
  spawnEverySeconds: 45,
  baseSpeedMetersPerSecond: 5.5,
  maxSpeedMetersPerSecond: 11,
  speedRampSeconds: 300,
  maxZombies: 4,
};

const emptySnapshot: ZombiesSnapshot = {
  active: false,
  caught: false,
  survivedSeconds: 0,
  score: 0,
  nearestGapMeters: Infinity,
  threat: "safe",
  zombies: [],
};

export class ZombiesMode {
  private zombies: ZombieState[] = [];
  private elapsedSeconds = 0;
  private nextSpawnSeconds = config.spawnEverySeconds;
  private nextId = 1;
  caught = false;

  constructor(playerDistanceMeters = 0) {
    this.spawn(playerDistanceMeters - config.startGapMeters);
  }

  get snapshot(): ZombiesSnapshot {
    const nearestGapMeters = this.zombies.reduce(
      (best, zombie) => Math.min(best, zombie.gapMeters),
      Infinity,
    );
    return {
      active: true,
      caught: this.caught,
      survivedSeconds: this.elapsedSeconds,
      score: Math.max(0, Math.floor(this.elapsedSeconds * 10)),
      nearestGapMeters,
      threat: this.caught
        ? "caught"
        : nearestGapMeters < 18
          ? "danger"
          : nearestGapMeters < 40
            ? "warning"
            : "safe",
      zombies: this.zombies.map((zombie) => ({ ...zombie })),
    };
  }

  advance(dt: number, rider: RiderState) {
    if (this.caught) return;
    const safeDt = Math.min(Math.max(0, dt), 0.25);
    this.elapsedSeconds += safeDt;
    while (
      this.elapsedSeconds >= this.nextSpawnSeconds &&
      this.zombies.length < config.maxZombies
    ) {
      this.spawn(
        rider.distanceMeters - config.startGapMeters - this.zombies.length * 25,
      );
      this.nextSpawnSeconds += config.spawnEverySeconds;
    }
    const ramp = Math.min(1, this.elapsedSeconds / config.speedRampSeconds),
      speed =
        config.baseSpeedMetersPerSecond +
        (config.maxSpeedMetersPerSecond - config.baseSpeedMetersPerSecond) *
          ramp;
    this.zombies = this.zombies
      .map((zombie) => {
        const distanceMeters = zombie.distanceMeters + speed * safeDt,
          gapMeters = rider.distanceMeters - distanceMeters;
        return { ...zombie, distanceMeters, gapMeters };
      })
      .filter((zombie) => zombie.gapMeters < config.despawnBehindMeters);
    if (!this.zombies.length)
      this.spawn(rider.distanceMeters - config.startGapMeters);
    this.caught = this.zombies.some(
      (zombie) => zombie.gapMeters <= config.catchDistanceMeters,
    );
  }

  private spawn(distanceMeters: number) {
    this.zombies.push({
      id: this.nextId++,
      distanceMeters,
      gapMeters: config.startGapMeters,
    });
  }
}

export const noZombies: ZombiesSnapshot = emptySnapshot;
