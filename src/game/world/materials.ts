import * as T from "three";
import type { Region } from "./landscape";

export function createWorldMaterials(
  renderer: T.WebGLRenderer,
  region: Region,
) {
  let disposed = false;
  const textures = new Set<T.Texture>();
  const materials = new Set<T.Material>();
  const loader = new T.TextureLoader();
  const standard = (parameters: T.MeshStandardMaterialParameters) => {
    const material = new T.MeshStandardMaterial(parameters);
    materials.add(material);
    return material;
  };
  const load = (
    name: string,
    material: T.MeshStandardMaterial,
    cutout = false,
  ) => {
    const texture = loader.load(
      `/world/${name}.webp`,
      (loaded) => {
        if (disposed) {
          loaded.dispose();
          return;
        }
        material.map = loaded;
        if (cutout) {
          material.alphaTest = 0.45;
          material.side = T.DoubleSide;
        }
        material.needsUpdate = true;
      },
      undefined,
      () => {
        // Keep a usable solid-colour material when an asset is unavailable.
        if (disposed) return;
        material.map = null;
        material.needsUpdate = true;
      },
    );
    texture.colorSpace = T.SRGBColorSpace;
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    textures.add(texture);
  };
  const road = standard({ color: 0xb0b0aa, roughness: 0.96 });
  const gravel = standard({
    color: region === "mediterranean" ? 0xd8c6a5 : 0xb2aa94,
    roughness: 1,
  });
  const grass = standard({
    color: region === "mediterranean" ? 0xb4ad75 : 0x91a775,
    roughness: 1,
    vertexColors: true,
  });
  const pine = standard({ color: 0xc0cbb3, roughness: 1, side: T.DoubleSide });
  const broadleaf = standard({
    color: region === "mediterranean" ? 0x939e76 : 0xc6d0ab,
    roughness: 1,
    side: T.DoubleSide,
  });
  load("road", road);
  load("gravel", gravel);
  load("grass", grass);
  load("pine", pine, true);
  load("broadleaf", broadleaf, true);

  // Small repeatable patterns avoid shipping facade/stone texture libraries.
  const pattern = (kind: "facade" | "stone" | "roof") => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const random = (n: number) => (Math.imul(n + 17, 16807) >>> 0) % 255;
    ctx.fillStyle =
      kind === "facade"
        ? region === "mediterranean"
          ? "#ddc3a0"
          : "#ded6c5"
        : kind === "roof"
          ? region === "paris"
            ? "#646b74"
            : "#8f6652"
          : "#bbb5a3";
    ctx.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 32) {
      for (let x = 0; x < 128; x += 32) {
        if (kind === "facade") {
          ctx.fillStyle = "#bcb29e";
          ctx.fillRect(x + 8, y + 5, 17, 24);
          ctx.fillStyle = "#344550";
          ctx.fillRect(x + 10, y + 7, 12, 19);
          ctx.fillStyle = "#a39b89";
          ctx.fillRect(x + 8, y + 28, 18, 2);
          ctx.fillStyle = "#b7b6aa";
          ctx.fillRect(x + 15, y + 7, 1, 19);
        } else {
          const tone = random(x + y * 31) / 255;
          ctx.fillStyle = `rgba(30,25,20,${0.06 + tone * 0.16})`;
          ctx.fillRect(x + (y % 64 ? 0 : 8), y, 30, kind === "roof" ? 10 : 30);
        }
      }
    }
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    textures.add(texture);
    return texture;
  };
  const facade = standard({ map: pattern("facade"), roughness: 0.95 });
  const stone = standard({
    map: pattern("stone"),
    color: 0xd3cbbb,
    roughness: 1,
  });
  const roof = standard({ map: pattern("roof"), roughness: 0.9 });
  const dark = standard({ color: 0x39443e, roughness: 0.8 });
  const rock = standard({
    color: region === "mediterranean" ? 0xc7bda4 : 0x97998d,
    roughness: 1,
  });
  const water = standard({
    color: region === "paris" ? 0x476d68 : 0x228d9e,
    roughness: 0.28,
    metalness: 0.25,
  });
  // Moving analytic wave normals: no reflection pass, external shaders, or time in physics.
  const time = { value: 0 };
  water.onBeforeCompile = (shader) => {
    shader.uniforms.sceneryTime = time;
    shader.vertexShader =
      `varying vec2 waterPosition;\n${shader.vertexShader}`.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nwaterPosition = position.xz;",
      );
    shader.fragmentShader =
      `uniform float sceneryTime;\nvarying vec2 waterPosition;\n${shader.fragmentShader}`.replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
      normal = normalize(normal + vec3(sin(waterPosition.x * 0.17 + sceneryTime * 0.7) * 0.13, cos(waterPosition.y * 0.23 + sceneryTime * 0.5) * 0.1, 0.0));`,
      );
  };
  return {
    road,
    gravel,
    grass,
    pine,
    broadleaf,
    facade,
    stone,
    roof,
    dark,
    rock,
    water,
    update(dt: number) {
      time.value += Math.max(0, dt);
    },
    owns(resource: T.Material | T.Texture) {
      return resource instanceof T.Texture
        ? textures.has(resource)
        : materials.has(resource);
    },
    dispose() {
      disposed = true;
      textures.forEach((texture) => texture.dispose());
      materials.forEach((material) => material.dispose());
    },
  };
}
export type WorldMaterials = ReturnType<typeof createWorldMaterials>;
