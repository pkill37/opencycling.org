export interface TerrainTileData {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  uvs: Float32Array;
  indices: Uint16Array | Uint32Array;
  groups: { start: number; count: number; materialIndex?: number }[];
  centerX: number;
  centerZ: number;
}
