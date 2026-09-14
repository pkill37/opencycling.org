import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { worldTexture } from "./textures";

// Fine foliage comes from shared cutout textures instead of individual leaf meshes.
export function vegetationMaterial(kind: "broadleaf" | "pine" | "grass") {
  const map = worldTexture(kind === "grass" ? "tuft" : kind);
  const material = new T.MeshStandardMaterial({
    map,
    alphaTest: 0.45,
    side: T.DoubleSide,
    roughness: 1,
  });
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_begin>",
      "#include <normal_fragment_begin>\nnormal *= faceDirection;",
    );
  };
  material.customProgramCacheKey = () => "foliage-upward-normal";
  return material;
}

export function foliageGeometry() {
  const planes = Array.from({ length: 3 }, (_, i) => {
    const plane = new T.PlaneGeometry(1, 1);
    plane.rotateY((i * Math.PI) / 3);
    return plane;
  });
  const merged = mergeGeometries(planes)!;
  // Upward normals give leaf cards consistent soft lighting across viewing angles.
  const normals = merged.attributes.normal;
  for (let i = 0; i < normals.count; i++) normals.setXYZ(i, 0, 1, 0);
  planes.forEach((plane) => plane.dispose());
  return merged;
}

export function spatialBatches(
  scene: T.Scene,
  source: T.InstancedMesh,
  cellSize = 160,
) {
  const cells = new Map<string, number[]>();
  const matrix = new T.Matrix4(),
    color = new T.Color();
  for (let i = 0; i < source.count; i++) {
    source.getMatrixAt(i, matrix);
    const key = `${Math.floor(matrix.elements[12] / cellSize)},${Math.floor(matrix.elements[14] / cellSize)}`;
    const indices = cells.get(key) ?? [];
    indices.push(i);
    cells.set(key, indices);
  }
  for (const indices of cells.values()) {
    const mesh = new T.InstancedMesh(
      source.geometry,
      source.material,
      indices.length,
    );
    indices.forEach((sourceIndex, i) => {
      source.getMatrixAt(sourceIndex, matrix);
      mesh.setMatrixAt(i, matrix);
      if (source.instanceColor) {
        source.getColorAt(sourceIndex, color);
        mesh.setColorAt(i, color);
      }
    });
    mesh.castShadow = source.castShadow;
    mesh.receiveShadow = source.receiveShadow;
    mesh.computeBoundingSphere();
    scene.add(mesh);
  }
  source.dispose();
}
