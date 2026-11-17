import type { RiderState } from "@/types";

export interface ZombieState {
  id: number;
  distanceMeters: number;
  gapMeters: number;
  feedingOnRiderId?: string;
  feedingSecondsRemaining?: number;
}

export interface ZombiesSnapshot {
  active: boolean;
  caught: boolean;
  survivedSeconds: number;
  score: number;
  nearestGapMeters: number;
  threat: "safe" | "warning" | "danger" | "caught";
  zombies: ZombieState[];
  eatenRiderIds: string[];
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
  eatenRiderIds: [],
};

export class ZombiesMode {
  private zombies: ZombieState[] = [];
  private elapsedSeconds = 0;
  private nextSpawnSeconds = config.spawnEverySeconds;
  private nextId = 1;
  caught = false;
  private eatenRiders = new Set<string>();

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
      eatenRiderIds: [...this.eatenRiders],
    };
  }

  advance(
    dt: number,
    rider: RiderState,
    opponents: readonly { id: string; distanceMeters: number }[] = [],
  ) {
    if (this.caught) return;
    const safeDt = Math.min(Math.max(0, dt), 0.25);
    if (safeDt === 0) return;
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
        const feeding = zombie.feedingSecondsRemaining ?? 0;
        const moveDt = Math.max(0, safeDt - feeding);
        let feedingSecondsRemaining = Math.max(0, feeding - safeDt);
        let feedingOnRiderId =
          feedingSecondsRemaining > 0 ? zombie.feedingOnRiderId : undefined;
        let distanceMeters = zombie.distanceMeters + speed * moveDt;
        const victim = opponents
          .filter(
            (opponent) =>
              opponent.id !== "player" &&
              !this.eatenRiders.has(opponent.id) &&
              opponent.distanceMeters >= zombie.distanceMeters - 2 &&
              opponent.distanceMeters <= distanceMeters + 2,
          )
          .sort(
            (a, b) =>
              a.distanceMeters - b.distanceMeters || a.id.localeCompare(b.id),
          )[0];
        const playerFirst =
          rider.distanceMeters - config.catchDistanceMeters <=
          (victim?.distanceMeters ?? Infinity) - 2;
        if (feedingSecondsRemaining === 0 && victim && !playerFirst) {
          this.eatenRiders.add(victim.id);
          distanceMeters = Math.max(
            zombie.distanceMeters,
            victim.distanceMeters - 1,
          );
          feedingOnRiderId = victim.id;
          feedingSecondsRemaining = 2.5;
        }
        return {
          ...zombie,
          distanceMeters,
          gapMeters: rider.distanceMeters - distanceMeters,
          feedingOnRiderId,
          feedingSecondsRemaining,
        };
      })
      .filter(
        (zombie) =>
          (zombie.feedingSecondsRemaining ?? 0) > 0 ||
          zombie.gapMeters < config.despawnBehindMeters ||
          opponents.some(
            (opponent) =>
              !this.eatenRiders.has(opponent.id) &&
              Math.abs(opponent.distanceMeters - zombie.distanceMeters) <
                config.despawnBehindMeters,
          ),
      );
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
