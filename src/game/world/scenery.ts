import type { TerrainTileData } from "./terrain-data";
import type { ElevationSampler } from "../route/terrain";
import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { CyclingRoute } from "../../types";
import { lookupRoute } from "../route/route";
import { createLandscape, type Landscape, type SceneryItem } from "./landscape";
import { createWorldMaterials, type WorldMaterials } from "./materials";
import { roadStrip, roadPose, roadOffset, roadSamples } from "./road";
import { createTexturedGeometry } from "./geometry";
import {
  buildingSize,
  fitScenery,
  terrainFootprints,
  roadClearance,
  type FittedItem,
  type FootprintGround,
  footprintTouchesWater,
  footprintInWater,
} from "./placement";

const TERRAIN_TILE_SIZE = 192;
const TERRAIN_CELL_SIZE = 4;

function box(width: number, height: number, depth: number) {
  const geometry = new T.BoxGeometry(width, height, depth);
  const uv = geometry.getAttribute("uv");
  // One facade tile represents roughly four storeys/windows across 12 metres.
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, (uv.getX(i) * width) / 12, (uv.getY(i) * height) / 12);
  return geometry;
}

export function addTerrain(
  root: T.Group,
  route: CyclingRoute,
  land: Landscape,
  materials: WorldMaterials,
  prepared?: TerrainTileData[],
) {
  if (prepared)
    return prepared.map((tile) => {
      const geometry = new T.BufferGeometry();
      geometry.setAttribute(
        "position",
        new T.BufferAttribute(tile.positions, 3),
      );
      geometry.setAttribute("normal", new T.BufferAttribute(tile.normals, 3));
      geometry.setAttribute("color", new T.BufferAttribute(tile.colors, 3));
      geometry.setAttribute("uv", new T.BufferAttribute(tile.uvs, 2));
      geometry.setIndex(new T.BufferAttribute(tile.indices, 1));
      geometry.groups = tile.groups;
      const mesh = new T.Mesh(
        geometry,
        land.region === "paris"
          ? [materials.grass, materials.stone]
          : materials.grass,
      );
      mesh.receiveShadow = true;
      mesh.userData.centerX = tile.centerX;
      mesh.userData.centerZ = tile.centerZ;
      root.add(mesh);
      return mesh;
    });
  const tileSize = TERRAIN_TILE_SIZE;
  const cellSize = TERRAIN_CELL_SIZE;
  const occupied = new Set<string>();
  // Only allocate a corridor around the route, not its entire bounding rectangle.
  // Bounded to 900 tiles even for the largest supported imported routes.
  const stride = Math.max(90, route.distanceMeters / 1200);
  for (let d = 0; d <= route.distanceMeters; d += stride) {
    const p = lookupRoute(d, route);
    const tx = Math.floor(p.x / tileSize),
      tz = Math.floor(p.z / tileSize);
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        if (occupied.size < 900) occupied.add(`${tx + dx},${tz + dz}`);
      }
  }
  const clearance = new Map<string, number>();
  const ceilingAt = (x: number, z: number) => {
    const key = `${x},${z}`;
    const cached = clearance.get(key);
    if (cached !== undefined) return cached;
    const road = land.roadAt(x, z, true);
    const corridor =
      land.region === "paris" || land.region === "mediterranean" ? 6.7 : 5.6;
    const value = road.distance < corridor ? road.y - 0.18 : Infinity;
    clearance.set(key, value);
    return value;
  };
  const vertexSamples = new Map<
    string,
    { height: number; road: ReturnType<Landscape["roadAt"]> }
  >();
  const terrainTiles: T.Mesh[] = [];
  for (const key of occupied) {
    const [tx, tz] = key.split(",").map(Number);
    const positions: number[] = [],
      colors: number[] = [],
      uvs: number[] = [],
      indices: number[] = [],
      pavingIndices: number[] = [];
    const size = cellSize,
      segments = tileSize / size;
    const color = new T.Color();
    for (let iz = 0; iz <= segments; iz++)
      for (let ix = 0; ix <= segments; ix++) {
        const x = tx * tileSize + ix * size,
          z = tz * tileSize + iz * size;
        const water = land.isWater(x, z);
        const sampleKey = `${x},${z}`;
        let sample = vertexSamples.get(sampleKey);
        if (!sample) {
          const road = land.roadAt(x, z);
          sample = { road, height: land.heightAt(x, z, road) };
          vertexSamples.set(sampleKey, sample);
        }
        const road = sample.road;
        let height = sample.height;
        if (water) height = (land.region === "paris" ? 26 : -2.5) - 1;
        positions.push(x, height, z);
        const rocky = land.region === "alpine" && road.y > 1550;
        color.set(
          rocky
            ? 0xa7a18d
            : land.region === "mediterranean"
              ? 0xc6bb8d
              : land.region === "paris" && !land.isGarden(x, z)
                ? 0xc2bdb0
                : 0xc4cfad,
        );
        const slope = Math.min(1, Math.abs(road.y - height) / 7);
        const regionalVariation =
          Math.sin(x * 0.013 + z * 0.007) * 0.035 +
          Math.cos(x * 0.004 - z * 0.019) * 0.025;
        color.multiplyScalar(0.94 + regionalVariation - slope * 0.025);
        colors.push(color.r, color.g, color.b);
        uvs.push(x / 14, z / 14);
      }
    for (let iz = 0; iz < segments; iz++)
      for (let ix = 0; ix < segments; ix++) {
        const a = iz * (segments + 1) + ix,
          b = a + 1,
          c = a + segments + 1,
          d = c + 1;
        for (const triangle of [
          [a, c, b],
          [b, c, d],
        ]) {
          // Lower the whole triangle if its plane could bury any nearby road deck.
          // A terrain cell is wider than the road, so the old centre/edge
          // probes could miss a road crossing the middle of a triangle. This is
          // especially visible on stacked alpine switchbacks: the road ribbon
          // is at its exact elevation while the terrain remains on the wrong
          // side of it. A two-step barycentric lattice probes every ~2 m and
          // keeps the terrain below a road wherever the corridor enters the
          // triangle.
          let ceiling = Infinity;
          const probeSteps = 2;
          for (let first = 0; first <= probeSteps; first++)
            for (let second = 0; second <= probeSteps - first; second++) {
              const t = [
                first / probeSteps,
                second / probeSteps,
                (probeSteps - first - second) / probeSteps,
              ];
              const x = triangle.reduce(
                (sum, v, i) => sum + positions[v * 3] * t[i],
                0,
              );
              const z = triangle.reduce(
                (sum, v, i) => sum + positions[v * 3 + 2] * t[i],
                0,
              );
              ceiling = Math.min(ceiling, ceilingAt(x, z));
            }
          if (Number.isFinite(ceiling))
            for (const v of triangle)
              positions[v * 3 + 1] = Math.min(positions[v * 3 + 1], ceiling);
          const cx = triangle.reduce((sum, v) => sum + positions[v * 3], 0) / 3;
          const cz =
            triangle.reduce((sum, v) => sum + positions[v * 3 + 2], 0) / 3;
          const target =
            land.region === "paris" && !land.isGarden(cx, cz)
              ? pavingIndices
              : indices;
          target.push(...triangle);
        }
      }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute(
      "position",
      new T.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
    geometry.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
    geometry.setIndex([...indices, ...pavingIndices]);
    geometry.addGroup(0, indices.length, 0);
    if (pavingIndices.length)
      geometry.addGroup(indices.length, pavingIndices.length, 1);
    const mesh = new T.Mesh(
      geometry,
      land.region === "paris"
        ? [materials.grass, materials.stone]
        : materials.grass,
    );
    mesh.receiveShadow = true;
    mesh.userData.centerX = (tx + 0.5) * tileSize;
    mesh.userData.centerZ = (tz + 0.5) * tileSize;
    root.add(mesh);
    terrainTiles.push(mesh);
  }
  // Both copies of a boundary vertex use the same lowered height; this prevents
  // cracks when a neighbouring tile includes a different road-crossing triangle.
  const verticesPerSide = tileSize / cellSize + 1;
  const boundary = (i: number) =>
    i < verticesPerSide ||
    i >= verticesPerSide * (verticesPerSide - 1) ||
    i % verticesPerSide === 0 ||
    i % verticesPerSide === verticesPerSide - 1;
  const heights = new Map<string, number>();
  for (const tile of terrainTiles) {
    const p = tile.geometry.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      if (!boundary(i)) continue;
      const key = `${p.getX(i)},${p.getZ(i)}`;
      heights.set(key, Math.min(heights.get(key) ?? Infinity, p.getY(i)));
    }
  }
  const normals = new Map<string, number[]>();
  for (const tile of terrainTiles) {
    const p = tile.geometry.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      if (boundary(i)) p.setY(i, heights.get(`${p.getX(i)},${p.getZ(i)}`)!);
    }
    tile.geometry.computeVertexNormals();
    const n = tile.geometry.getAttribute("normal");
    for (let i = 0; i < p.count; i++) {
      if (!boundary(i)) continue;
      const key = `${p.getX(i)},${p.getZ(i)}`;
      const sum = normals.get(key) ?? [0, 0, 0];
      sum[0] += n.getX(i);
      sum[1] += n.getY(i);
      sum[2] += n.getZ(i);
      normals.set(key, sum);
    }
  }
  for (const sum of normals.values()) {
    const length = Math.hypot(...sum) || 1;
    sum[0] /= length;
    sum[1] /= length;
    sum[2] /= length;
  }
  for (const tile of terrainTiles) {
    const p = tile.geometry.getAttribute("position"),
      n = tile.geometry.getAttribute("normal");
    for (let i = 0; i < p.count; i++) {
      if (!boundary(i)) continue;
      const sum = normals.get(`${p.getX(i)},${p.getZ(i)}`)!;
      n.setXYZ(i, sum[0], sum[1], sum[2]);
    }
  }
  return terrainTiles;
}

// Props stand on the final triangulated ground, including road clearance cuts.
// Sampling the pre-mesh height field here would leave trees floating on slopes.
export function terrainSampler(
  tiles: T.Mesh[],
  fallback: (x: number, z: number) => number,
) {
  const index = new Map(
    tiles.map((tile) => [
      `${Math.floor(tile.userData.centerX / TERRAIN_TILE_SIZE)},${Math.floor(tile.userData.centerZ / TERRAIN_TILE_SIZE)}`,
      tile,
    ]),
  );
  return (x: number, z: number) => {
    const tx = Math.floor(x / TERRAIN_TILE_SIZE),
      tz = Math.floor(z / TERRAIN_TILE_SIZE);
    const tile = index.get(`${tx},${tz}`);
    if (!tile) return fallback(x, z);
    const gx = (x - tx * TERRAIN_TILE_SIZE) / TERRAIN_CELL_SIZE,
      gz = (z - tz * TERRAIN_TILE_SIZE) / TERRAIN_CELL_SIZE;
    const cellsPerSide = TERRAIN_TILE_SIZE / TERRAIN_CELL_SIZE;
    const ix = Math.min(cellsPerSide - 1, Math.floor(gx)),
      iz = Math.min(cellsPerSide - 1, Math.floor(gz));
    const fx = gx - ix,
      fz = gz - iz;
    const p = tile.geometry.getAttribute("position");
    const verticesPerSide = cellsPerSide + 1;
    const a = iz * verticesPerSide + ix,
      b = a + 1,
      c = a + verticesPerSide,
      d = c + 1;
    return fx + fz <= 1
      ? p.getY(a) * (1 - fx - fz) + p.getY(b) * fx + p.getY(c) * fz
      : p.getY(b) * (1 - fz) + p.getY(c) * (1 - fx) + p.getY(d) * (fx + fz - 1);
  };
}

export function addVerges(
  root: T.Group,
  route: CyclingRoute,
  land: Landscape,
  materials: WorldMaterials,
) {
  const urban = land.region === "paris" || land.region === "mediterranean";
  const edge = urban ? 6.5 : 5.4;
  for (const side of [-1, 1]) {
    const geometry = roadStrip(
      route,
      side * 4.1,
      side * edge,
      0,
      (x, z, p, lateral) =>
        Math.min(
          land.roadAt(x, z).nearbyDeck - 0.12,
          p.y - 0.04 - (Math.abs(lateral) - 4.1) * 0.01,
        ),
    );
    geometry.setAttribute(
      "color",
      new T.Float32BufferAttribute(
        new Float32Array(geometry.getAttribute("position").count * 3).fill(1),
        3,
      ),
    );
    const mesh = new T.Mesh(
      geometry,
      urban ? materials.stone : materials.gravel,
    );
    mesh.receiveShadow = true;
    root.add(mesh);
  }
}

export function addRoadSupports(
  root: T.Group,
  route: CyclingRoute,
  groundAt: (x: number, z: number) => number,
  materials: WorldMaterials,
  bounds: FootprintGround,
) {
  const samples = roadSamples(route),
    clearance = roadClearance(route);
  for (const side of [-1, 1]) {
    const positions: number[] = [],
      uvs: number[] = [],
      indices: number[] = [];
    for (const p of samples) {
      const edge = roadOffset(p, side * 4.15);
      const top = p.y - 0.035,
        bottom = Math.min(top, groundAt(edge.x, edge.z) - 0.12);
      positions.push(edge.x, top, edge.z, edge.x, bottom, edge.z);
      uvs.push(p.distance / 8, top / 8, p.distance / 8, bottom / 8);
    }
    for (let i = 1; i < samples.length; i++) {
      const a = roadOffset(samples[i - 1], side * 4.15),
        b = roadOffset(samples[i], side * 4.15);
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      const footprint = {
        x: (a.x + b.x) / 2,
        z: (a.z + b.z) / 2,
        width: 0.06,
        depth: length + 0.02,
        rotation: Math.atan2(b.x - a.x, b.z - a.z),
      };
      const support = bounds(footprint);
      const floor =
        (support.covered
          ? support.min
          : Math.min(groundAt(a.x, a.z), groundAt(b.x, b.z))) - 0.15;
      positions[(i - 1) * 6 + 4] = Math.min(positions[(i - 1) * 6 + 4], floor);
      positions[i * 6 + 4] = Math.min(positions[i * 6 + 4], floor);
      // Never build a retaining wall through a neighboring lower switchback.
      if (clearance.footprint(footprint, 3.5) < 3.45) continue;
      const n = i * 2;
      const outwardX = a.x - samples[i - 1].x + b.x - samples[i].x;
      const outwardZ = a.z - samples[i - 1].z + b.z - samples[i].z;
      if ((b.z - a.z) * outwardX - (b.x - a.x) * outwardZ > 0)
        indices.push(n - 2, n, n - 1, n, n + 1, n - 1);
      else indices.push(n - 2, n - 1, n, n, n - 1, n + 1);
    }
    const mesh = new T.Mesh(
      createTexturedGeometry(positions, uvs, indices),
      materials.stone,
    );
    mesh.name = side === 1 ? "road-retaining-right" : "road-retaining-left";
    mesh.receiveShadow = true;
    root.add(mesh);
  }
}

function addMountains(
  root: T.Group,
  route: CyclingRoute,
  material: T.Material,
) {
  const xs = route.points.map((p) => p.x),
    zs = route.points.map((p) => p.z);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minZ = Math.min(...zs),
    maxZ = Math.max(...zs);
  const base = Math.min(...route.points.map((p) => p.y)) - 350;
  for (let i = 0; i < 10; i++) {
    const angle = (i * Math.PI) / 5;
    const height = 1500 + Math.sin(i * 7) * 450;
    const mountain = new T.Mesh(
      new T.ConeGeometry(1400, height, 7, 3),
      material,
    );
    mountain.position.set(
      (minX + maxX) / 2 + Math.cos(angle) * ((maxX - minX) / 2 + 2300),
      base + height / 2,
      (minZ + maxZ) / 2 + Math.sin(angle) * ((maxZ - minZ) / 2 + 2300),
    );
    mountain.scale.set(1.3, 1, 0.8);
    mountain.rotation.y = i;
    root.add(mountain);
  }
}

function addWater(root: T.Group, land: Landscape, materials: WorldMaterials) {
  for (const polygon of land.water) {
    const shape = new T.Shape(polygon.map((p) => new T.Vector2(p.x, -p.z)));
    const geometry = new T.ShapeGeometry(shape);
    geometry.rotateX(-Math.PI / 2);
    const mesh = new T.Mesh(geometry, materials.water);
    mesh.position.y = land.region === "paris" ? 26 : -2.5;
    mesh.name = land.region === "paris" ? "Seine" : "Mediterranean";
    root.add(mesh);
  }
}

function instantiate(
  root: T.Group,
  geometry: T.BufferGeometry,
  material: T.Material,
  items: SceneryItem[],
  transform: (item: SceneryItem, object: T.Object3D) => void,
  role = "",
) {
  if (!items.length) {
    geometry.dispose();
    return;
  }
  // Small spatial batches retain frustum/distance culling without one draw per prop.
  const batches = new Map<string, SceneryItem[]>();
  for (const item of items) {
    const key = `${Math.floor(item.x / 192)},${Math.floor(item.z / 192)}`;
    const group = batches.get(key) ?? [];
    group.push(item);
    batches.set(key, group);
  }
  for (const batch of batches.values()) {
    const mesh = new T.InstancedMesh(geometry, material, batch.length);
    mesh.name = role;
    const marker = new T.Object3D();
    batch.forEach((item, index) => {
      marker.position.set(item.x, item.y, item.z);
      if (item.pitch === undefined) marker.rotation.set(0, item.rotation, 0);
      else marker.rotation.set(item.pitch, item.rotation, 0, "YXZ");
      marker.scale.setScalar(item.scale);
      transform(item, marker);
      marker.updateMatrix();
      mesh.setMatrixAt(index, marker.matrix);
    });
    mesh.computeBoundingSphere();
    // Scenery is static and numerous. Let the rider and landmarks cast the
    // dynamic shadow; including every roadside batch in the shadow pass causes
    // large frame-time spikes when the sun follows the rider.
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.userData.centerX =
      batch.reduce((sum, item) => sum + item.x, 0) / batch.length;
    mesh.userData.centerZ =
      batch.reduce((sum, item) => sum + item.z, 0) / batch.length;
    root.add(mesh);
  }
}

export function addProps(root: T.Group, land: Landscape, m: WorldMaterials) {
  for (const kind of ["pine", "broadleaf"] as const) {
    const items = land.items.filter((item) => item.kind === kind);
    if (!items.length) continue;
    const trunkHeight = kind === "pine" ? 3.6 : 2.8;
    instantiate(
      root,
      new T.CylinderGeometry(
        kind === "pine" ? 0.25 : 0.32,
        kind === "pine" ? 0.4 : 0.48,
        trunkHeight,
        7,
      ),
      m.trunk,
      items,
      (_, object) => {
        object.position.y += (trunkHeight * object.scale.y) / 2;
      },
      "tree-trunk",
    );
    const foliageParts: [T.BufferGeometry, number, number][] =
      kind === "pine"
        ? [
            [new T.ConeGeometry(3.3, 5.8, 9), 4.5, 0],
            [new T.ConeGeometry(2.7, 4.9, 9), 7.6, 0],
            [new T.ConeGeometry(1.9, 3.7, 9), 10.2, 0],
          ]
        : land.region === "mediterranean"
          ? [[new T.SphereGeometry(3.1, 10, 6), 5.4, 0]]
          : [
              [new T.IcosahedronGeometry(2.9, 1), 5.5, 1.8],
              [new T.IcosahedronGeometry(2.6, 1), 7.2, -1.2],
              [new T.IcosahedronGeometry(2.3, 1), 5.9, 1.8],
            ];
    const foliage = mergeGeometries(
      foliageParts.map(([geometry, y, x]) => {
        geometry.translate(x, y, 0);
        return geometry;
      }),
    );
    if (foliage) {
      instantiate(
        root,
        foliage,
        kind === "pine" ? m.pineFoliage : m.broadleafFoliage,
        items,
        (_, object) => {
          object.position.y += kind === "pine" ? 0 : -0.2 * object.scale.y;
          if (land.region === "mediterranean" && kind === "broadleaf")
            object.scale.y *= 0.72;
        },
      );
    }
  }
  instantiate(
    root,
    new T.DodecahedronGeometry(2.6, 0),
    m.rock,
    land.items.filter((item) => item.kind === "rock"),
    (_, o) => {
      o.position.y += 0.8 * o.scale.y;
      o.scale.multiply(new T.Vector3(1.3, 0.7, 1));
      o.rotation.z = 0.2;
    },
  );
  const buildings = land.items.filter((item) => item.kind === "building");
  const { height, width } = buildingSize(land.region);
  instantiate(
    root,
    box(width, height, 14),
    m.facade,
    buildings,
    (_, o) => {
      o.position.y += (height * o.scale.y) / 2;
    },
    "building",
  );
  instantiate(
    root,
    box(width, 1, 14),
    m.stone,
    buildings,
    (item, o) => {
      const bottom = (item as FittedItem).foundationBottom ?? item.y - 0.15;
      const thickness = item.y - bottom;
      o.scale.y = thickness;
      o.position.y = bottom + thickness / 2;
    },
    "foundation",
  );
  const roof = new T.CylinderGeometry(
    land.region === "paris" ? 9 : 0,
    13.5,
    5,
    4,
  );
  roof.rotateY(Math.PI / 4);
  roof.scale(1, 1, 0.67);
  instantiate(root, roof, m.roof, buildings, (_, o) => {
    o.position.y += (height + 2.5) * o.scale.y;
  });
  const lamps = land.items.filter((item) => item.kind === "lamp");
  instantiate(
    root,
    new T.CylinderGeometry(0.1, 0.16, 5, 6),
    m.dark,
    lamps,
    (_, o) => {
      o.position.y += 2.5 * o.scale.y;
    },
  );
  instantiate(
    root,
    new T.BoxGeometry(0.6, 0.6, 0.6),
    m.stone,
    lamps,
    (_, o) => {
      o.position.y += 5.1 * o.scale.y;
    },
  );
}

export function addLandmarks(
  root: T.Group,
  land: Landscape,
  m: WorldMaterials,
  bounds: FootprintGround,
  route: CyclingRoute,
) {
  const clearance = roadClearance(route);
  const shoulder =
    land.region === "paris" || land.region === "mediterranean" ? 6.5 : 5.4;
  const boxPart = (
    group: T.Group,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    material: T.Material = m.stone,
    grounded = false,
  ) => {
    const mesh = new T.Mesh(box(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.userData.grounded = grounded;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  for (const landmark of land.landmarks) {
    const group = new T.Group();
    group.name = landmark.kind;
    group.rotation.y = landmark.rotation;
    if (landmark.kind === "arc") {
      for (const side of [-1, 1])
        boxPart(group, 11, 33, 22, side * 16, 16.5, 0, m.stone, true);
      boxPart(group, 44, 12, 23, 0, 39, 0);
      boxPart(group, 47, 3, 25, 0, 46.5, 0);
      const arch = new T.Mesh(
        new T.TorusGeometry(10.5, 2.4, 6, 24, Math.PI),
        m.stone,
      );
      arch.position.y = 23;
      group.add(arch);
      // Relief panels are attached to the pillars, not independent ground props.
      for (const side of [-1, 1])
        for (const z of [-11.2, 11.2])
          boxPart(group, 6, 14, 0.8, side * 16, 16, z);
    } else if (landmark.kind === "obelisk") {
      boxPart(group, 5, 4, 5, 0, 2, 0, m.stone, true);
      const shaft = new T.Mesh(new T.CylinderGeometry(1, 1.8, 22, 4), m.stone);
      shaft.position.y = 15;
      group.add(shaft);
      const tip = new T.Mesh(new T.ConeGeometry(1.4, 3, 4), m.roof);
      tip.position.y = 27.5;
      group.add(tip);
    } else {
      // Houses are grounded independently; boats are explicitly water-supported.
      for (let i = 0; i < 7; i++) {
        const h = 5 + (i % 3);
        boxPart(
          group,
          7,
          h,
          7,
          -24 + i * 8,
          h / 2,
          24 + Math.sin(i) * 4,
          m.facade,
          true,
        );
      }
      for (let i = 0; i < 5; i++) {
        const boat = new T.Mesh(
          new T.ConeGeometry(1.3, 5, 4),
          i % 2 ? m.stone : m.roof,
        );
        boat.rotation.set(Math.PI / 2, 0, Math.PI / 4);
        boat.position.set(-20 + i * 9, -2.5, -20);
        boat.userData.waterSupported = true;
        group.add(boat);
      }
    }
    const originalParts = [...group.children] as T.Mesh[];
    let accepted = false;
    for (let attempt = 0; attempt < 49 && !accepted; attempt++) {
      const radius = attempt === 0 ? 0 : Math.ceil(attempt / 8) * 8,
        angle = (((attempt - 1) % 8) * Math.PI) / 4;
      group.position.set(
        landmark.x + Math.cos(angle) * radius,
        0,
        landmark.z + Math.sin(angle) * radius,
      );
      const parts = originalParts.map((mesh) => {
        mesh.geometry.computeBoundingBox();
        const local = mesh.geometry
          .boundingBox!.clone()
          .applyMatrix4(
            new T.Matrix4().compose(mesh.position, mesh.quaternion, mesh.scale),
          );
        const center = local
          .getCenter(new T.Vector3())
          .applyAxisAngle(new T.Vector3(0, 1, 0), group.rotation.y)
          .add(group.position);
        const size = local.getSize(new T.Vector3());
        return {
          mesh,
          local,
          footprint: {
            x: center.x,
            z: center.z,
            width: size.x,
            depth: size.z,
            rotation: group.rotation.y,
          },
        };
      });
      const contacts = parts.filter((p) => p.mesh.userData.grounded);
      const sites = contacts.map((p) => bounds(p.footprint));
      if (landmark.kind !== "harbour") {
        if (sites.some((site) => !site.covered)) continue;
        const low = Math.min(...sites.map((site) => site.min)),
          high = Math.max(...sites.map((site) => site.max));
        if (high - low > 1.98) continue;
        group.position.y = high + 0.02;
      }
      let invalid = false;
      for (const part of parts) {
        const { footprint, mesh, local } = part;
        if (mesh.userData.waterSupported) continue;
        const deck = land.roadAt(footprint.x, footprint.z).y;
        const overhead = group.position.y + local.min.y >= deck + 4.5;
        if (
          !overhead &&
          clearance.footprint(footprint, shoulder + 1) < shoulder + 0.05
        )
          invalid = true;
        if (mesh.userData.grounded && footprintTouchesWater(footprint, land))
          invalid = true;
      }
      if (invalid && landmark.kind !== "harbour") continue;
      for (const part of parts) {
        const { mesh, footprint, local } = part;
        if (mesh.userData.waterSupported) {
          // A boat must float in the sea, including its full hull footprint.
          const wet = footprintInWater(footprint, land);
          if (!wet || clearance.footprint(footprint, 7) < 7) {
            group.remove(mesh);
            mesh.geometry.dispose();
          }
          continue;
        }
        if (!mesh.userData.grounded) continue;
        const site = bounds(footprint);
        if (
          !site.covered ||
          site.max - site.min > 1.98 ||
          footprintTouchesWater(footprint, land) ||
          clearance.footprint(footprint, shoulder + 1) < shoulder + 0.05
        ) {
          if (landmark.kind === "harbour") {
            group.remove(mesh);
            mesh.geometry.dispose();
            continue;
          }
        }
        const top =
          landmark.kind === "harbour" ? site.max + 0.02 : group.position.y;
        if (landmark.kind === "harbour") mesh.position.y += top - local.min.y;
        const bottom = site.min - 0.15;
        const foundation = new T.Mesh(
          box(footprint.width, top - bottom, footprint.depth),
          m.stone,
        );
        foundation.position.copy(mesh.position);
        foundation.position.y = (top + bottom) / 2 - group.position.y;
        foundation.receiveShadow = true;
        foundation.name = "landmark-foundation";
        group.add(foundation);
      }
      accepted = true;
    }
    if (accepted) root.add(group);
    else for (const mesh of originalParts) mesh.geometry.dispose();
  }
}

export function addRoadside(
  root: T.Group,
  route: CyclingRoute,
  land: Landscape,
  m: WorldMaterials,
  groundAt: (x: number, z: number) => number,
) {
  const posts: SceneryItem[] = [],
    rails: SceneryItem[] = [];
  const clearance = roadClearance(route);
  // Follow successive support points, rather than long tangent beams through bends.
  const step = 3;
  for (const side of [-1, 1]) {
    let previous: SceneryItem | undefined;
    for (let d = 0; d <= route.distanceMeters; d += step) {
      const p = roadPose(d, route),
        offset = roadOffset(p, side * 4.8);
      const coast =
        land.region === "mediterranean" &&
        land.isWater(offset.x - 55, offset.z);
      const alpine =
        land.region === "alpine" && Math.abs(p.gradient) > 0.035 && side === -1;
      const y = groundAt(offset.x, offset.z);
      if (
        (!coast && !alpine) ||
        !Number.isFinite(y) ||
        Math.abs(y - p.y) > 1.5 ||
        clearance(offset.x, offset.z, 6) < 4.5
      ) {
        previous = undefined;
        continue;
      }
      const post: SceneryItem = {
        ...offset,
        y: y - 0.04,
        kind: "rock",
        scale: p.y + 1 - (y - 0.04),
        rotation: p.heading,
      };
      posts.push(post);
      if (previous) {
        const dx = post.x - previous.x,
          dz = post.z - previous.z,
          dy = post.y + post.scale - previous.y - previous.scale;
        const length = Math.hypot(dx, dz);
        const beam = {
          ...post,
          x: (post.x + previous.x) / 2,
          z: (post.z + previous.z) / 2,
          y: (post.y + post.scale + previous.y + previous.scale) / 2 - 0.15,
          rotation: Math.atan2(dx, dz),
          pitch: -Math.atan2(dy, length),
          scale: 1,
        };
        const box = { ...beam, width: 0.2, depth: length + 0.1 };
        if (
          length > 0.1 &&
          length < step * 1.6 &&
          clearance.footprint(box, 5) > 4.4
        ) {
          // Per-instance Z scale encodes the actual length between the two posts.
          rails.push({ ...beam, scale: Math.hypot(length, dy) + 0.1 });
        }
      }
      previous = post;
    }
  }
  instantiate(
    root,
    new T.BoxGeometry(0.22, 1, 0.22),
    m.stone,
    posts,
    (item, o) => {
      o.scale.set(1, item.scale, 1);
      o.position.y += item.scale / 2;
    },
    "guard-post",
  );
  instantiate(
    root,
    new T.BoxGeometry(0.18, 0.28, 1),
    m.stone,
    rails,
    (item, o) => {
      o.scale.set(1, 1, item.scale);
    },
    "guard-rail",
  );
}

export function buildScenery(
  root: T.Group,
  route: CyclingRoute,
  land: Landscape,
  materials: WorldMaterials,
  prepared?: TerrainTileData[],
) {
  const tiles = addTerrain(root, route, land, materials, prepared);
  const groundAt = terrainSampler(tiles, land.heightAt);
  const footprintGround = terrainFootprints(tiles);
  const fitted = fitScenery(land, route, groundAt, footprintGround);
  land.items = fitted.items;
  for (const landmark of land.landmarks) {
    landmark.y =
      landmark.kind === "harbour"
        ? land.roadAt(landmark.x, landmark.z).y
        : groundAt(landmark.x, landmark.z);
  }
  addVerges(root, route, land, materials);
  addRoadSupports(root, route, groundAt, materials, footprintGround);
  addWater(root, land, materials);
  if (land.region === "alpine") addMountains(root, route, materials.rock);
  addProps(root, land, materials);
  addLandmarks(root, land, materials, footprintGround, route);
  addRoadside(root, route, land, materials, groundAt);
  return { tiles, groundAt, footprintGround, report: fitted.report };
}

export function createScenery(
  scene: T.Scene,
  route: CyclingRoute,
  renderer: T.WebGLRenderer,
  elevation?: ElevationSampler,
  prepared?: TerrainTileData[],
) {
  const land = createLandscape(route, elevation);
  const materials = createWorldMaterials(renderer, land.region);
  const root = new T.Group();
  root.name = `scenery-${land.region}`;
  scene.add(root);
  const { tiles, groundAt } = buildScenery(
    root,
    route,
    land,
    materials,
    prepared,
  );
  const nearTerrain =
    land.region === "paris"
      ? [materials.grass, materials.stone]
      : materials.grass;
  const farTerrain =
    land.region === "paris"
      ? [materials.grassFar, materials.stone]
      : materials.grassFar;
  const sky = 0xe6cbb0;
  const alpine = land.region === "alpine";
  const terrainViewDistance = alpine ? 5000 : 2200;
  const sceneryViewDistance = alpine ? 3000 : 1800;
  const terrainSet = new Set<T.Object3D>(tiles);
  scene.background = new T.Color(sky);
  scene.fog = new T.Fog(sky, alpine ? 1800 : 700, alpine ? 10000 : 3500);
  const culled = root.children.filter(
    (child) => typeof child.userData.centerX === "number",
  );
  let lastCullX = Infinity;
  let lastCullZ = Infinity;
  return {
    materials,
    groundAt,
    region: land.region,
    update(dt: number, x: number, z: number) {
      materials.update(dt);
      if (Math.hypot(x - lastCullX, z - lastCullZ) < 32) return;
      lastCullX = x;
      lastCullZ = z;
      for (const child of culled) {
        const dx = child.userData.centerX - x,
          dz = child.userData.centerZ - z;
        const viewDistance = terrainSet.has(child)
          ? terrainViewDistance
          : sceneryViewDistance;
        // Include the batch radius so the edges of visible hills and villages
        // remain present when their centers cross the distance boundary.
        const distance = viewDistance + TERRAIN_TILE_SIZE;
        child.visible = dx * dx + dz * dz < distance * distance;
      }
      for (const tile of tiles) {
        const dx = tile.userData.centerX - x,
          dz = tile.userData.centerZ - z;
        const distance2 = dx * dx + dz * dz;
        if (distance2 > 450 * 450) tile.material = farTerrain;
        else if (distance2 < 350 * 350) tile.material = nearTerrain;
      }
    },
    dispose() {
      materials.dispose();
    },
  };
}
