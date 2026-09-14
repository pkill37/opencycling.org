import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { lookupRoute, route, terrainHeight } from "../route/route";
import { worldTexture } from "./textures";
import {
  foliageGeometry,
  spatialBatches,
  vegetationMaterial,
} from "./vegetation";

export function surfaceTexture(kind: "road" | "grass" | "gravel") {
  const texture = worldTexture(kind);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function addScenery(scene: T.Scene) {
  let seed = 42;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const dummy = new T.Object3D();
  const color = new T.Color();
  const crownGeometry = foliageGeometry();
  const trunks = new T.InstancedMesh(
    new T.CylinderGeometry(0.16, 0.34, 5, 7),
    new T.MeshStandardMaterial({ color: 0x695c48, roughness: 1 }),
    650,
  );
  const foliage = new T.InstancedMesh(
    crownGeometry,
    vegetationMaterial("broadleaf"),
    650,
  );
  const pines = new T.InstancedMesh(
    crownGeometry,
    vegetationMaterial("pine"),
    650,
  );
  let leafIndex = 0,
    pineIndex = 0;
  const place = (
    mesh: T.InstancedMesh,
    index: number,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
  ) => {
    dummy.position.set(x, y, z);
    dummy.scale.set(sx, sy, sz);
    dummy.rotation.set(0, random() * Math.PI * 2, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  };
  for (let i = 0; i < 650; i++) {
    let x: number, z: number;
    if (i < 390) {
      const p = lookupRoute(random() * route.distanceMeters);
      const offset = (i % 2 ? -1 : 1) * (11 + random() * 58);
      x = p.x + Math.cos(p.heading) * offset;
      z = p.z - Math.sin(p.heading) * offset;
    } else {
      x = (random() - 0.5) * 1200;
      z = (random() - 0.5) * 1200;
    }
    if (
      route.points.some(
        (p, j) => j % 4 === 0 && Math.hypot(p.x - x, p.z - z) < 9,
      )
    ) {
      i--;
      continue;
    }
    const y = terrainHeight(x, z),
      scale = 0.8 + random() * 1.1;
    place(trunks, i, x, y + 2.5 * scale, z, scale, scale, scale);
    if (i % 3 === 0) {
      place(
        pines,
        pineIndex,
        x,
        y + 6 * scale,
        z,
        7 * scale,
        12 * scale,
        7 * scale,
      );
      pines.setColorAt(
        pineIndex++,
        color.setHSL(0.27, 0.12, 0.6 + random() * 0.15),
      );
    } else {
      place(
        foliage,
        leafIndex,
        x,
        y + 5.5 * scale,
        z,
        9 * scale,
        9 * scale,
        9 * scale,
      );
      foliage.setColorAt(
        leafIndex++,
        color.setHSL(
          0.23 + random() * 0.08,
          0.1 + random() * 0.1,
          0.6 + random() * 0.2,
        ),
      );
    }
  }
  foliage.count = leafIndex;
  pines.count = pineIndex;
  for (const mesh of [trunks, foliage, pines]) {
    mesh.castShadow = true;
    mesh.receiveShadow = mesh === trunks;
    spatialBatches(scene, mesh);
  }
  const rocks = new T.InstancedMesh(
    new T.IcosahedronGeometry(1, 1),
    new T.MeshStandardMaterial({ color: 0x8c8c7f, roughness: 1 }),
    180,
  );
  for (let i = 0; i < rocks.count; i++) {
    const p = lookupRoute(random() * route.distanceMeters);
    const offset = (i % 2 ? -1 : 1) * (7 + random() * 22);
    const x = p.x + Math.cos(p.heading) * offset,
      z = p.z - Math.sin(p.heading) * offset;
    const scale = 0.3 + random() * 1.2;
    place(rocks, i, x, terrainHeight(x, z), z, scale * 1.5, scale * 0.8, scale);
  }
  rocks.castShadow = true;
  spatialBatches(scene, rocks);
  const grass = new T.InstancedMesh(
    crownGeometry,
    vegetationMaterial("grass"),
    4200,
  );
  for (let i = 0; i < grass.count; i++) {
    const p = lookupRoute(random() * route.distanceMeters);
    const offset = (i % 2 ? -1 : 1) * (4.5 + random() * 15);
    const x = p.x + Math.cos(p.heading) * offset,
      z = p.z - Math.sin(p.heading) * offset;
    const height = 0.25 + random() * 0.55;
    place(grass, i, x, terrainHeight(x, z) + height / 2, z, 0.8, height, 0.8);
  }
  grass.receiveShadow = true;
  spatialBatches(scene, grass, 100);

  // Continuous, irregular ridgelines keep the horizon natural from every heading.
  for (let layer = 0; layer < 3; layer++) {
    const geometry = new T.PlaneGeometry(4200, 4200, 72, 72);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position;
    const ridgeColors: number[] = [];
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i),
        z = positions.getZ(i);
      const radius = Math.hypot(x, z),
        angle = Math.atan2(z, x);
      const ridge = Math.exp(
        -Math.pow((radius - (1050 + layer * 340)) / 220, 2),
      );
      const peak =
        180 +
        65 * Math.sin(angle * 7 + layer) +
        45 * Math.sin(angle * 13 + 2) +
        25 * Math.sin(x / 55 + z / 80);
      positions.setY(i, -30 + ridge * peak * (1 + layer * 0.35));
      const stone =
        Math.max(0, Math.sin(x / 43 + z / 51) * Math.cos(z / 37)) * ridge;
      color
        .set([0x73816c, 0x81938c, 0x9daeb0][layer])
        .lerp(new T.Color(0xb6b5a8), stone * 0.65);
      ridgeColors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute(
      "color",
      new T.Float32BufferAttribute(ridgeColors, 3),
    );
    geometry.computeVertexNormals();
    scene.add(
      new T.Mesh(
        geometry,
        new T.MeshStandardMaterial({
          vertexColors: true,
          roughness: 1,
        }),
      ),
    );
  }

  const wallMat = new T.MeshStandardMaterial({ color: 0xe0ddcf, roughness: 1 });
  const roofMat = new T.MeshStandardMaterial({ color: 0x655e59, roughness: 1 });
  const windowMat = new T.MeshStandardMaterial({
    color: 0x435e67,
    roughness: 0.3,
  });
  const trimMat = new T.MeshStandardMaterial({ color: 0xf3efe3 });
  const box = (
    group: T.Group,
    size: number[],
    pos: number[],
    material: T.Material,
  ) => {
    const mesh = new T.Mesh(new T.BoxGeometry(...size), material);
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const buildingParts = new Map<T.Material, T.BufferGeometry[]>();
  for (const distance of [75, 110, 610, 650, 1120]) {
    const p = lookupRoute(distance),
      offset = 22;
    const x = p.x + Math.cos(p.heading) * offset,
      z = p.z - Math.sin(p.heading) * offset;
    const house = new T.Group();
    house.position.set(x, terrainHeight(x, z), z);
    house.rotation.y = p.heading;
    box(house, [8, 5, 10], [0, 2.5, 0], wallMat);
    const gableShape = new T.Shape();
    gableShape.moveTo(-4, 5);
    gableShape.lineTo(0, 7.1);
    gableShape.lineTo(4, 5);
    gableShape.closePath();
    const gable = new T.Mesh(
      new T.ExtrudeGeometry(gableShape, { depth: 10, bevelEnabled: false }),
      wallMat,
    );
    gable.position.z = -5;
    gable.castShadow = true;
    house.add(gable);
    for (const z of [-5.05, 5.05]) {
      for (const x of [-2, 2]) {
        box(house, [1.5, 1.7, 0.12], [x, 3, z], trimMat);
        box(house, [1.2, 1.4, 0.15], [x, 3, z], windowMat);
      }
    }
    for (const side of [-1, 1]) {
      const roof = box(house, [5.2, 0.25, 11], [side * 2.1, 6, 0], roofMat);
      roof.rotation.z = -side * 0.48;
      for (const z of [-3, 0, 3]) {
        box(house, [0.15, 1.7, 1.5], [side * 4.05, 3, z], trimMat);
        box(house, [0.18, 1.4, 1.2], [side * 4.08, 3, z], windowMat);
      }
    }
    box(house, [0.2, 2.4, 1.2], [-4.1, 1.2, 1.7], roofMat);
    box(house, [0.8, 2.5, 0.8], [2, 6.5, -2], wallMat);
    house.updateMatrixWorld(true);
    house.traverse((object) => {
      if (!(object instanceof T.Mesh)) return;
      const material = object.material as T.Material;
      const parts = buildingParts.get(material) ?? [];
      const geometry = object.geometry.index
        ? object.geometry.toNonIndexed()
        : object.geometry.clone();
      geometry.applyMatrix4(object.matrixWorld);
      parts.push(geometry);
      buildingParts.set(material, parts);
      object.geometry.dispose();
    });
  }
  for (const [material, parts] of buildingParts) {
    const buildings = new T.Mesh(mergeGeometries(parts)!, material);
    buildings.castShadow = buildings.receiveShadow = true;
    scene.add(buildings);
    parts.forEach((geometry) => geometry.dispose());
  }
  const posts = new T.InstancedMesh(
    new T.BoxGeometry(0.12, 1, 0.12),
    trimMat,
    Math.floor(route.distanceMeters / 22) * 2,
  );
  for (let i = 0; i < posts.count; i++) {
    const p = lookupRoute(Math.floor(i / 2) * 22),
      side = i % 2 ? -1 : 1;
    place(
      posts,
      i,
      p.x + Math.cos(p.heading) * 4.5 * side,
      p.y + 0.45,
      p.z - Math.sin(p.heading) * 4.5 * side,
      1,
      1,
      1,
    );
  }
  scene.add(posts);
}
