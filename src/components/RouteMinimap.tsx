import { useMemo, type MouseEvent } from "react";
import { lookupRoute } from "@/game/route/route";
import type { CyclingRoute } from "@/types";
import styles from "./RouteMinimap.module.css";

export default function RouteMinimap({
  route,
  distanceMeters,
  onSeek,
}: {
  route: CyclingRoute;
  distanceMeters: number;
  onSeek?: (distanceMeters: number) => void;
}) {
  const map = useMemo(() => {
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    const spacing = Math.max(2.5, Math.min(8, route.distanceMeters / 900));
    const samples: Array<{
      x: number;
      y: number;
      z: number;
      distanceMeters: number;
    }> = [];
    for (let distance = 0; distance < route.distanceMeters; distance += spacing)
      samples.push({
        ...lookupRoute(distance, route),
        distanceMeters: distance,
      });
    samples.push({
      ...lookupRoute(route.distanceMeters, route),
      distanceMeters: route.distanceMeters,
    });
    for (const p of samples) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
    const scale = Math.min(
      208 / Math.max(1, maxX - minX),
      128 / Math.max(1, maxZ - minZ),
    );
    const project = (x: number, z: number) => ({
      x: 120 + (x - (minX + maxX) / 2) * scale,
      y: 80 - (z - (minZ + maxZ) / 2) * scale,
    });
    const path = samples
      .map((p, i) => {
        const point = project(p.x, p.z);
        return `${i ? "L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`;
      })
      .join(" ");
    const first = samples[0],
      last = samples.at(-1)!;
    return {
      project,
      path,
      start: project(first.x, first.z),
      finish: project(last.x, last.z),
      samples,
    };
  }, [route]);
  const position = lookupRoute(distanceMeters, route);
  const rider = map.project(position.x, position.z);
  const seekFromClick = (event: MouseEvent<SVGSVGElement>) => {
    if (!onSeek) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * 240;
    const y = ((event.clientY - bounds.top) / bounds.height) * 160;
    let nearestDistance = 0;
    let nearestDistanceSquared = Infinity;
    for (let i = 0; i < map.samples.length - 1; i++) {
      const a = map.project(map.samples[i].x, map.samples[i].z);
      const b = map.project(map.samples[i + 1].x, map.samples[i + 1].z);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lengthSquared = dx * dx + dy * dy;
      const t = lengthSquared
        ? Math.max(
            0,
            Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / lengthSquared),
          )
        : 0;
      const distanceSquared =
        (x - (a.x + t * dx)) ** 2 + (y - (a.y + t * dy)) ** 2;
      if (distanceSquared < nearestDistanceSquared) {
        nearestDistanceSquared = distanceSquared;
        nearestDistance =
          map.samples[i].distanceMeters +
          (map.samples[i + 1].distanceMeters - map.samples[i].distanceMeters) *
            t;
      }
    }
    onSeek(nearestDistance);
  };
  return (
    <aside className={styles.map} aria-label="Route minimap">
      <div className={styles.heading}>
        <span>ROUTE</span>
        <span aria-label="North up">N ↑</span>
      </div>
      <svg
        viewBox="0 0 240 160"
        role="img"
        aria-label={`${route.name} route map`}
        onClick={seekFromClick}
        className={onSeek ? styles.interactive : undefined}
      >
        <path
          d={map.path}
          fill="none"
          stroke="var(--muted)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx={map.start.x}
          cy={map.start.y}
          r="4"
          fill="#152b27"
          stroke="white"
          strokeWidth="2"
        >
          <title>Start</title>
        </circle>
        {!route.loop && (
          <rect
            x={map.finish.x - 4}
            y={map.finish.y - 4}
            width="8"
            height="8"
            fill="white"
          >
            <title>Finish</title>
          </rect>
        )}
        <g
          transform={`translate(${rider.x.toFixed(2)} ${rider.y.toFixed(2)})`}
          data-testid="minimap-rider"
        >
          <title>Current rider position</title>
          <circle r="8" fill="var(--accent)" stroke="#152b27" strokeWidth="2" />
          <path
            d="M0,-5 L3,3 L0,1 L-3,3 Z"
            fill="#152b27"
            transform={`rotate(${(position.heading * 180) / Math.PI})`}
          />
        </g>
      </svg>
      {onSeek && <small className={styles.seekHint}>CLICK ROUTE TO JUMP</small>}
    </aside>
  );
}
