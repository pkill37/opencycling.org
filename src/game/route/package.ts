import type { CyclingRoute, RoutePoint } from "../../types";

export interface GeographicSample {
  latitude: number;
  longitude: number;
  elevation: number;
}
export interface RoutePackage {
  schemaVersion: 1;
  id: string;
  name: string;
  version: string;
  context: string;
  loop: boolean;
  source: {
    provider: string;
    acquired: string;
    license: string;
    attribution: string;
    horizontalDatum: "WGS84";
    verticalDatum: string;
    resolutionMeters: number | null;
  };
  processing: {
    version: "1";
    maxGapMeters: number;
    elevationMethod: "as-supplied";
    corrections: string[];
  };
  validation: { status: "unverified"; warnings: string[] };
  samples: GeographicSample[];
}

const earth = 6371008.8;
const radians = Math.PI / 180;
export function horizontalDistance(a: GeographicSample, b: GeographicSample) {
  const p = (b.latitude - a.latitude) * radians;
  const q = (b.longitude - a.longitude) * radians;
  return (
    earth *
    2 *
    Math.asin(
      Math.min(
        1,
        Math.sqrt(
          Math.sin(p / 2) ** 2 +
            Math.cos(a.latitude * radians) *
              Math.cos(b.latitude * radians) *
              Math.sin(q / 2) ** 2,
        ),
      ),
    )
  );
}

// Imported JSON is untrusted. Only this bounded, reproducible format crosses into runtime.
export function validatePackage(input: unknown): RoutePackage {
  if (!input || typeof input !== "object")
    throw new Error("Expected a route package object.");
  const p = input as RoutePackage;
  const text = (v: unknown) =>
    typeof v === "string" && v.trim().length > 0 && v.length <= 10000;
  const texts = (v: unknown) => Array.isArray(v) && v.every(text);
  if (
    p.schemaVersion !== 1 ||
    ![p.id, p.name, p.version, p.context].every(text) ||
    typeof p.loop !== "boolean"
  )
    throw new Error("Invalid package identity or unsupported schema version.");
  if (
    !p.source ||
    ![
      p.source.provider,
      p.source.acquired,
      p.source.license,
      p.source.attribution,
      p.source.verticalDatum,
    ].every(text) ||
    p.source.horizontalDatum !== "WGS84" ||
    !(
      p.source.resolutionMeters === null ||
      (Number.isFinite(p.source.resolutionMeters) &&
        p.source.resolutionMeters > 0)
    )
  )
    throw new Error(
      "Missing source provenance or unsupported horizontal datum.",
    );
  if (
    !p.processing ||
    p.processing.version !== "1" ||
    p.processing.elevationMethod !== "as-supplied" ||
    !texts(p.processing.corrections) ||
    !Number.isFinite(p.processing.maxGapMeters) ||
    p.processing.maxGapMeters < 1 ||
    p.processing.maxGapMeters > 500
  )
    throw new Error(
      "Invalid processing configuration; maximum supported gap is 500 m.",
    );
  if (p.validation?.status !== "unverified" || !texts(p.validation.warnings))
    throw new Error(
      "This builder supports unverified packages only; curated validation requires independent review.",
    );
  if (
    !Array.isArray(p.samples) ||
    p.samples.length < 2 ||
    p.samples.length > 100000
  )
    throw new Error("A route needs 2–100,000 samples.");
  let length = 0;
  p.samples.forEach((s, i) => {
    if (
      !s ||
      !Number.isFinite(s.latitude) ||
      Math.abs(s.latitude) > 85 ||
      !Number.isFinite(s.longitude) ||
      Math.abs(s.longitude) > 180 ||
      !Number.isFinite(s.elevation) ||
      s.elevation < -500 ||
      s.elevation > 9000
    )
      throw new Error(`Invalid coordinates/elevation at sample ${i + 1}.`);
    if (horizontalDistance(p.samples[0], s) > 100000)
      throw new Error("Route exceeds the supported 100 km local-frame radius.");
    if (!i) return;
    const prev = p.samples[i - 1],
      d = horizontalDistance(prev, s);
    if (d < 0.01)
      throw new Error(`Duplicate or vertical-only sample ${i + 1}.`);
    if (d > p.processing.maxGapMeters)
      throw new Error(
        `Gap at sample ${i + 1}: ${Math.round(d)} m. Repair or split the source track.`,
      );
    if (Math.abs(s.elevation - prev.elevation) / d > 0.5)
      throw new Error(
        `Implausible grade at sample ${i + 1}; review elevation evidence.`,
      );
    length += d;
  });
  if (length > 500000)
    throw new Error("Route exceeds the 500 km runtime budget.");
  if (p.loop) {
    const a = p.samples[0],
      b = p.samples.at(-1)!;
    if (
      horizontalDistance(a, b) > 0.01 ||
      Math.abs(a.elevation - b.elevation) > 0.01
    )
      throw new Error(
        "A circuit must explicitly end at its start, including elevation; no automatic closing segment.",
      );
  }
  return p;
}

export function buildRoute(input: unknown): CyclingRoute {
  const p = validatePackage(input),
    origin = p.samples[0];
  let distance = 0,
    gain = 0;
  // Azimuthal equidistant local frame, x east and z north. No world/render dependencies.
  const points: RoutePoint[] = p.samples.map((s) => {
    const lat = s.latitude * radians,
      lat0 = origin.latitude * radians;
    const dl = (s.longitude - origin.longitude) * radians;
    const bearing = Math.atan2(
      Math.sin(dl) * Math.cos(lat),
      Math.cos(lat0) * Math.sin(lat) -
        Math.sin(lat0) * Math.cos(lat) * Math.cos(dl),
    );
    const radius = horizontalDistance(origin, s);
    return {
      x: radius * Math.sin(bearing),
      z: radius * Math.cos(bearing),
      y: s.elevation,
      elevationMeters: s.elevation,
      latitude: s.latitude,
      longitude: s.longitude,
      distanceMeters: 0,
      gradient: 0,
      curvature: 0,
    };
  });
  points.forEach((a, i) => {
    const b = points[i + 1];
    a.distanceMeters = distance;
    if (b) {
      const horizontal = Math.hypot(b.x - a.x, b.z - a.z);
      a.gradient = (b.y - a.y) / horizontal;
      distance += Math.hypot(horizontal, b.y - a.y);
      gain += Math.max(0, b.y - a.y);
    }
    const prev = points[i - 1] ?? (p.loop ? points.at(-2) : undefined);
    const next = b ?? (p.loop ? points[1] : undefined);
    if (prev && next) {
      const ab = Math.hypot(a.x - prev.x, a.z - prev.z),
        bc = Math.hypot(next.x - a.x, next.z - a.z),
        ac = Math.hypot(next.x - prev.x, next.z - prev.z);
      const cross =
        (a.x - prev.x) * (next.z - prev.z) - (a.z - prev.z) * (next.x - prev.x);
      a.curvature =
        ac < 0.01 ? 2 / Math.min(ab, bc) : (2 * cross) / (ab * bc * ac);
    }
  });
  return {
    id: p.id,
    name: p.name,
    loop: p.loop,
    points,
    distanceMeters: distance,
    elevationGainMeters: gain,
    metadata: {
      version: p.version,
      context: p.context,
      quality: "Unverified — source accuracy unknown",
      warnings: [
        ...p.validation.warnings,
        "Elevation and curvature are as supplied; GPS noise may affect training demands.",
        "Assumed 6.8 m road width, asphalt Crr, zero camber; structures and terrain unverified.",
      ],
      attribution: `${p.source.provider}: ${p.source.attribution} · ${p.source.license}`,
    },
  };
}
