import type { CyclingRoute } from "../../types";
import type { ElevationSampler } from "../route/terrain";
import type { TerrainTileData } from "./terrain-data";

export function prepareTerrain(
  route: CyclingRoute,
  elevation: ElevationSampler | undefined,
  signal: AbortSignal,
): Promise<TerrainTileData[] | undefined> {
  if (signal.aborted || typeof Worker === "undefined")
    return Promise.resolve(undefined);
  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker("/world/terrain-worker.js", {
        type: "module",
      });
    } catch {
      resolve(undefined);
      return;
    }
    const finish = (tiles?: TerrainTileData[]) => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      worker.terminate();
      resolve(tiles);
    };
    const abort = () => finish();
    const timeout = setTimeout(() => finish(), 30000);
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event: MessageEvent<{ tiles?: TerrainTileData[] }>) =>
      finish(event.data.tiles);
    worker.onerror = (event) => {
      event.preventDefault();
      finish();
    };
    try {
      worker.postMessage({ route, elevation: elevation?.data });
    } catch {
      finish();
    }
  });
}
