import * as T from "three";
import type { CyclingRoute } from "../../types";
import { terrainSampler, type TerrainPackage } from "../route/terrain";
import { createLandscape } from "./landscape";
import { addTerrain } from "./scenery";
import type { WorldMaterials } from "./materials";
import type { TerrainTileData } from "./terrain-data";

self.onmessage = (
  event: MessageEvent<{ route: CyclingRoute; elevation?: TerrainPackage }>,
) => {
  const { route, elevation } = event.data;
  const material = new T.MeshStandardMaterial();
  try {
    const land = createLandscape(
      route,
      elevation ? terrainSampler(elevation, route) : undefined,
    );
    const tiles = addTerrain(new T.Group(), route, land, {
      grass: material,
      stone: material,
    } as WorldMaterials);
    const data: TerrainTileData[] = tiles.map((tile) => ({
      positions: tile.geometry.getAttribute("position").array as Float32Array,
      normals: tile.geometry.getAttribute("normal").array as Float32Array,
      colors: tile.geometry.getAttribute("color").array as Float32Array,
      uvs: tile.geometry.getAttribute("uv").array as Float32Array,
      indices: tile.geometry.index!.array as Uint16Array | Uint32Array,
      groups: tile.geometry.groups,
      centerX: tile.userData.centerX,
      centerZ: tile.userData.centerZ,
    }));
    const transfer = data.flatMap((tile) => [
      tile.positions.buffer,
      tile.normals.buffer,
      tile.colors.buffer,
      tile.uvs.buffer,
      tile.indices.buffer,
    ]) as ArrayBuffer[];
    self.postMessage({ tiles: data }, { transfer });
    tiles.forEach((tile) => tile.geometry.dispose());
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error ? error.message : "Terrain generation failed",
    });
  } finally {
    material.dispose();
  }
};
