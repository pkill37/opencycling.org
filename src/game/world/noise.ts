// Coordinate-based noise is independent of mesh tessellation and query order.
function hash(x: number, z: number) {
  let value = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ 1947;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}
export function terrainNoise(x: number, z: number): number {
  const ix = Math.floor(x),
    iz = Math.floor(z);
  const fx = x - ix,
    fz = z - iz;
  const u = fx * fx * (3 - 2 * fx),
    v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz) * (1 - u) + hash(ix + 1, iz) * u;
  const b = hash(ix, iz + 1) * (1 - u) + hash(ix + 1, iz + 1) * u;
  return (a * (1 - v) + b * v) * 2 - 1;
}
export function terrainRelief(x: number, z: number) {
  return (
    terrainNoise(x / 220, z / 220) * 0.65 +
    terrainNoise(x / 83, z / 83) * 0.25 +
    terrainNoise(x / 29, z / 29) * 0.1
  );
}
