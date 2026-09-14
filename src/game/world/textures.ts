import * as T from "three";

const names = [
  "sky",
  "grass",
  "road",
  "gravel",
  "broadleaf",
  "pine",
  "tuft",
] as const;
type TextureName = (typeof names)[number];
const images = new Map<TextureName, HTMLImageElement>();
let pending: Promise<void> | undefined;

export function preloadWorldTextures() {
  pending ??= Promise.all(
    names.map(async (name) => {
      const image = new Image();
      image.src = `/world/${name}.webp`;
      await image.decode();
      images.set(name, image);
    }),
  )
    .then(() => {})
    .catch((error: unknown) => {
      pending = undefined;
      throw error;
    });
  return pending;
}

export function worldTexture(name: TextureName) {
  const image = images.get(name);
  if (!image) throw new Error(`World texture ${name} has not loaded`);
  // Share decoded images, but let each ride own and dispose its GPU textures.
  const texture = new T.Texture(image);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}
