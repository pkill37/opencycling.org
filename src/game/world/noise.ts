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

function ridge(value: number) {
  return 1 - Math.abs(value);
}

function warpedNoise(x: number, z: number, scale: number) {
  const warpX = terrainNoise(x / scale + 17.3, z / scale - 9.1);
  const warpZ = terrainNoise(x / scale - 23.7, z / scale + 14.2);
  return terrainNoise(
    (x + warpX * scale * 0.55) / scale,
    (z + warpZ * scale * 0.55) / scale,
  );
}

export function terrainDetail(x: number, z: number) {
  const broad = warpedNoise(x, z, 220);
  const medium = warpedNoise(x + 41, z - 27, 83);
  const fine = terrainNoise(x / 19, z / 19);
  const ridges = ridge(terrainNoise(x / 145 + 71, z / 145 - 19));
  return broad * 0.52 + medium * 0.22 + fine * 0.08 + (ridges * 2 - 1) * 0.18;
}

export function terrainRelief(x: number, z: number) {
  return terrainDetail(x, z);
}
