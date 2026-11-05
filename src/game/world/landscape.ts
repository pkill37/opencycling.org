import { terrainDetail, terrainNoise, terrainRelief } from "./noise";
import type { ElevationSampler } from "../route/terrain";
import type { CyclingRoute } from "../../types";
import { projectGeographic } from "../route/package";
import { lookupRoute } from "../route/route";

export type Region = "alpine" | "mediterranean" | "paris" | "neutral";
export interface Position {
  x: number;
  z: number;
}
export interface SceneryItem extends Position {
  y: number;
  scale: number;
  rotation: number;
  pitch?: number;
  kind: "pine" | "broadleaf" | "rock" | "building" | "lamp";
}
export interface Landmark extends Position {
  kind: "arc" | "obelisk" | "harbour";
  y: number;
  rotation: number;
}

function indexPath(points: Position[], cellSize: number) {
  const cells = new Map<string, number[]>();
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i],
      b = points[i + 1];
    for (
      let x = Math.floor(Math.min(a.x, b.x) / cellSize);
      x <= Math.floor(Math.max(a.x, b.x) / cellSize);
      x++
    )
      for (
        let z = Math.floor(Math.min(a.z, b.z) / cellSize);
        z <= Math.floor(Math.max(a.z, b.z) / cellSize);
        z++
      ) {
        const key = `${x},${z}`;
        const list = cells.get(key) ?? [];
        list.push(i);
        cells.set(key, list);
      }
  }
  return cells;
}

function nearbyPathSegments(
  cells: Map<string, number[]>,
  cache: Map<string, Set<number>>,
  x: number,
  z: number,
  cellSize: number,
) {
  const cx = Math.floor(x / cellSize),
    cz = Math.floor(z / cellSize),
    key = `${cx},${cz}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const result = new Set<number>();
  for (let dx = -3; dx <= 3; dx++)
    for (let dz = -3; dz <= 3; dz++)
      for (const index of cells.get(`${cx + dx},${cz + dz}`) ?? [])
        result.add(index);
  cache.set(key, result);
  return result;
}

const profiles = [
  {
    id: "alpe-d-huez-test",
    region: "alpine",
    latitude: 45.05435,
    longitude: 6.03255,
  },
  {
    id: "marseille",
    region: "mediterranean",
    latitude: 43.29117,
    longitude: 5.35582,
  },
  { id: "paris", region: "paris", latitude: 48.86852, longitude: 2.31175 },
] as const;

export function regionForRoute(route: CyclingRoute): Region {
  const start = route.points[0];
  return (
    profiles.find(
      (p) =>
        p.id === route.id &&
        Math.abs((start.latitude ?? Infinity) - p.latitude) < 0.001 &&
        Math.abs((start.longitude ?? Infinity) - p.longitude) < 0.001,
    )?.region ?? "neutral"
  );
}

export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function insidePolygon(p: Position, polygon: Position[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a.z > p.z !== b.z > p.z &&
      p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x
    )
      inside = !inside;
  }
  return inside;
}

// Geographic anchors are illustrative outlines, not surveyed shoreline/footprint data.
export function createLandscape(
  route: CyclingRoute,
  elevation?: ElevationSampler,
) {
  const region = regionForRoute(route);
  const start = route.points[0];
  const origin = {
    latitude: start.latitude ?? 0,
    longitude: start.longitude ?? 0,
    elevation: start.y,
  };
  const project = (latitude: number, longitude: number) =>
    projectGeographic(origin, { latitude, longitude, elevation: 0 });
  const water: Position[][] = [];
  if (region === "mediterranean") {
    // Sea remains west of this coast, with an inlet at Vallon des Auffes.
    water.push(
      [
        [43.3, 5.32],
        [43.3, 5.3548],
        [43.2912, 5.3552],
        [43.2895, 5.3545],
        [43.288, 5.3517],
        [43.2865, 5.3502],
        [43.2855, 5.3494],
        [43.2844, 5.3489],
        [43.2823, 5.3502],
        [43.2808, 5.3516],
        [43.2797, 5.3529],
        [43.2788, 5.3534],
        [43.2773, 5.3558],
        [43.2756, 5.3583],
        [43.2749, 5.3593],
        [43.2732, 5.362],
        [43.2715, 5.362],
        [43.2704, 5.363],
        [43.2693, 5.3658],
        [43.2688, 5.3687],
        [43.267, 5.3716],
        [43.261, 5.3737],
        [43.25, 5.37],
        [43.25, 5.32],
      ].map(([lat, lon]) => {
        const p = project(lat, lon);
        return { x: p.x - 25, z: p.z };
      }),
    );
  }
  if (region === "paris") {
    water.push(
      [
        [48.864, 2.304],
        [48.8633, 2.312],
        [48.8625, 2.318],
        [48.8613, 2.324],
        [48.8597, 2.33],
        [48.8582, 2.336],
        [48.8573, 2.3353],
        [48.8588, 2.3293],
        [48.8604, 2.3233],
        [48.8616, 2.3173],
        [48.8624, 2.3113],
        [48.8631, 2.3033],
      ].map(([lat, lon]) => project(lat, lon)),
    );
  }
  const gardens =
    region === "paris"
      ? [
          [
            [48.8657, 2.3222],
            [48.8636, 2.3298],
            [48.8614, 2.3282],
            [48.8637, 2.3207],
          ],
          [
            [48.8696, 2.3107],
            [48.8672, 2.3198],
            [48.8653, 2.3184],
            [48.8677, 2.3094],
          ],
        ].map((polygon) => polygon.map(([lat, lon]) => project(lat, lon)))
      : [];

  // Index every segment into metric cells, including long segments. Queries consider
  // all nearby passages, rather than only the rider's current switchback/lap.
  const sampleSpacing = Math.max(2.5, Math.min(8, route.distanceMeters / 2000));
  const routeSamples: ReturnType<typeof lookupRoute>[] = [];
  for (
    let distance = 0;
    distance < route.distanceMeters;
    distance += sampleSpacing
  )
    routeSamples.push(lookupRoute(distance, route));
  routeSamples.push(lookupRoute(route.distanceMeters, route));
  const cellSize = 100;
  const sourceSegments = route.points.slice(0, -1).map((a, i) => {
    const b = route.points[i + 1],
      dx = b.x - a.x,
      dz = b.z - a.z;
    return { a, dx, dz, dy: b.y - a.y, length2: dx * dx + dz * dz };
  });
  const sourceCells = indexPath(route.points, cellSize);
  const cells = indexPath(routeSamples, cellSize);
  const candidateCache = new Map<string, Set<number>>();
  const sourceCandidateCache = new Map<string, Set<number>>();
  const nearbySource = (x: number, z: number) => {
    return nearbyPathSegments(
      sourceCells,
      sourceCandidateCache,
      x,
      z,
      cellSize,
    );
  };
  const sourceDeckAt = (x: number, z: number) => {
    let deck = Infinity;
    for (const i of nearbySource(x, z)) {
      const segment = sourceSegments[i];
      if (segment.length2 === 0) continue;
      const t = Math.max(
        0,
        Math.min(
          1,
          ((x - segment.a.x) * segment.dx + (z - segment.a.z) * segment.dz) /
            segment.length2,
        ),
      );
      const ex = x - segment.a.x - t * segment.dx,
        ez = z - segment.a.z - t * segment.dz;
      if (ex * ex + ez * ez < 36)
        deck = Math.min(deck, segment.a.y + t * segment.dy);
    }
    return deck;
  };
  const nearby = (x: number, z: number) => {
    return nearbyPathSegments(cells, candidateCache, x, z, cellSize);
  };
  const segments = routeSamples.slice(0, -1).map((a, i) => {
    const b = routeSamples[i + 1],
      dx = b.x - a.x,
      dz = b.z - a.z;
    const length2 = dx * dx + dz * dz;
    return {
      a,
      dx,
      dz,
      dy: b.y - a.y,
      length2,
      length: Math.sqrt(length2),
      heading: Math.atan2(dx, dz),
    };
  });
  const roadAt = (x: number, z: number, clearanceOnly = false) => {
    let distance = Infinity,
      y = start.y,
      heading = 0,
      weightedY = 0,
      weights = 0;
    let nearbyDeck = Infinity;
    for (const i of nearby(x, z)) {
      const {
        a,
        dx,
        dz,
        dy,
        length2,
        length,
        heading: segmentHeading,
      } = segments[i];
      if (length2 === 0) continue;
      const t = Math.max(
        0,
        Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / length2),
      );
      const ex = x - a.x - t * dx,
        ez = z - a.z - t * dz;
      const d = ex * ex + ez * ez;
      const height = a.y + t * dy;
      if (!clearanceOnly) {
        const weight = length / (1 + d * d);
        weightedY += height * weight;
        weights += weight;
      }
      if (d < 36) nearbyDeck = Math.min(nearbyDeck, height);
      if (d < distance) {
        distance = d;
        y = height;
        heading = segmentHeading;
      }
    }
    return {
      distance: Math.sqrt(distance),
      y,
      heading,
      blendedY: weights ? weightedY / weights : start.y,
      nearbyDeck,
    };
  };
  const isWater = (x: number, z: number) =>
    water.some((polygon) => insidePolygon({ x, z }, polygon));
  const isGarden = (x: number, z: number) =>
    gardens.some((polygon) => insidePolygon({ x, z }, polygon));
  const anchors = route.points.filter(
    (_, i) => i % Math.max(1, Math.ceil(route.points.length / 128)) === 0,
  );
  const heightAt = (x: number, z: number, road = roadAt(x, z)) => {
    const sourceDeck = sourceDeckAt(x, z);
    const measured = elevation?.(x, z);
    if (measured !== undefined && road.distance >= 40)
      return Math.min(measured, sourceDeck - 0.24);
    const relief =
      region === "alpine"
        ? 15
        : region === "mediterranean"
          ? 3.8
          : region === "paris"
            ? 0.8
            : 1.2;
    const detail = terrainDetail(x, z);
    const ripple = terrainRelief(x, z) * relief;
    const blend = Math.min(1, Math.max(0, (road.distance - 6) / 100));
    let sum = 0,
      weights = 0;
    for (const anchor of anchors) {
      const weight = 1 / (100 + (x - anchor.x) ** 2 + (z - anchor.z) ** 2);
      sum += anchor.y * weight;
      weights += weight;
    }
    const farHeight = weights ? sum / weights : start.y;
    const local = Math.max(0, 1 - road.distance / 250);
    const base = farHeight * (1 - local) + road.blendedY * local;
    const slopeRelief =
      region === "alpine" ? Math.abs(detail) * 1.8 : Math.abs(detail) * 0.35;
    // Fine-scale breakup makes the rendered ground feel naturally irregular
    // between the route and the larger measured terrain features. It fades out
    // at the road edge so the ride surface remains visually clean and exact.
    const microRelief =
      terrainNoise(x / 7, z / 7) * (region === "alpine" ? 0.55 : 0.16);
    const procedural =
      base -
      0.14 +
      ripple * blend +
      slopeRelief * Math.sign(detail) * blend +
      microRelief * blend;
    const transition = Math.min(1, Math.max(0, (road.distance - 6) / 34));
    const smooth = transition * transition * (3 - 2 * transition);
    const y =
      measured === undefined
        ? procedural
        : procedural * (1 - smooth) + measured * smooth;
    return Math.min(y, road.nearbyDeck - 0.24, sourceDeck - 0.24);
  };
  const landmarks: Landmark[] = [];
  const addLandmark = (
    kind: Landmark["kind"],
    lat: number,
    lon: number,
    rotation: number,
  ) => {
    const p = project(lat, lon);
    landmarks.push({ ...p, kind, y: heightAt(p.x, p.z), rotation });
  };
  if (region === "paris") {
    addLandmark("arc", 48.8738, 2.295, -1.12);
    addLandmark("obelisk", 48.8656, 2.3212, 0);
  }
  if (region === "mediterranean")
    addLandmark("harbour", 43.2851, 5.34875, -0.5);
  const random = seededRandom(1947);
  const items: SceneryItem[] = [];
  // A hard budget also bounds scenery generation for large imported GPX files.
  const step = Math.max(18, route.distanceMeters / 1800);
  for (let distance = 0; distance < route.distanceMeters; distance += step) {
    const p = lookupRoute(distance, route);
    for (const side of [-1, 1]) {
      const lateral = side * (11 + random() * 100);
      const x = p.x + Math.cos(p.heading) * lateral;
      const z = p.z - Math.sin(p.heading) * lateral;
      const near = roadAt(x, z);
      const garden = isGarden(x, z);
      const building =
        region === "paris"
          ? !garden && random() < 0.55
          : region === "mediterranean"
            ? x > p.x && random() < 0.45
            : region === "alpine" &&
              (p.elevationMeters < 820 || p.elevationMeters > 1450) &&
              random() < 0.18;
      const scale = 0.75 + random() * 0.7;
      // Circumscribed footprints account for rotation and neighbouring passages.
      const clearance = building ? 16 * scale + 7 : 4 * scale + 7;
      if (
        near.distance < clearance ||
        !Number.isFinite(near.distance) ||
        isWater(x, z)
      )
        continue;
      if (landmarks.some((l) => Math.hypot(x - l.x, z - l.z) < 65)) continue;
      if (
        items.some(
          (item) =>
            Math.hypot(item.x - x, item.z - z) <
            (building || item.kind === "building" ? 32 : 8),
        )
      )
        continue;
      let kind: SceneryItem["kind"] = building
        ? "building"
        : region === "alpine"
          ? "pine"
          : "broadleaf";
      if (region === "mediterranean" && x < p.x) kind = "rock";
      if (
        region === "alpine" &&
        !building &&
        random() < Math.max(0.12, (p.elevationMeters - 1250) / 650)
      )
        kind = "rock";
      items.push({
        x,
        z,
        y: heightAt(x, z),
        scale,
        rotation: near.heading + (random() - 0.5) * 0.3,
        kind,
      });
    }
    if (
      (region === "paris" || region === "mediterranean") &&
      Math.floor(distance / step) % 3 === 0
    ) {
      for (const side of [-1, 1]) {
        const x = p.x + Math.cos(p.heading) * side * 7;
        const z = p.z - Math.sin(p.heading) * side * 7;
        if (roadAt(x, z).distance < 5.5 || isWater(x, z)) continue;
        items.push({
          x,
          z,
          y: heightAt(x, z),
          rotation: p.heading,
          scale: 1,
          kind: "lamp",
        });
      }
    }
  }
  if (region === "paris") {
    for (
      let distance = 0;
      distance < route.distanceMeters;
      distance += Math.max(24, route.distanceMeters / 1200)
    ) {
      const p = lookupRoute(distance, route);
      for (const side of [-1, 1]) {
        const x = p.x + Math.cos(p.heading) * side * 13;
        const z = p.z - Math.sin(p.heading) * side * 13;
        if (roadAt(x, z).distance < 12 || isWater(x, z)) continue;
        if (landmarks.some((l) => Math.hypot(x - l.x, z - l.z) < 60)) continue;
        if (
          items.some(
            (item) =>
              Math.hypot(item.x - x, item.z - z) <
              (item.kind === "building" ? 24 : 8),
          )
        )
          continue;
        items.push({
          x,
          z,
          y: heightAt(x, z),
          kind: "broadleaf",
          scale: 1.05,
          rotation: p.heading,
        });
      }
    }
  }
  return {
    region,
    water,
    gardens,
    landmarks,
    items,
    heightAt,
    roadAt,
    isWater,
    isGarden,
  };
}
export type Landscape = ReturnType<typeof createLandscape>;
