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

function distanceCurve(
  samples: GhostSample[],
  low: number,
  high: number,
  amount: number,
) {
  const start = samples[low];
  const end = samples[high];
  const duration = end.elapsedSeconds - start.elapsedSeconds;
  const distance = end.distanceMeters - start.distanceMeters;
  if (duration <= 0 || distance <= 0)
    return { distanceMeters: start.distanceMeters, speedMetersPerSecond: 0 };
  const slope = distance / duration;
  // Shape-preserving cubic tangents keep velocity continuous at recordings,
  // without overshooting a sample or moving backwards during a recorded stop.
  const tangent = (index: number) => {
    if (index === 0 || index === samples.length - 1) return slope;
    const previous = samples[index - 1];
    const current = samples[index];
    const next = samples[index + 1];
    const before = current.elapsedSeconds - previous.elapsedSeconds;
    const after = next.elapsedSeconds - current.elapsedSeconds;
    if (before <= 0 || after <= 0) return slope;
    const left = (current.distanceMeters - previous.distanceMeters) / before;
    const right = (next.distanceMeters - current.distanceMeters) / after;
    if (left <= 0 || right <= 0) return 0;
    const w1 = 2 * after + before;
    const w2 = after + 2 * before;
    return (w1 + w2) / (w1 / left + w2 / right);
  };
  const m0 = tangent(low) * duration;
  const m1 = tangent(high) * duration;
  const t = amount,
    t2 = t * t,
    t3 = t2 * t;
  return {
    distanceMeters:
      start.distanceMeters +
      (-2 * t3 + 3 * t2) * distance +
      (t3 - 2 * t2 + t) * m0 +
      (t3 - t2) * m1,
    speedMetersPerSecond: Math.max(
      0,
      ((-6 * t2 + 6 * t) * distance +
        (3 * t2 - 4 * t + 1) * m0 +
        (3 * t2 - 2 * t) * m1) /
        duration,
    ),
  };
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
  let amount = span > 0 ? (value - low[key]) / span : 0;
  if (key === "distanceMeters" && span > 0) {
    // Invert the same curve for the HUD gap so it agrees with the visible ghost.
    let from = 0;
    let to = 1;
    for (let i = 0; i < 28; i++) {
      amount = (from + to) / 2;
      if (distanceCurve(samples, lowIndex, high, amount).distanceMeters < value)
        from = amount;
      else to = amount;
    }
    amount = (from + to) / 2;
  }
  const trajectory = distanceCurve(samples, lowIndex, high, amount);
  return {
    elapsedSeconds:
      low.elapsedSeconds + (next.elapsedSeconds - low.elapsedSeconds) * amount,
    ...trajectory,
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
