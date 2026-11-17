import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const profiles = [
  {
    name: "Shambler",
    skin: 0x99ad87,
    cloth: 0x673e37,
    width: 1,
    height: 1,
    lean: 0.18,
  },
  {
    name: "Brute",
    skin: 0xa3a58b,
    cloth: 0x354858,
    width: 1.2,
    height: 0.96,
    lean: 0.25,
  },
  {
    name: "Lurker",
    skin: 0x819c91,
    cloth: 0x66583d,
    width: 0.85,
    height: 1.09,
    lean: 0.12,
  },
  {
    name: "Ragged",
    skin: 0xb2b091,
    cloth: 0x554256,
    width: 0.98,
    height: 1.03,
    lean: 0.22,
  },
];

// Keep detailed faces and torn clothing inexpensive by batching each rigid joint.
function batch(group: T.Group) {
  for (const child of [...group.children])
    if (child instanceof T.Group) batch(child);
  const byMaterial = new Map<T.Material, T.BufferGeometry[]>();
  for (const child of [...group.children]) {
    if (!(child instanceof T.Mesh) || Array.isArray(child.material)) continue;
    child.updateMatrix();
    const geometry = (
      child.geometry.index
        ? child.geometry.toNonIndexed()
        : child.geometry.clone()
    ).applyMatrix4(child.matrix);
    const parts = byMaterial.get(child.material) ?? [];
    parts.push(geometry);
    byMaterial.set(child.material, parts);
    group.remove(child);
    child.geometry.dispose();
  }
  for (const [material, parts] of byMaterial) {
    const merged = mergeGeometries(parts, false);
    if (merged) {
      const mesh = new T.Mesh(merged, material);
      mesh.castShadow = true;
      group.add(mesh);
    }
    parts.forEach((part) => part.dispose());
  }
}

export function createZombie(index: number) {
  const profile = profiles[index % profiles.length];
  const group = new T.Group();
  group.name = `Zombie ${profile.name}`;
  group.scale.set(profile.width, profile.height, profile.width);
  const material = (color: number) =>
    new T.MeshStandardMaterial({ color, roughness: 0.98, flatShading: true });
  const skin = material(profile.skin),
    cloth = material(profile.cloth);
  const darkCloth = material(0x292d2d),
    socket = material(0x292c25);
  const bone = material(0xd4c8a3),
    shoes = material(0x242622);
  const eyes = new T.MeshStandardMaterial({
    color: 0xe3ca64,
    emissive: 0xc5a52d,
    emissiveIntensity: 1.1,
  });
  const add = (
    parent: T.Group,
    geometry: T.BufferGeometry,
    mat: T.Material,
    x = 0,
    y = 0,
    z = 0,
  ) => {
    const mesh = new T.Mesh(geometry, mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const box = (
    parent: T.Group,
    mat: T.Material,
    w: number,
    h: number,
    d: number,
    x = 0,
    y = 0,
    z = 0,
  ) => add(parent, new T.BoxGeometry(w, h, d), mat, x, y, z);
  const rag = (
    parent: T.Group,
    x: number,
    y: number,
    z: number,
    width: number,
    length: number,
  ) => {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute(
      "position",
      new T.Float32BufferAttribute(
        [
          x - width / 2,
          y,
          z,
          x + width / 2,
          y,
          z,
          x + width / 4,
          y - length,
          z + 0.025,
          x + width / 2,
          y,
          z,
          x - width / 2,
          y,
          z,
          x + width / 4,
          y - length,
          z + 0.025,
        ],
        3,
      ),
    );
    geometry.setAttribute(
      "uv",
      new T.Float32BufferAttribute(new Float32Array(12), 2),
    );
    geometry.computeVertexNormals();
    add(parent, geometry, cloth);
  };
  const torso = new T.Group();
  torso.position.y = 0.87;
  group.add(torso);
  add(torso, new T.CylinderGeometry(0.28, 0.2, 0.6, 7), cloth, 0, 0.35);
  box(torso, darkCloth, 0.37, 0.2, 0.3, 0, -0.03);
  // Uneven jacket hem, exposed chest and a ragged collar.
  box(torso, skin, 0.12, 0.25, 0.025, 0.08, 0.47, 0.25);
  box(torso, socket, 0.025, 0.2, 0.03, 0.07, 0.46, 0.27);
  rag(torso, -0.18, 0.13, 0.2, 0.13, 0.22);
  rag(torso, 0.12, 0.13, 0.2, 0.12, 0.13);
  rag(torso, -0.08, 0.65, 0.2, 0.13, 0.2);
  rag(torso, 0.14, 0.65, 0.2, 0.1, 0.12);
  rag(torso, 0.1, 0.2, -0.22, 0.14, 0.23);
  const head = new T.Group();
  head.position.set(0.015, 0.77, 0.08);
  torso.add(head);
  add(head, new T.CylinderGeometry(0.065, 0.08, 0.2, 6), skin, 0, -0.03);
  const skull = add(head, new T.DodecahedronGeometry(0.23), skin, 0, 0.14);
  skull.scale.set(0.92, 1.05, 0.85);
  for (const side of [-1, 1]) {
    const hollow = add(
      head,
      new T.SphereGeometry(0.065, 6, 4),
      socket,
      side * 0.095,
      0.17,
      0.17,
    );
    hollow.scale.set(1.1, 0.85, 0.5);
    add(
      head,
      new T.SphereGeometry(0.026, 6, 4),
      eyes,
      side * 0.095,
      0.17,
      0.201,
    );
    const brow = box(head, skin, 0.13, 0.035, 0.055, side * 0.1, 0.23, 0.18);
    brow.rotation.z = side * -0.16;
    add(head, new T.DodecahedronGeometry(0.044), skin, side * 0.22, 0.13, 0);
  }
  box(head, skin, 0.045, 0.08, 0.075, 0, 0.105, 0.205);
  box(head, socket, 0.23, 0.105, 0.035, 0, 0.015, 0.19);
  const jaw = new T.Group();
  jaw.position.set(0, 0.03, 0.08);
  head.add(jaw);
  box(jaw, skin, 0.24, 0.09, 0.17, 0, -0.09, 0.07);
  for (let tooth = 0; tooth < 5; tooth++) {
    box(
      head,
      bone,
      0.023,
      tooth % 2 ? 0.035 : 0.027,
      0.02,
      -0.084 + tooth * 0.042,
      0.05,
      0.215,
    );
    box(jaw, bone, 0.022, 0.027, 0.02, -0.084 + tooth * 0.042, -0.028, 0.145);
  }
  const arms: T.Group[] = [];
  const elbows: T.Group[] = [];
  const legs: T.Group[] = [];
  const knees: T.Group[] = [];
  for (const side of [-1, 1]) {
    const arm = new T.Group();
    arm.position.set(side * 0.31, 0.57, 0);
    torso.add(arm);
    add(
      arm,
      new T.CapsuleGeometry(0.075, 0.27, 3, 6),
      side === -1 ? skin : cloth,
      0,
      -0.17,
    );
    if (side === 1) rag(arm, 0, -0.28, 0.06, 0.15, 0.13);
    const elbow = new T.Group();
    elbow.position.y = -0.37;
    arm.add(elbow);
    add(elbow, new T.CapsuleGeometry(0.055, 0.26, 3, 6), skin, 0, -0.16);
    box(elbow, skin, 0.12, 0.15, 0.065, 0, -0.36, 0.02);
    for (let finger = 0; finger < 3; finger++) {
      const digit = box(
        elbow,
        bone,
        0.025,
        0.13,
        0.025,
        (finger - 1) * 0.04,
        -0.48,
        0.045,
      );
      digit.rotation.x = -0.25 - finger * 0.15;
    }
    arms.push(arm);
    elbows.push(elbow);
    const leg = new T.Group();
    leg.position.set(side * 0.14, 0.87, 0);
    group.add(leg);
    add(leg, new T.CapsuleGeometry(0.105, 0.26, 3, 6), darkCloth, 0, -0.18);
    const knee = new T.Group();
    knee.position.y = -0.4;
    leg.add(knee);
    add(knee, new T.CapsuleGeometry(0.075, 0.26, 3, 6), skin, 0, -0.17);
    box(knee, darkCloth, 0.17, 0.13, 0.16, 0, -0.06);
    box(knee, shoes, 0.19, 0.13, 0.32, 0, -0.4, 0.065);
    legs.push(leg);
    knees.push(knee);
  }
  batch(group);
  return {
    group,
    update(elapsedSeconds: number, feeding: boolean) {
      const phase = elapsedSeconds * (feeding ? 15 : 10) + index * 1.9;
      torso.rotation.x =
        profile.lean + (feeding ? 0.55 : Math.sin(phase * 0.5) * 0.035);
      torso.rotation.z = Math.sin(phase) * (feeding ? 0.035 : 0.06);
      head.rotation.set(
        0.08 + Math.sin(phase * 0.6) * 0.08,
        Math.sin(phase * 0.33) * 0.12,
        -0.1 + index * 0.04,
      );
      jaw.rotation.x =
        -0.2 - (Math.sin(phase * 0.7) + 1) * (feeding ? 0.22 : 0.08);
      arms.forEach((arm, side) => {
        const stride = Math.sin(phase + side * Math.PI);
        arm.rotation.set(
          (feeding ? -0.45 : -0.95) + stride * 0.25,
          0,
          side ? -0.16 : 0.16,
        );
        elbows[side].rotation.x = -0.25 - Math.max(0, stride) * 0.3;
        legs[side].rotation.x = feeding ? side * 0.15 : stride * 0.36;
        knees[side].rotation.x = feeding ? 0.2 : Math.max(0, -stride) * 0.45;
      });
    },
  };
}
