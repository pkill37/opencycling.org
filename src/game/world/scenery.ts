import * as T from "three";
import type { CyclingRoute } from "../../types";
import { lookupRoute } from "../route/route";
import { createLandscape, type Landscape, type SceneryItem } from "./landscape";
import { createWorldMaterials, type WorldMaterials } from "./materials";

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
) {
  const tileSize = 192;
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
  const terrainTiles: T.Mesh[] = [];
  for (const key of occupied) {
    const [tx, tz] = key.split(",").map(Number);
    const positions: number[] = [],
      colors: number[] = [],
      uvs: number[] = [],
      indices: number[] = [],
      pavingIndices: number[] = [];
    const size = 16,
      segments = tileSize / size;
    const color = new T.Color();
    for (let iz = 0; iz <= segments; iz++)
      for (let ix = 0; ix <= segments; ix++) {
        const x = tx * tileSize + ix * size,
          z = tz * tileSize + iz * size;
        const water = land.isWater(x, z);
        const road = land.roadAt(x, z);
        let height = land.heightAt(x, z);
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
        color.multiplyScalar(
          0.94 + Math.sin(x * 0.02) * Math.cos(z * 0.017) * 0.06,
        );
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
          // Sampling its edges as well as its centre handles bends inside a grid cell.
          let ceiling = Infinity;
          for (const t of [
            [1 / 3, 1 / 3, 1 / 3],
            [0.5, 0.5, 0],
            [0, 0.5, 0.5],
            [0.5, 0, 0.5],
          ]) {
            const x = triangle.reduce(
              (sum, v, i) => sum + positions[v * 3] * t[i],
              0,
            );
            const z = triangle.reduce(
              (sum, v, i) => sum + positions[v * 3 + 2] * t[i],
              0,
            );
            const road = land.roadAt(x, z);
            if (road.distance < 15) ceiling = Math.min(ceiling, road.y - 0.18);
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
    geometry.computeVertexNormals();
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
  const heights = new Map<string, number>();
  for (const tile of terrainTiles) {
    const p = tile.geometry.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const key = `${p.getX(i)},${p.getZ(i)}`;
      heights.set(key, Math.min(heights.get(key) ?? Infinity, p.getY(i)));
    }
  }
  for (const tile of terrainTiles) {
    const p = tile.geometry.getAttribute("position");
    for (let i = 0; i < p.count; i++)
      p.setY(i, heights.get(`${p.getX(i)},${p.getZ(i)}`)!);
    tile.geometry.computeVertexNormals();
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
      `${Math.floor(tile.userData.centerX / 192)},${Math.floor(tile.userData.centerZ / 192)}`,
      tile,
    ]),
  );
  return (x: number, z: number) => {
    const tx = Math.floor(x / 192),
      tz = Math.floor(z / 192);
    const tile = index.get(`${tx},${tz}`);
    if (!tile) return fallback(x, z);
    const gx = (x - tx * 192) / 16,
      gz = (z - tz * 192) / 16;
    const ix = Math.min(11, Math.floor(gx)),
      iz = Math.min(11, Math.floor(gz));
    const fx = gx - ix,
      fz = gz - iz;
    const p = tile.geometry.getAttribute("position");
    const a = iz * 13 + ix,
      b = a + 1,
      c = a + 13,
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
  const edge =
    land.region === "paris" || land.region === "mediterranean" ? 6.5 : 5.4;
  const bands = [
    {
      inner: 4.1,
      outer: edge,
      material:
        land.region === "paris" || land.region === "mediterranean"
          ? materials.stone
          : materials.gravel,
    },
  ];
  for (const { inner, outer, material } of bands)
    for (const side of [-1, 1]) {
      const positions: number[] = [],
        uvs: number[] = [],
        indices: number[] = [];
      route.points.forEach((point, index) => {
        const p = lookupRoute(point.distanceMeters, route);
        for (const lateral of [inner, outer]) {
          const x = p.x + Math.cos(p.heading) * lateral * side;
          const z = p.z - Math.sin(p.heading) * lateral * side;
          const neighbour = land.roadAt(x, z);
          positions.push(
            x,
            Math.min(
              neighbour.nearbyDeck - 0.12,
              p.y - 0.04 - (lateral - 4.1) * 0.01,
            ),
            z,
          );
          uvs.push(lateral / 8, point.distanceMeters / 8);
        }
        if (index) {
          const n = index * 2;
          indices.push(n - 2, n - 1, n, n - 1, n + 1, n);
        }
      });
      const geometry = new T.BufferGeometry();
      geometry.setAttribute(
        "position",
        new T.Float32BufferAttribute(positions, 3),
      );
      geometry.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
      geometry.setAttribute(
        "color",
        new T.Float32BufferAttribute(
          new Float32Array(positions.length).fill(1),
          3,
        ),
      );
      geometry.setIndex(side === -1 ? indices : indices.reverse());
      geometry.computeVertexNormals();
      const mesh = new T.Mesh(geometry, material);
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
    const marker = new T.Object3D();
    batch.forEach((item, index) => {
      marker.position.set(item.x, item.y, item.z);
      marker.rotation.set(0, item.rotation, 0);
      marker.scale.setScalar(item.scale);
      transform(item, marker);
      marker.updateMatrix();
      mesh.setMatrixAt(index, marker.matrix);
    });
    mesh.computeBoundingSphere();
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.centerX =
      batch.reduce((sum, item) => sum + item.x, 0) / batch.length;
    mesh.userData.centerZ =
      batch.reduce((sum, item) => sum + item.z, 0) / batch.length;
    root.add(mesh);
  }
}

function addProps(root: T.Group, land: Landscape, m: WorldMaterials) {
  for (const kind of ["pine", "broadleaf"] as const) {
    const items = land.items.filter((item) => item.kind === kind);
    // Crossed alpha-tested cards have volume from both ride cameras and orbit views.
    for (const angle of [0, Math.PI / 2]) {
      const geometry = new T.PlaneGeometry(
        kind === "pine" ? 8 : 10,
        kind === "pine" ? 13 : 11,
      );
      geometry.translate(0, kind === "pine" ? 6.5 : 5.5, 0);
      instantiate(root, geometry, m[kind], items, (_, object) => {
        object.rotation.y += angle;
      });
    }
  }
  instantiate(
    root,
    new T.DodecahedronGeometry(2.6, 0),
    m.rock,
    land.items.filter((item) => item.kind === "rock"),
    (_, o) => {
      o.position.y += 0.8;
      o.scale.multiply(new T.Vector3(1.3, 0.7, 1));
      o.rotation.z = 0.2;
    },
  );
  const buildings = land.items.filter((item) => item.kind === "building");
  const height =
    land.region === "paris" ? 20 : land.region === "mediterranean" ? 12 : 8;
  const width = land.region === "paris" ? 23 : 16;
  instantiate(root, box(width, height, 14), m.facade, buildings, (_, o) => {
    o.position.y += (height * o.scale.y) / 2;
  });
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
      o.position.y += 2.5;
    },
  );
  instantiate(
    root,
    new T.BoxGeometry(0.6, 0.6, 0.6),
    m.stone,
    lamps,
    (_, o) => {
      o.position.y += 5.1;
    },
  );
}

function addLandmarks(root: T.Group, land: Landscape, m: WorldMaterials) {
  const addBox = (
    group: T.Group,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    material = m.stone,
  ) => {
    const world = new T.Vector3(x, y, z)
      .applyAxisAngle(new T.Vector3(0, 1, 0), group.rotation.y)
      .add(group.position);
    if (land.roadAt(world.x, world.z).distance < 5 + Math.hypot(w, d) / 2)
      return;
    const mesh = new T.Mesh(box(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  for (const landmark of land.landmarks) {
    const group = new T.Group();
    group.name = landmark.kind;
    group.position.set(landmark.x, landmark.y, landmark.z);
    group.rotation.y = landmark.rotation;
    if (landmark.kind === "arc") {
      // Open centre and curved arch soffit preserve the monument's silhouette.
      for (const side of [-1, 1]) addBox(group, 11, 33, 22, side * 16, 16.5, 0);
      addBox(group, 44, 12, 23, 0, 39, 0);
      addBox(group, 47, 3, 25, 0, 46.5, 0);
      const arch = new T.Mesh(
        new T.TorusGeometry(10.5, 2.4, 6, 24, Math.PI),
        m.stone,
      );
      arch.position.y = 23;
      group.add(arch);
      for (const side of [-1, 1])
        for (const z of [-11.2, 11.2])
          addBox(group, 6, 14, 0.8, side * 16, 16, z);
    } else if (landmark.kind === "obelisk") {
      addBox(group, 5, 4, 5, 0, 2, 0);
      const shaft = new T.Mesh(new T.CylinderGeometry(1, 1.8, 22, 4), m.stone);
      shaft.position.y = 15;
      group.add(shaft);
      const tip = new T.Mesh(new T.ConeGeometry(1.4, 3, 4), m.roof);
      tip.position.y = 27.5;
      group.add(tip);
    } else {
      // Small fishing port cue, kept below/beside the unchanged flat GPX road.
      addBox(group, 65, 1.5, 12, 0, -1.2, 22);
      for (let i = 0; i < 7; i++) {
        addBox(
          group,
          7,
          5 + (i % 3),
          7,
          -24 + i * 8,
          0,
          24 + Math.sin(i) * 4,
          m.facade,
        );
      }
      for (let i = 0; i < 5; i++) {
        const boat = new T.Mesh(
          new T.ConeGeometry(1.3, 5, 4),
          i % 2 ? m.stone : m.roof,
        );
        boat.rotation.set(Math.PI / 2, 0, Math.PI / 4);
        boat.position.set(-20 + i * 9, -2, -20);
        group.add(boat);
      }
      // Three small arches, positioned seaward rather than spanning the GPX.
      for (let i = -1; i <= 1; i++) {
        const arch = new T.Mesh(
          new T.TorusGeometry(5, 0.8, 5, 16, Math.PI),
          m.stone,
        );
        arch.position.set(i * 11, -1.5, -4);
        group.add(arch);
      }
    }
    root.add(group);
  }
}

function addRoadside(
  root: T.Group,
  route: CyclingRoute,
  land: Landscape,
  m: WorldMaterials,
) {
  const posts: SceneryItem[] = [];
  const rails: SceneryItem[] = [];
  const step = Math.max(9, route.distanceMeters / 2400);
  for (let d = 0; d < route.distanceMeters; d += step) {
    const p = lookupRoute(d, route);
    for (const side of [-1, 1]) {
      const lateral = side * 4.8;
      const x = p.x + Math.cos(p.heading) * lateral,
        z = p.z - Math.sin(p.heading) * lateral;
      if (land.roadAt(x, z).distance < 4.3) continue;
      const coast = land.region === "mediterranean" && land.isWater(x - 55, z);
      const alpine =
        land.region === "alpine" && Math.abs(p.gradient) > 0.035 && side === -1;
      if (!coast && !alpine) continue;
      posts.push({ x, z, y: p.y, kind: "rock", scale: 1, rotation: p.heading });
      // Keep rails short enough to avoid bridging sharp corners.
      if (p.curvature < 0.035)
        rails.push({
          x,
          z,
          y: p.y,
          kind: "rock",
          scale: 1,
          rotation: p.heading,
        });
    }
  }
  instantiate(
    root,
    new T.BoxGeometry(0.22, 1.05, 0.22),
    m.stone,
    posts,
    (_, o) => {
      o.position.y += 0.5;
    },
  );
  instantiate(
    root,
    new T.BoxGeometry(0.18, 0.28, 7),
    m.stone,
    rails,
    (_, o) => {
      o.position.y += 0.9;
    },
  );
}

export function createScenery(
  scene: T.Scene,
  route: CyclingRoute,
  renderer: T.WebGLRenderer,
) {
  const land = createLandscape(route);
  const materials = createWorldMaterials(renderer, land.region);
  const root = new T.Group();
  root.name = `scenery-${land.region}`;
  scene.add(root);
  const tiles = addTerrain(root, route, land, materials);
  const groundAt = terrainSampler(tiles, land.heightAt);
  for (const item of land.items) item.y = groundAt(item.x, item.z);
  for (const landmark of land.landmarks) {
    landmark.y =
      landmark.kind === "harbour"
        ? land.roadAt(landmark.x, landmark.z).y
        : groundAt(landmark.x, landmark.z);
  }
  addVerges(root, route, land, materials);
  addWater(root, land, materials);
  if (land.region === "alpine") addMountains(root, route, materials.rock);
  addProps(root, land, materials);
  addLandmarks(root, land, materials);
  addRoadside(root, route, land, materials);
  const sky =
    land.region === "mediterranean"
      ? 0xb9dbe8
      : land.region === "paris"
        ? 0xc9d7de
        : 0xbfd7e5;
  scene.background = new T.Color(sky);
  scene.fog = new T.Fog(sky, 450, land.region === "alpine" ? 6500 : 1800);
  const culled = root.children.filter(
    (child) => typeof child.userData.centerX === "number",
  );
  return {
    materials,
    groundAt,
    region: land.region,
    update(dt: number, x: number, z: number) {
      materials.update(dt);
      for (const child of culled)
        child.visible =
          Math.hypot(child.userData.centerX - x, child.userData.centerZ - z) <
          1050;
    },
    dispose() {
      materials.dispose();
    },
  };
}
