import { XMLParser, XMLValidator } from "fast-xml-parser";
import {
  validatePackage,
  type GeographicSample,
  type RoutePackage,
} from "./package";

export interface GpxTrack {
  name: string;
  segments: GeographicSample[][];
}
const array = (v: unknown): unknown[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};
export function parseGpx(xml: string): GpxTrack[] {
  if (xml.length > 20_000_000)
    throw new Error("GPX exceeds the 20 MB import limit.");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true)
    throw new Error(
      "Invalid GPX XML; document types/entities are unsupported.",
    );
  const root = object(
    new XMLParser({
      ignoreAttributes: false,
      removeNSPrefix: true,
      parseTagValue: false,
    }).parse(xml),
  );
  const gpx = object(root.gpx);
  const point = (v: unknown): GeographicSample => {
    const p = object(v);
    const number = (v: unknown) =>
      typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
    return {
      latitude: number(p["@_lat"]),
      longitude: number(p["@_lon"]),
      elevation: number(p.ele),
    };
  };
  const tracks = array(gpx.trk).map((v, i) => {
    const t = object(v);
    return {
      name: String(t.name || `Track ${i + 1}`),
      segments: array(t.trkseg).map((s) => array(object(s).trkpt).map(point)),
    };
  });
  for (const v of array(gpx.rte)) {
    const r = object(v);
    tracks.push({
      name: String(r.name || `Route ${tracks.length + 1}`),
      segments: [array(r.rtept).map(point)],
    });
  }
  if (!tracks.length) throw new Error("No GPX tracks or routes found.");
  return tracks;
}

export function packageGpx(
  track: GpxTrack,
  segment: number,
  source: RoutePackage["source"],
  allowFlat = false,
): RoutePackage {
  const raw = track.segments[segment];
  if (!raw) throw new Error("Select an existing track segment.");
  const missing = raw.some((s) => !Number.isFinite(s.elevation));
  if (missing && !allowFlat)
    throw new Error(
      "Missing elevation. Supply elevation evidence or explicitly choose a flat degraded preview.",
    );
  // If elevation is incomplete, flatten the entire track; never mix invented zeroes with known heights.
  const samples = raw
    .map((s) => ({ ...s, elevation: missing ? 0 : s.elevation }))
    .filter(
      (s, i, all) =>
        !i ||
        s.latitude !== all[i - 1].latitude ||
        s.longitude !== all[i - 1].longitude ||
        s.elevation !== all[i - 1].elevation,
    );
  return validatePackage({
    schemaVersion: 1,
    id: "gpx-import",
    name: track.name,
    version: "1",
    context:
      "User-provided GPX reference line, in recorded direction. One traversal; historical course association unverified.",
    loop: false,
    source,
    processing: {
      version: "1",
      maxGapMeters: 500,
      elevationMethod: "as-supplied",
      corrections: [
        "Removed exact consecutive duplicate samples.",
        ...(missing
          ? ["All elevations replaced with zero by explicit user request."]
          : []),
      ],
    },
    validation: {
      status: "unverified",
      warnings: [
        "No independent alignment, elevation, structure or licensing review.",
        ...(missing
          ? [
              "FLAT DEGRADED PREVIEW: no usable elevation profile; not suitable for climb preparation.",
            ]
          : []),
      ],
    },
    samples,
  });
}
