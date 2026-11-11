"use client";
import { useState } from "react";
import type { CyclingRoute } from "@/types";
import type { GpxTrack } from "@/game/route/gpx";
import type { RoutePackage } from "@/game/route/package";

export default function RouteImport({
  onSelect,
}: {
  onSelect: (route: CyclingRoute) => void;
}) {
  const [tracks, setTracks] = useState<GpxTrack[]>([]);
  const [track, setTrack] = useState(0),
    [segment, setSegment] = useState(0);
  const [flat, setFlat] = useState(false),
    [error, setError] = useState("");
  const [candidate, setCandidate] = useState<RoutePackage>();
  const [busy, setBusy] = useState(false);
  async function preview() {
    try {
      const { packageGpx } = await import("@/game/route/gpx");
      setCandidate(
        packageGpx(
          tracks[track],
          segment,
          {
            provider: "User GPX",
            acquired: new Date().toISOString().slice(0, 10),
            license: "Unknown — local use only",
            attribution:
              "User-supplied file; redistribution rights not reviewed",
            horizontalDatum: "WGS84",
            verticalDatum: "Unknown",
            resolutionMeters: null,
          },
          flat,
        ),
      );
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    }
  }
  return (
    <section aria-label="Import a custom route">
      <p>
        Local processing. Select a track and segment; gaps are never joined
        automatically. Review before loading.
      </p>
      <label>
        Route file{" "}
        <input
          type="file"
          accept=".gpx,.json"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            setCandidate(undefined);
            setTracks([]);
            setError("");
            setTrack(0);
            setSegment(0);
            setFlat(false);
            if (!file) return;
            setBusy(true);
            try {
              if (file.size > 20_000_000)
                throw new Error("File exceeds the 20 MB import limit.");
              const text = await file.text();
              if (file.name.toLowerCase().endsWith(".json")) {
                const { validatePackage } =
                  await import("@/game/route/package");
                setCandidate(validatePackage(JSON.parse(text)));
              } else {
                const { parseGpx } = await import("@/game/route/gpx");
                setTracks(parseGpx(text));
              }
            } catch (e) {
              setError(e instanceof Error ? e.message : "Import failed");
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {tracks.length > 0 && (
        <>
          <label>
            Track{" "}
            <select
              value={track}
              onChange={(e) => {
                setTrack(Number(e.target.value));
                setSegment(0);
                setCandidate(undefined);
              }}
            >
              {tracks.map((t, i) => (
                <option key={i} value={i}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Segment{" "}
            <select
              value={segment}
              onChange={(e) => {
                setSegment(Number(e.target.value));
                setCandidate(undefined);
              }}
            >
              {tracks[track].segments.map((s, i) => (
                <option key={i} value={i}>
                  {i + 1} · {s.length} samples
                </option>
              ))}
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={flat}
              onChange={(e) => {
                setFlat(e.target.checked);
                setCandidate(undefined);
              }}
            />{" "}
            Allow flat degraded preview if elevation is missing
          </label>
          <button type="button" onClick={() => void preview()}>
            Validate selected segment
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {candidate && (
        <>
          <p>
            {candidate.name} · {candidate.samples.length} samples ·{" "}
            {candidate.validation.status}
          </p>
          <p>
            Start: {candidate.samples[0].latitude},{" "}
            {candidate.samples[0].longitude}. End:{" "}
            {candidate.samples.at(-1)!.latitude},{" "}
            {candidate.samples.at(-1)!.longitude}.
          </p>
          {candidate.validation.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
          <button
            type="button"
            onClick={async () => {
              const { buildRoute } = await import("@/game/route/package");
              onSelect(buildRoute(candidate));
            }}
          >
            Use reviewed preview
          </button>
          <button
            type="button"
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(candidate, null, 2)], {
                  type: "application/json",
                }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = "route-package.json";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Download package
          </button>
        </>
      )}
    </section>
  );
}
