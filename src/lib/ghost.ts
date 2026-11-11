export interface GhostSample {
  elapsedSeconds: number;
  distanceMeters: number;
  speedMetersPerSecond: number;
  cadenceRpm: number;
}

export interface GhostRun {
  routeId: string;
  elapsedSeconds: number;
  samples: GhostSample[];
}

export interface GhostPlayback extends GhostSample {
  visible: boolean;
}

const storageKey = (routeId: string) => `opencycling:ghost:${routeId}`;

function validSample(value: unknown): value is GhostSample {
  if (!value || typeof value !== "object") return false;
  const sample = value as Partial<GhostSample>;
  return [
    sample.elapsedSeconds,
    sample.distanceMeters,
    sample.speedMetersPerSecond,
    sample.cadenceRpm,
  ].every((entry) => typeof entry === "number" && Number.isFinite(entry));
}

export function loadGhost(routeId: string): GhostRun | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(storageKey(routeId)) ?? "null",
    );
    if (!parsed || typeof parsed !== "object") return undefined;
    const run = parsed as Partial<GhostRun>;
    if (
      run.routeId !== routeId ||
      typeof run.elapsedSeconds !== "number" ||
      !Number.isFinite(run.elapsedSeconds) ||
      !Array.isArray(run.samples)
    )
      return undefined;
    const samples = run.samples.filter(validSample);
    return samples.length > 1
      ? { routeId, elapsedSeconds: run.elapsedSeconds, samples }
      : undefined;
  } catch {
    return undefined;
  }
}

export function saveGhostIfFaster(
  routeId: string,
  samples: GhostSample[],
  elapsedSeconds: number,
): GhostRun | undefined {
  if (typeof window === "undefined" || samples.length < 2) return undefined;
  const previous = loadGhost(routeId);
  if (previous && previous.elapsedSeconds <= elapsedSeconds) return previous;
  const validSamples = samples.filter(validSample);
  const maxSamples = 1800;
  const compactSamples =
    validSamples.length <= maxSamples
      ? validSamples
      : Array.from({ length: maxSamples }, (_, index) => {
          const sourceIndex = Math.round(
            (index * (validSamples.length - 1)) / (maxSamples - 1),
          );
          return validSamples[sourceIndex];
        });
  const run: GhostRun = {
    routeId,
    elapsedSeconds,
    samples: compactSamples,
  };
  try {
    window.localStorage.setItem(storageKey(routeId), JSON.stringify(run));
    return run;
  } catch {
    return undefined;
  }
}

function interpolate(
  samples: GhostSample[],
  value: number,
  key: "elapsedSeconds" | "distanceMeters",
) {
  if (value <= samples[0][key]) return samples[0];
  const last = samples[samples.length - 1];
  if (value >= last[key]) return last;
  let lowIndex = 0;
  let high = samples.length - 1;
  while (high - lowIndex > 1) {
    const middle = (lowIndex + high) >> 1;
    if (samples[middle][key] < value) lowIndex = middle;
    else high = middle;
  }
  const low = samples[lowIndex];
  const next = samples[high];
  const span = next[key] - low[key];
  const amount = span > 0 ? (value - low[key]) / span : 0;
  return {
    elapsedSeconds:
      low.elapsedSeconds + (next.elapsedSeconds - low.elapsedSeconds) * amount,
    distanceMeters:
      low.distanceMeters + (next.distanceMeters - low.distanceMeters) * amount,
    speedMetersPerSecond:
      low.speedMetersPerSecond +
      (next.speedMetersPerSecond - low.speedMetersPerSecond) * amount,
    cadenceRpm: low.cadenceRpm + (next.cadenceRpm - low.cadenceRpm) * amount,
  };
}

export function ghostAtTime(run: GhostRun, elapsedSeconds: number) {
  return interpolate(run.samples, elapsedSeconds, "elapsedSeconds");
}

export function ghostTimeAtDistance(run: GhostRun, distanceMeters: number) {
  return interpolate(run.samples, distanceMeters, "distanceMeters")
    .elapsedSeconds;
}
