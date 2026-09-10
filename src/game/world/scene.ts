import * as T from "three";
import { route, lookupRoute, terrainHeight } from "../route/route";
import type { RideEngine } from "../loop/engine";
const up = new T.Vector3(0, 1, 0);
function rod(a: T.Vector3, b: T.Vector3, r: number, material: T.Material) {
  const mesh = new T.Mesh(
    new T.CylinderGeometry(r, r, a.distanceTo(b), 6),
    material,
  );
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
  return mesh;
}
function ribbon(width: number, offset: number, lift: number, color: number) {
  const positions: number[] = [],
    indices: number[] = [];
  route.points.forEach((p, i) => {
    const a = route.points[Math.max(0, i - 1)],
      b = route.points[Math.min(route.points.length - 1, i + 1)],
      heading = Math.atan2(b.x - a.x, b.z - a.z);
    for (const side of [-1, 1]) {
      const lateral = offset + (side * width) / 2;
      positions.push(
        p.x + Math.cos(heading) * lateral,
        p.y + lift,
        p.z - Math.sin(heading) * lateral,
      );
    }
    if (i) {
      const n = i * 2;
      indices.push(n - 2, n - 1, n, n - 1, n + 1, n);
    }
  });
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return new T.Mesh(
    geometry,
    new T.MeshStandardMaterial({ color, roughness: 1, side: T.DoubleSide }),
  );
}
export function createWorld(host: HTMLElement, engine: RideEngine) {
  const scene = new T.Scene();
  scene.background = new T.Color("#bededb");
  scene.fog = new T.Fog("#bededb", 160, 700);
  const renderer = new T.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
  renderer.setSize(host.clientWidth, host.clientHeight);
  renderer.outputColorSpace = T.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  const camera = new T.PerspectiveCamera(
    58,
    host.clientWidth / host.clientHeight,
    0.1,
    1500,
  );
  scene.add(new T.HemisphereLight(0xe8fcff, 0x647844, 2.4));
  const sun = new T.DirectionalLight(0xffedd0, 2.5);
  sun.position.set(-120, 230, 100);
  scene.add(sun);
  const ground = new T.PlaneGeometry(2000, 2000, 160, 160);
  ground.rotateX(-Math.PI / 2);
  const vertices = ground.attributes.position;
  for (let i = 0; i < vertices.count; i++)
    vertices.setY(i, terrainHeight(vertices.getX(i), vertices.getZ(i)));
  ground.computeVertexNormals();
  scene.add(
    new T.Mesh(
      ground,
      new T.MeshStandardMaterial({
        color: 0x809a69,
        flatShading: true,
        roughness: 1,
      }),
    ),
  );
  scene.add(
    ribbon(9, 0, -0.03, 0xa7aa8b),
    ribbon(6.8, 0, 0.02, 0x48545a),
    ribbon(0.11, -3.1, 0.035, 0xe4e4c8),
    ribbon(0.11, 3.1, 0.035, 0xe4e4c8),
  );
  const marks = new T.InstancedMesh(
    new T.BoxGeometry(0.1, 0.025, 2.7),
    new T.MeshStandardMaterial({ color: 0xe1dbc1 }),
    Math.floor(route.distanceMeters / 9),
  );
  const dummy = new T.Object3D();
  for (let i = 0; i < marks.count; i++) {
    const p = lookupRoute(i * 9);
    dummy.position.set(p.x, p.y + 0.04, p.z);
    dummy.rotation.set(-Math.atan(p.gradient), p.heading, 0, "YXZ");
    dummy.updateMatrix();
    marks.setMatrixAt(i, dummy.matrix);
  }
  scene.add(marks);
  let seed = 42;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const trees = new T.InstancedMesh(
    new T.ConeGeometry(3, 10, 5),
    new T.MeshStandardMaterial({ color: 0x315f50, flatShading: true }),
    420,
  );
  const trunks = new T.InstancedMesh(
    new T.CylinderGeometry(0.4, 0.6, 4, 5),
    new T.MeshStandardMaterial({ color: 0x6b6750 }),
    420,
  );
  const rocks = new T.InstancedMesh(
    new T.IcosahedronGeometry(1.5, 0),
    new T.MeshStandardMaterial({ color: 0x99a39a, flatShading: true }),
    110,
  );
  const nearRoad = (x: number, z: number) =>
    route.points.some(
      (p, i) => i % 8 === 0 && Math.hypot(p.x - x, p.z - z) < 12,
    );
  for (const mesh of [trees, rocks]) {
    for (let i = 0; i < mesh.count; i++) {
      let x: number, z: number;
      do {
        x = (random() - 0.5) * 1100;
        z = (random() - 0.5) * 1100;
      } while (nearRoad(x, z));
      const scale = 0.65 + random() * 1.3,
        y = terrainHeight(x, z);
      dummy.position.set(x, y + (mesh === trees ? 6 : 1) * scale, z);
      dummy.rotation.set(0, random() * 6.28, 0);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      if (mesh === trees) {
        dummy.position.y = y + 2 * scale;
        dummy.updateMatrix();
        trunks.setMatrixAt(i, dummy.matrix);
      }
    }
    scene.add(mesh);
  }
  scene.add(trunks);
  for (let i = 0; i < 15; i++) {
    const angle = (i / 15) * Math.PI * 2;
    const hill = new T.Mesh(
      new T.ConeGeometry(120 + random() * 100, 140 + random() * 110, 5),
      new T.MeshStandardMaterial({
        color: i % 2 ? 0x8da799 : 0x78968d,
        flatShading: true,
      }),
    );
    hill.position.set(Math.sin(angle) * 850, 35, Math.cos(angle) * 850);
    scene.add(hill);
  }
  for (const distance of [110, 610, 1120]) {
    const p = lookupRoute(distance),
      x = p.x + Math.cos(p.heading) * 22,
      z = p.z - Math.sin(p.heading) * 22,
      y = terrainHeight(x, z);
    const wall = new T.Mesh(
      new T.BoxGeometry(9, 6, 7),
      new T.MeshStandardMaterial({ color: 0xdacbb0 }),
    );
    wall.position.set(x, y + 3, z);
    scene.add(wall);
    const roof = new T.Mesh(
      new T.ConeGeometry(7, 3.5, 4),
      new T.MeshStandardMaterial({ color: 0x63757a }),
    );
    roof.position.set(x, y + 7.6, z);
    roof.rotation.y = Math.PI / 4;
    scene.add(roof);
  }
  // Start/finish gate.
  const start = lookupRoute(0);
  const gate = new T.Group();
  gate.position.set(start.x, start.y, start.z);
  gate.rotation.y = start.heading;
  const gateMat = new T.MeshStandardMaterial({ color: 0xe8e7d6 });
  for (const x of [-4.5, 4.5]) {
    const pole = new T.Mesh(new T.BoxGeometry(0.35, 6, 0.35), gateMat);
    pole.position.set(x, 3, 0);
    gate.add(pole);
  }
  const beam = new T.Mesh(
    new T.BoxGeometry(9.4, 0.65, 0.4),
    new T.MeshStandardMaterial({ color: 0xd7f56d }),
  );
  beam.position.y = 6;
  gate.add(beam);
  scene.add(gate);
  const rider = new T.Group();
  scene.add(rider);
  const dark = new T.MeshStandardMaterial({ color: 0x253b43 }),
    frame = new T.MeshStandardMaterial({ color: 0xe5f776 }),
    jersey = new T.MeshStandardMaterial({ color: 0xe56544 }),
    skin = new T.MeshStandardMaterial({ color: 0xc89a77 });
  const v = (x: number, y: number, z: number) => new T.Vector3(x, y, z);
  const wheels: T.Group[] = [];
  for (const z of [-0.68, 0.68]) {
    const wheel = new T.Group();
    wheel.position.set(0, 0.37, z);
    const tire = new T.Mesh(new T.TorusGeometry(0.35, 0.035, 6, 24), dark);
    tire.rotation.y = Math.PI / 2;
    wheel.add(tire);
    for (let j = 0; j < 6; j++) {
      const a = (j / 6) * Math.PI;
      wheel.add(
        rod(
          v(0, Math.sin(a) * 0.32, Math.cos(a) * 0.32),
          v(0, -Math.sin(a) * 0.32, -Math.cos(a) * 0.32),
          0.009,
          gateMat,
        ),
      );
    }
    rider.add(wheel);
    wheels.push(wheel);
  }
  const bottom = v(0, 0.43, 0),
    seat = v(0, 0.91, -0.23),
    front = v(0, 0.91, 0.48),
    back = v(0, 0.37, -0.68),
    hub = v(0, 0.37, 0.68);
  for (const [a, b] of [
    [back, seat],
    [seat, bottom],
    [bottom, back],
    [seat, front],
    [front, bottom],
    [front, hub],
  ])
    rider.add(rod(a, b, 0.035, frame));
  rider.add(rod(v(-0.25, 1.02, 0.51), v(0.25, 1.02, 0.51), 0.028, dark));
  const saddle = new T.Mesh(new T.BoxGeometry(0.22, 0.06, 0.29), dark);
  saddle.position.copy(seat).add(v(0, 0.06, 0));
  rider.add(saddle);
  rider.add(rod(v(0, 1.03, -0.22), v(0, 1.43, 0.19), 0.16, jersey));
  const head = new T.Mesh(new T.SphereGeometry(0.13, 10, 8), skin);
  head.position.set(0, 1.56, 0.28);
  rider.add(head);
  const helmet = new T.Mesh(
    new T.SphereGeometry(0.145, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.58),
    gateMat,
  );
  helmet.position.copy(head.position).add(v(0, 0.045, 0));
  rider.add(helmet);
  for (const x of [-0.17, 0.17]) {
    rider.add(rod(v(x, 1.4, 0.16), v(x * 1.2, 1.13, 0.37), 0.047, skin));
    rider.add(rod(v(x * 1.2, 1.13, 0.37), v(x, 1.02, 0.51), 0.04, skin));
  }
  const legs: T.Mesh[][] = [];
  for (const x of [-0.12, 0.12]) {
    const thigh = rod(v(x, 1, -0.2), v(x, 0.7, 0.1), 0.07, dark),
      shin = rod(v(x, 0.7, 0.1), v(x, 0.3, 0), 0.05, skin),
      crank = rod(v(x, 0.43, 0), v(x, 0.43, 0.17), 0.023, dark);
    rider.add(thigh, shin, crank);
    legs.push([thigh, shin, crank]);
  }
  const poseRod = (mesh: T.Mesh, a: T.Vector3, b: T.Vector3) => {
    const geo = mesh.geometry as T.CylinderGeometry;
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
    mesh.scale.y = a.distanceTo(b) / geo.parameters.height;
  };
  let crankAngle = 0,
    mode = 0,
    initialized = false;
  const resize = new ResizeObserver(() => {
    const w = host.clientWidth,
      h = host.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  });
  resize.observe(host);
  return {
    cameraName: () => (mode === 0 ? "Chase" : "First person"),
    toggleCamera: () => {
      mode = (mode + 1) % 2;
      initialized = false;
    },
    render(dt: number) {
      const s = engine.state,
        p = lookupRoute(s.distanceMeters);
      rider.position.set(p.x, p.y + 0.07, p.z);
      rider.rotation.set(-Math.atan(p.gradient), p.heading, 0, "YXZ");
      rider.visible = mode === 0;
      const moving = !engine.paused && !engine.completed;
      const cadence = moving ? s.cadenceRpm : 0;
      crankAngle += (cadence / 60) * Math.PI * 2 * dt;
      for (const wheel of wheels)
        if (moving) wheel.rotation.x += (s.speedMetersPerSecond / 0.35) * dt;
      legs.forEach(([thigh, shin, crank], i) => {
        const a = crankAngle + i * Math.PI,
          x = i === 0 ? -0.12 : 0.12,
          foot = v(x, 0.43 + Math.sin(a) * 0.17, Math.cos(a) * 0.17),
          hip = v(x, 1.02, -0.22),
          knee = v(x, 0.76 + Math.sin(a) * 0.08, 0.22 + Math.cos(a) * 0.08);
        poseRod(thigh, hip, knee);
        poseRod(shin, knee, foot);
        poseRod(crank, v(x, 0.43, 0), foot);
      });
      const ahead = lookupRoute((s.distanceMeters + 12) % route.distanceMeters),
        direction = v(Math.sin(p.heading), 0, Math.cos(p.heading));
      const desired = v(p.x, p.y + (mode ? 1.65 : 3.4), p.z).addScaledVector(
        direction,
        mode ? 0.35 : -7.5,
      );
      if (!initialized) {
        camera.position.copy(desired);
        initialized = true;
      } else camera.position.lerp(desired, 1 - Math.exp(-dt * 5));
      camera.lookAt(ahead.x, ahead.y + (mode ? 1.5 : 1), ahead.z);
      renderer.render(scene, camera);
    },
    dispose() {
      resize.disconnect();
      const geometries = new Set<T.BufferGeometry>(),
        materials = new Set<T.Material>();
      scene.traverse((o) => {
        if (o instanceof T.Mesh) {
          geometries.add(o.geometry);
          for (const m of Array.isArray(o.material) ? o.material : [o.material])
            materials.add(m);
          if (o instanceof T.InstancedMesh) o.dispose();
        }
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
