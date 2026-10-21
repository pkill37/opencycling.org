import {
  horizontalDistance,
  type GeographicSample,
} from "../src/game/route/package";

export function removeDuplicateCoordinates(samples: GeographicSample[]) {
  return samples.filter(
    (p, i) => !i || horizontalDistance(samples[i - 1], p) >= 0.01,
  );
}

// Average 21 interpolated source heights across a centered 100 m window.
// Narrow the window symmetrically at the ends to preserve endpoint elevations.
export function smoothElevations(samples: GeographicSample[]) {
  const distances = [0];
  for (let i = 1; i < samples.length; i++)
    distances.push(
      distances[i - 1] + horizontalDistance(samples[i - 1], samples[i]),
    );
  function elevationAt(d: number) {
    let lo = 0,
      hi = samples.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (distances[mid] <= d) lo = mid;
      else hi = mid;
    }
    const t = (d - distances[lo]) / (distances[hi] - distances[lo]);
    return (
      samples[lo].elevation +
      t * (samples[hi].elevation - samples[lo].elevation)
    );
  }
  return samples.map((p, i) => {
    const d = distances[i],
      radius = Math.min(50, d, distances.at(-1)! - d);
    let elevation = 0;
    for (let j = -10; j <= 10; j++)
      elevation += elevationAt(d + (radius * j) / 10) / 21;
    return { ...p, elevation };
  });
}
