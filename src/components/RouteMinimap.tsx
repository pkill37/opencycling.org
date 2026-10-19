import { useMemo } from "react";
import { lookupRoute } from "@/game/route/route";
import type { CyclingRoute } from "@/types";
import styles from "./RouteMinimap.module.css";

export default function RouteMinimap({
  route,
  distanceMeters,
}: {
  route: CyclingRoute;
  distanceMeters: number;
}) {
  const map = useMemo(() => {
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    for (const p of route.points) {
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
    // Keep every reference sample: crossings and hairpins retain their topology.
    const path = route.points
      .map((p, i) => {
        const point = project(p.x, p.z);
        return `${i ? "L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`;
      })
      .join(" ");
    const first = route.points[0],
      last = route.points.at(-1)!;
    return {
      project,
      path,
      start: project(first.x, first.z),
      finish: project(last.x, last.z),
    };
  }, [route]);
  const position = lookupRoute(distanceMeters, route);
  const rider = map.project(position.x, position.z);
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
    </aside>
  );
}
