import type { CyclingRoute } from "@/types";
import { lookupRoute } from "../route/route";

/** Preserve simulated gaps, including the horde's approach before an open start. */
export function zombieRoutePose(distanceMeters: number, route: CyclingRoute) {
  if (route.loop) {
    const wrapped =
      ((distanceMeters % route.distanceMeters) + route.distanceMeters) %
      route.distanceMeters;
    return lookupRoute(wrapped, route);
  }
  const pose = lookupRoute(distanceMeters, route);
  if (distanceMeters >= 0) return pose;
  const horizontal = distanceMeters / Math.hypot(1, pose.gradient);
  return {
    ...pose,
    x: pose.x + Math.sin(pose.heading) * horizontal,
    y: pose.y + pose.gradient * horizontal,
    z: pose.z + Math.cos(pose.heading) * horizontal,
  };
}
