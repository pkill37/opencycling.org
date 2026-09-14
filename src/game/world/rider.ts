import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const v = (x: number, y: number, z: number) => new T.Vector3(x, y, z);
const up = v(0, 1, 0);
const direction = new T.Vector3();
const crankCenter = v(0, 0.3, -0.06);
const crankLength = 0.165;
export const upperLegLength = 0.44;
export const lowerLegLength = 0.43;

export function pedalPosition(angle: number, side: number, target: T.Vector3) {
  return target.set(
    side * 0.115,
    crankCenter.y + Math.sin(angle) * crankLength,
    crankCenter.z + Math.cos(angle) * crankLength,
  );
}

// Solve the knee in the sagittal plane while preserving both bone lengths.
export function solveKnee(hip: T.Vector3, ankle: T.Vector3, target: T.Vector3) {
  const dy = ankle.y - hip.y,
    dz = ankle.z - hip.z;
  const distance = Math.hypot(dy, dz);
  const along =
    (upperLegLength ** 2 - lowerLegLength ** 2 + distance ** 2) /
    (2 * distance);
  const bend = Math.sqrt(Math.max(0, upperLegLength ** 2 - along ** 2));
  return target.set(
    hip.x,
    hip.y + (dy * along + dz * bend) / distance,
    hip.z + (dz * along - dy * bend) / distance,
  );
}

type Section = [height: number, width: number, depth: number];
function sculpt(sections: Section[], sides = 20) {
  const positions: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  sections.forEach(([height, width, depth], row) => {
    for (let i = 0; i <= sides; i++) {
      const angle = (i / sides) * Math.PI * 2;
      positions.push(Math.sin(angle) * width, height, Math.cos(angle) * depth);
      uvs.push(i / sides, height / sections[sections.length - 1][0]);
      if (row && i) {
        const a = row * (sides + 1) + i;
        indices.push(a - 1, a - sides - 2, a, a - sides - 2, a - sides - 1, a);
      }
    }
  });
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function jerseyTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#c34d32";
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "#303d3e";
  ctx.fillRect(43, 0, 28, 256);
  ctx.fillRect(185, 0, 28, 256);
  ctx.fillStyle = "#dcded6";
  ctx.fillRect(0, 67, 256, 5);
  ctx.fillRect(0, 77, 256, 2);
  ctx.strokeStyle = "rgba(25,25,25,0.22)";
  for (let x = 1; x < 256; x += 3) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 256);
    ctx.stroke();
  }
  ctx.fillStyle = "#f2f1e9";
  ctx.textAlign = "center";
  ctx.font = "600 13px sans-serif";
  ctx.fillText("OPENRIDE", 128, 106);
  ctx.strokeStyle = "#a33d2b";
  ctx.lineWidth = 2;
  for (const x of [102, 128, 154]) ctx.strokeRect(x - 12, 167, 24, 43);
  ctx.fillStyle = "#efeee6";
  ctx.fillRect(117, 221, 22, 3);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function createRider() {
  const group = new T.Group();
  group.name = "Cyclist";
  const bike = new T.Group(),
    body = new T.Group();
  group.add(bike, body);
  const carbon = new T.MeshStandardMaterial({
    color: 0x202426,
    roughness: 0.4,
  });
  const rubber = new T.MeshStandardMaterial({
    color: 0x171919,
    roughness: 0.95,
  });
  const paint = new T.MeshStandardMaterial({
    color: 0x8dafa4,
    metalness: 0.55,
    roughness: 0.25,
  });
  const metal = new T.MeshStandardMaterial({
    color: 0xabb2b5,
    metalness: 0.8,
    roughness: 0.26,
  });
  const skin = new T.MeshStandardMaterial({ color: 0xb98465, roughness: 0.8 });
  const kit = new T.MeshStandardMaterial({
    map: jerseyTexture(),
    roughness: 0.94,
  });
  const sleeves = new T.MeshStandardMaterial({
    color: 0xc34d32,
    roughness: 0.94,
  });
  const bib = new T.MeshStandardMaterial({ color: 0x232a2e, roughness: 0.98 });
  const white = new T.MeshStandardMaterial({
    color: 0xe6e7df,
    roughness: 0.65,
  });
  const shell = new T.MeshStandardMaterial({ color: 0xeceee7, roughness: 0.3 });
  const lens = new T.MeshStandardMaterial({
    color: 0x314946,
    metalness: 0.65,
    roughness: 0.15,
  });
  const sphere = new T.SphereGeometry(1, 20, 12);
  const add = (
    parent: T.Group,
    geometry: T.BufferGeometry,
    material: T.Material,
  ) => {
    const mesh = new T.Mesh(geometry, material);
    parent.add(mesh);
    return mesh;
  };
  const ellipsoid = (
    parent: T.Group,
    pos: T.Vector3,
    scale: T.Vector3,
    material: T.Material,
  ) => {
    const mesh = add(parent, sphere, material);
    mesh.position.copy(pos);
    mesh.scale.copy(scale);
    return mesh;
  };
  const pose = (mesh: T.Object3D, a: T.Vector3, b: T.Vector3) => {
    mesh.position.copy(a);
    mesh.quaternion.setFromUnitVectors(
      up,
      direction.copy(b).sub(a).normalize(),
    );
  };
  const tube = (
    parent: T.Group,
    a: T.Vector3,
    b: T.Vector3,
    radius: number,
    material: T.Material,
  ) => {
    const geometry = new T.CylinderGeometry(
      radius,
      radius,
      a.distanceTo(b),
      10,
    );
    geometry.translate(0, a.distanceTo(b) / 2, 0);
    const mesh = add(parent, geometry, material);
    pose(mesh, a, b);
    return mesh;
  };
  const curveTube = (
    parent: T.Group,
    points: T.Vector3[],
    radius: number,
    material: T.Material,
    segments = 20,
  ) =>
    add(
      parent,
      new T.TubeGeometry(
        new T.CatmullRomCurve3(points),
        segments,
        radius,
        6,
        false,
      ),
      material,
    );

  const wheels: T.Group[] = [];
  for (const z of [-0.54, 0.54]) {
    const wheel = new T.Group();
    wheel.position.set(0, 0.34, z);
    const tire = add(wheel, new T.TorusGeometry(0.319, 0.021, 8, 48), rubber);
    tire.rotation.y = Math.PI / 2;
    const rim = add(wheel, new T.TorusGeometry(0.295, 0.017, 6, 48), carbon);
    rim.rotation.y = Math.PI / 2;
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      tube(
        wheel,
        v(i % 2 ? -0.022 : 0.022, 0, 0),
        v(0, Math.sin(angle) * 0.29, Math.cos(angle) * 0.29),
        0.0025,
        metal,
      );
    }
    tube(wheel, v(-0.04, 0, 0), v(0.04, 0, 0), 0.02, metal);
    const disc = add(wheel, new T.TorusGeometry(0.072, 0.006, 4, 24), metal);
    disc.rotation.y = Math.PI / 2;
    disc.position.x = -0.036;
    group.add(wheel);
    wheels.push(wheel);
  }
  const seatTube = v(0, 0.79, -0.19),
    headTube = v(0, 0.8, 0.39);
  for (const [a, b] of [
    [crankCenter, seatTube],
    [seatTube, headTube],
    [headTube, crankCenter],
  ])
    tube(bike, a, b, 0.023, paint);
  tube(bike, seatTube, v(0, 0.95, -0.23), 0.014, carbon);
  for (const side of [-1, 1]) {
    tube(bike, v(side * 0.034, 0.34, -0.54), seatTube, 0.011, paint);
    tube(bike, v(side * 0.034, 0.34, -0.54), crankCenter, 0.014, paint);
    curveTube(
      bike,
      [headTube, v(side * 0.032, 0.58, 0.45), v(side * 0.032, 0.34, 0.54)],
      0.015,
      paint,
    );
  }
  ellipsoid(bike, v(0, 0.965, -0.24), v(0.072, 0.025, 0.14), carbon);
  tube(bike, headTube, v(0, 0.94, 0.41), 0.015, carbon);
  tube(bike, v(0, 0.94, 0.41), v(0, 0.965, 0.51), 0.018, carbon);
  tube(bike, v(-0.21, 0.965, 0.51), v(0.21, 0.965, 0.51), 0.015, carbon);
  for (const side of [-1, 1]) {
    curveTube(
      bike,
      [
        v(side * 0.21, 0.965, 0.51),
        v(side * 0.21, 0.96, 0.61),
        v(side * 0.21, 0.86, 0.64),
        v(side * 0.21, 0.82, 0.51),
      ],
      0.018,
      rubber,
    );
    ellipsoid(
      bike,
      v(side * 0.21, 0.985, 0.555),
      v(0.024, 0.035, 0.052),
      rubber,
    );
    tube(
      bike,
      v(side * 0.215, 0.94, 0.6),
      v(side * 0.215, 0.85, 0.58),
      0.007,
      metal,
    );
  }
  const bottle = add(
    bike,
    new T.CylinderGeometry(0.032, 0.029, 0.16, 12),
    white,
  );
  bottle.position.set(0, 0.53, 0.13);
  bottle.rotation.x = -0.6;
  ellipsoid(bike, v(0, 0.61, 0.085), v(0.018, 0.018, 0.018), carbon);
  for (const offset of [-0.09, 0.09])
    tube(
      bike,
      v(0.073, 0.3 + offset, -0.06),
      v(0.073, 0.34 + offset * 0.35, -0.54),
      0.003,
      metal,
    );
  const chainring = add(bike, new T.TorusGeometry(0.092, 0.008, 6, 32), metal);
  chainring.rotation.y = Math.PI / 2;
  chainring.position.copy(crankCenter);
  chainring.position.x = 0.072;

  const torso = add(
    body,
    sculpt(
      [
        [0, 0.145, 0.09],
        [0.045, 0.165, 0.105],
        [0.14, 0.145, 0.095],
        [0.28, 0.17, 0.105],
        [0.4, 0.205, 0.1],
        [0.48, 0.215, 0.095],
        [0.54, 0.17, 0.08],
        [0.58, 0.065, 0.052],
      ],
      32,
    ),
    kit,
  );
  torso.position.set(0, 1.01, -0.24);
  torso.rotation.x = 0.94;
  ellipsoid(body, v(0, 0.99, -0.255), v(0.15, 0.105, 0.125), bib);
  tube(body, v(0, 1.345, 0.23), v(0, 1.445, 0.305), 0.047, skin);
  const head = ellipsoid(body, v(0, 1.5, 0.335), v(0.089, 0.116, 0.103), skin);
  head.rotation.x = 0.12;
  ellipsoid(body, v(0, 1.454, 0.387), v(0.064, 0.057, 0.067), skin);
  ellipsoid(body, v(0, 1.491, 0.435), v(0.019, 0.033, 0.029), skin);
  for (const side of [-1, 1]) {
    ellipsoid(
      body,
      v(side * 0.089, 1.487, 0.331),
      v(0.014, 0.026, 0.018),
      skin,
    );
    curveTube(
      body,
      [
        v(side * 0.083, 1.56, 0.28),
        v(side * 0.088, 1.435, 0.33),
        v(side * 0.072, 1.55, 0.4),
      ],
      0.006,
      carbon,
    );
    tube(
      body,
      v(side * 0.086, 1.525, 0.31),
      v(side * 0.078, 1.525, 0.423),
      0.006,
      carbon,
    );
  }
  ellipsoid(body, v(0, 1.526, 0.426), v(0.088, 0.03, 0.023), lens);
  ellipsoid(body, v(0, 1.578, 0.32), v(0.112, 0.067, 0.15), carbon);
  // Separate shell ribs leave visible dark ventilation channels along the helmet.
  for (let rib = -3; rib <= 3; rib++) {
    const points: T.Vector3[] = [];
    const lateral = rib * 0.027;
    for (let i = 0; i <= 12; i++) {
      const angle = -1.32 + (i / 12) * 2.66;
      points.push(
        v(
          lateral,
          1.575 + Math.cos(angle) * Math.sqrt(1 - (lateral / 0.12) ** 2) * 0.09,
          0.32 + Math.sin(angle) * 0.155,
        ),
      );
    }
    curveTube(body, points, rib === 0 ? 0.016 : 0.011, shell, 18);
  }
  ellipsoid(body, v(0, 1.575, 0.167), v(0.035, 0.025, 0.014), rubber);

  for (const side of [-1, 1]) {
    const shoulder = v(side * 0.195, 1.31, 0.17),
      elbow = v(side * 0.23, 1.1, 0.3),
      wrist = v(side * 0.21, 0.994, 0.54);
    const arm = add(
      body,
      sculpt([
        [0, 0.025, 0.03],
        [0.03, 0.065, 0.067],
        [0.11, 0.057, 0.055],
        [0.19, 0.045, 0.046],
        [shoulder.distanceTo(elbow), 0.038, 0.038],
      ]),
      skin,
    );
    pose(arm, shoulder, elbow);
    const sleeve = add(
      body,
      sculpt([
        [0, 0.03, 0.03],
        [0.025, 0.069, 0.07],
        [0.09, 0.063, 0.061],
        [0.15, 0.055, 0.055],
      ]),
      sleeves,
    );
    pose(sleeve, shoulder, elbow);
    const forearm = add(
      body,
      sculpt([
        [0, 0.038, 0.038],
        [0.07, 0.044, 0.044],
        [0.17, 0.033, 0.034],
        [elbow.distanceTo(wrist), 0.025, 0.026],
      ]),
      skin,
    );
    pose(forearm, elbow, wrist);
    ellipsoid(body, elbow, v(0.039, 0.04, 0.04), skin);
    ellipsoid(
      body,
      wrist.clone().add(v(0, -0.015, 0.022)),
      v(0.031, 0.025, 0.048),
      bib,
    );
    ellipsoid(body, v(side * 0.192, 0.975, 0.575), v(0.016, 0.02, 0.028), skin);
  }

  const legs = [-1, 1].map((side) => {
    const thigh = add(
      group,
      sculpt([
        [0, 0.062, 0.068],
        [0.06, 0.094, 0.094],
        [0.15, 0.091, 0.087],
        [0.28, 0.065, 0.065],
        [0.38, 0.048, 0.052],
        [upperLegLength, 0.043, 0.045],
      ]),
      skin,
    );
    const shorts = add(
      group,
      sculpt([
        [0, 0.07, 0.075],
        [0.05, 0.098, 0.098],
        [0.15, 0.095, 0.091],
        [0.26, 0.074, 0.075],
        [0.285, 0.069, 0.07],
      ]),
      bib,
    );
    const calf = add(
      group,
      sculpt([
        [0, 0.043, 0.045],
        [0.07, 0.049, 0.052],
        [0.15, 0.057, 0.058],
        [0.24, 0.043, 0.048],
        [0.35, 0.026, 0.033],
        [lowerLegLength, 0.025, 0.028],
      ]),
      skin,
    );
    const sock = add(
      group,
      sculpt([
        [0, 0.026, 0.03],
        [0.09, 0.03, 0.037],
        [0.16, 0.04, 0.045],
      ]),
      white,
    );
    const kneeCap = ellipsoid(group, v(0, 0, 0), v(0.044, 0.046, 0.049), skin);
    const shoe = new T.Group();
    ellipsoid(shoe, v(0, 0.012, 0.035), v(0.046, 0.037, 0.125), shell);
    ellipsoid(shoe, v(0, -0.014, 0.035), v(0.046, 0.012, 0.126), carbon);
    for (const z of [0, 0.047])
      ellipsoid(shoe, v(0, 0.048, z), v(0.014, 0.006, 0.013), carbon);
    group.add(shoe);
    const crank = add(
      group,
      new T.CylinderGeometry(0.009, 0.013, crankLength, 8),
      metal,
    );
    crank.geometry.translate(0, crankLength / 2, 0);
    const pedal = add(group, new T.BoxGeometry(0.07, 0.015, 0.05), carbon);
    return {
      side,
      thigh,
      shorts,
      calf,
      sock,
      kneeCap,
      shoe,
      crank,
      pedal,
      hip: v(side * 0.115, 1.015, -0.24),
      ankle: v(0, 0, 0),
      knee: v(0, 0, 0),
      foot: v(0, 0, 0),
      crankRoot: v(side * 0.115, crankCenter.y, crankCenter.z),
    };
  });

  // Combine stationary details by material, retaining independent animated joints.
  const mergeParts = (parent: T.Group) => {
    parent.updateMatrixWorld(true);
    const batches = new Map<T.Material, T.BufferGeometry[]>();
    for (const object of [...parent.children]) {
      if (!(object instanceof T.Mesh)) continue;
      const geometry = object.geometry.index
        ? object.geometry.toNonIndexed()
        : object.geometry.clone();
      geometry.applyMatrix4(object.matrix);
      const parts = batches.get(object.material) ?? [];
      parts.push(geometry);
      batches.set(object.material, parts);
      if (object.geometry !== sphere) object.geometry.dispose();
      parent.remove(object);
    }
    for (const [material, parts] of batches) {
      add(parent, mergeGeometries(parts)!, material);
      parts.forEach((geometry) => geometry.dispose());
    }
  };
  for (const parent of [bike, body, ...wheels, ...legs.map((leg) => leg.shoe)])
    mergeParts(parent);
  group.traverse((object) => {
    if (object instanceof T.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  let phase = 0;
  const update = (dt: number, cadence: number, speed: number) => {
    phase = (phase + (cadence / 60) * Math.PI * 2 * dt) % (Math.PI * 2);
    for (const wheel of wheels)
      wheel.rotation.x =
        (wheel.rotation.x + (speed / 0.34) * dt) % (Math.PI * 2);
    for (const leg of legs) {
      const angle = phase + (leg.side === 1 ? Math.PI : 0);
      pedalPosition(angle, leg.side, leg.foot);
      leg.ankle.copy(leg.foot);
      leg.ankle.y += 0.085;
      leg.ankle.z -= 0.035;
      solveKnee(leg.hip, leg.ankle, leg.knee);
      pose(leg.thigh, leg.hip, leg.knee);
      pose(leg.shorts, leg.hip, leg.knee);
      pose(leg.calf, leg.knee, leg.ankle);
      pose(leg.sock, leg.ankle, leg.knee);
      leg.kneeCap.position.copy(leg.knee);
      leg.shoe.position.copy(leg.foot);
      pose(leg.crank, leg.crankRoot, leg.foot);
      leg.pedal.position.copy(leg.foot);
      leg.pedal.position.y -= 0.025;
    }
  };
  update(0, 0, 0);
  return { group, update };
}
