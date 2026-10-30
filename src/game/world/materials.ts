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
  // Seeded fine relief keeps surfaces detailed without additional downloads.
  const reliefCanvas = document.createElement("canvas");
  reliefCanvas.width = reliefCanvas.height = 128;
  const reliefContext = reliefCanvas.getContext("2d");
  if (reliefContext) {
    const pixels = reliefContext.createImageData(128, 128);
    let seed = 1947;
    for (let i = 0; i < pixels.data.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const value = 90 + (seed % 76);
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value;
      pixels.data[i + 3] = 255;
    }
    reliefContext.putImageData(pixels, 0, 0);
    const bump = new T.CanvasTexture(reliefCanvas);
    bump.wrapS = bump.wrapT = T.RepeatWrapping;
    bump.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    textures.add(bump);
    for (const material of [road, gravel, grass]) {
      material.bumpMap = bump;
      material.bumpScale = material === road ? 0.025 : 0.12;
    }
  }
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
  grass.onBeforeCompile = (shader) => {
    // Triplanar sampling uses terrainPosition instead of vMapUv. Disable only
    // the vertex map UV output; the fragment shader still needs USE_MAP, and
    // bump-map UVs remain enabled independently through USE_BUMPMAP.
    shader.vertexShader =
      `#undef USE_MAP\nvarying vec3 terrainPosition; varying vec3 terrainNormal;\n${shader.vertexShader}`.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nterrainPosition = position; terrainNormal = normal;",
      );
    shader.fragmentShader =
      `varying vec3 terrainPosition; varying vec3 terrainNormal;
float surfaceHash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float surfaceNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(surfaceHash(i), surfaceHash(i+vec3(1,0,0)), f.x),
                 mix(surfaceHash(i+vec3(0,1,0)), surfaceHash(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(surfaceHash(i+vec3(0,0,1)), surfaceHash(i+vec3(1,0,1)), f.x),
                 mix(surfaceHash(i+vec3(0,1,1)), surfaceHash(i+vec3(1,1,1)), f.x), f.y), f.z);
}
${shader.fragmentShader}`.replace(
        "#include <map_fragment>",
        `#ifdef USE_MAP
      vec3 weights = pow(abs(normalize(terrainNormal)), vec3(4.0));
      weights /= max(dot(weights, vec3(1.0)), 0.0001);
      vec3 p = terrainPosition / 10.0;
      vec4 surfaceMap;
      if (weights.y > 0.995) {
        surfaceMap = texture2D(map, p.xz);
      } else {
        surfaceMap = texture2D(map, p.yz) * weights.x
          + texture2D(map, p.xz) * weights.y
          + texture2D(map, p.xy) * weights.z;
      }
      diffuseColor *= surfaceMap;
      #endif
      float slope = 1.0 - abs(normalize(terrainNormal).y);
      float broad = surfaceNoise(terrainPosition * 0.018) * 2.0 - 1.0;
      float detailFade = 1.0 - smoothstep(0.15, 0.65, length(fwidth(terrainPosition)));
      float grain = (surfaceNoise(terrainPosition * 3.0) - 0.5) * 0.16 * detailFade;
      float strata = surfaceNoise(terrainPosition * vec3(0.13, 0.9, 0.13));
      float stone = smoothstep(0.12, 0.48, slope);
      ${region === "alpine" ? "stone = max(stone, smoothstep(1450.0, 2100.0, terrainPosition.y) * 0.75);" : ""}
      vec3 rockTone = vec3(0.43, 0.42, 0.37) * (0.85 + grain + strata * 0.3 + broad * 0.12);
      vec3 soilTone = vec3(0.38, 0.30, 0.20);
      diffuseColor.rgb = mix(diffuseColor.rgb * (1.0 + broad * 0.12), soilTone, smoothstep(0.3, 0.9, broad) * 0.22);
      diffuseColor.rgb = mix(diffuseColor.rgb, rockTone, stone);`,
      );
  };
  const grassFar = grass.clone();
  grassFar.bumpMap = null;
  materials.add(grassFar);
  grassFar.onBeforeCompile = (shader, context) => {
    grass.onBeforeCompile(shader, context);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "float grain = (surfaceNoise(terrainPosition * 3.0) - 0.5) * 0.16 * detailFade;",
        "float grain = 0.0;",
      )
      .replace(
        "float strata = surfaceNoise(terrainPosition * vec3(0.13, 0.9, 0.13));",
        "float strata = 0.5;",
      );
  };
  grassFar.customProgramCacheKey = () => "terrain-distant-v1";
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
    grassFar,
    pine,
    broadleaf,
    facade,
    stone,
    roof,
    dark,
    rock,
    water,
    update(dt: number) {
      if (grassFar.map !== grass.map) {
        grassFar.map = grass.map;
        grassFar.needsUpdate = true;
      }
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
