import * as T from "three";
import { route, lookupRoute, terrainHeight } from "../route/route";
import type { RideEngine } from "../loop/engine";
import type { ZombiesSnapshot } from "../modes/zombies";
import { addScenery, surfaceTexture } from "./scenery";
import { createRider } from "./rider";
import { worldTexture } from "./textures";

export { preloadWorldTextures } from "./textures";

function ribbon(
  width: number,
  offset: number,
  lift: number,
  color: number,
  map?: T.Texture,
) {
  const positions: number[] = [],
    indices: number[] = [],
    uvs: number[] = [];
  route.points.forEach((p, i) => {
    const a = route.points[Math.max(0, i - 1)],
      b = route.points[Math.min(route.points.length - 1, i + 1)];
    const heading = Math.atan2(b.x - a.x, b.z - a.z);
    for (const side of [-1, 1]) {
      const lateral = offset + (side * width) / 2;
      positions.push(
        p.x + Math.cos(heading) * lateral,
        p.y + lift,
        p.z - Math.sin(heading) * lateral,
      );
      uvs.push(((side + 1) * width) / 4, p.distanceMeters / 2);
    }
    if (i) {
      const n = i * 2;
      indices.push(n - 2, n - 1, n, n - 1, n + 1, n);
    }
  });
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new T.Mesh(
    geometry,
    new T.MeshStandardMaterial({
      color,
      map: map ?? null,
      roughness: 1,
      side: T.DoubleSide,
    }),
  );
  mesh.receiveShadow = true;
  return mesh;
}

function addStartGate(scene: T.Scene) {
  const start = lookupRoute(0),
    gate = new T.Group();
  gate.position.set(start.x, start.y, start.z);
  gate.rotation.y = start.heading;
  const postMaterial = new T.MeshStandardMaterial({ color: 0xe8e7d6 });
  for (const x of [-4.5, 4.5]) {
    const post = new T.Mesh(new T.BoxGeometry(0.35, 6, 0.35), postMaterial);
    post.position.set(x, 3, 0);
    post.castShadow = true;
    gate.add(post);
  }
  const beam = new T.Mesh(
    new T.BoxGeometry(9.4, 0.65, 0.4),
    new T.MeshStandardMaterial({ color: 0xd7f56d }),
  );
  beam.position.y = 6;
  beam.castShadow = true;
  gate.add(beam);
  scene.add(gate);
}

function zombieVariant(index: number) {
  const variants = [
    {
      skin: 0x9bff74,
      shirt: 0x5d2d2d,
      height: 1,
      width: 1,
      head: 1,
      hunch: -0.1,
    },
    {
      skin: 0xc3ff75,
      shirt: 0x263f5d,
      height: 0.88,
      width: 1.18,
      head: 1.08,
      hunch: -0.22,
    },
    {
      skin: 0x79d95b,
      shirt: 0x4d3a22,
      height: 1.12,
      width: 0.86,
      head: 0.92,
      hunch: -0.04,
    },
    {
      skin: 0xd6f08a,
      shirt: 0x60325e,
      height: 0.96,
      width: 0.98,
      head: 1.18,
      hunch: -0.16,
    },
  ];
  return variants[index % variants.length];
}

function createZombie(index: number) {
  const variant = zombieVariant(index);
  const group = new T.Group(),
    skin = new T.MeshStandardMaterial({ color: variant.skin, roughness: 0.85 }),
    shirt = new T.MeshStandardMaterial({
      color: variant.shirt,
      roughness: 0.9,
    }),
    dark = new T.MeshStandardMaterial({ color: 0x151915, roughness: 1 });
  const body = new T.Mesh(
      new T.CapsuleGeometry(0.28 * variant.width, 0.7 * variant.height, 4, 8),
      shirt,
    ),
    head = new T.Mesh(new T.SphereGeometry(0.24 * variant.head, 12, 8), skin),
    leftArm = new T.Mesh(
      new T.BoxGeometry(0.14, 0.78 * variant.height, 0.14),
      skin,
    ),
    rightArm = leftArm.clone(),
    leftLeg = new T.Mesh(
      new T.BoxGeometry(0.16, 0.72 * variant.height, 0.16),
      dark,
    ),
    rightLeg = leftLeg.clone();
  body.position.y = 0.9 * variant.height;
  body.rotation.x = variant.hunch;
  head.position.y = 1.48 * variant.height;
  head.position.z = -variant.hunch * 0.35;
  leftArm.position.set(-0.36 * variant.width, 0.98 * variant.height, -0.12);
  rightArm.position.set(0.36 * variant.width, 0.98 * variant.height, -0.12);
  leftArm.rotation.x = rightArm.rotation.x = -0.95 + variant.hunch;
  leftArm.rotation.z = -0.22 - index * 0.04;
  rightArm.rotation.z = 0.22 + index * 0.04;
  leftLeg.position.set(-0.13 * variant.width, 0.34 * variant.height, 0);
  rightLeg.position.set(0.13 * variant.width, 0.34 * variant.height, 0);
  for (const part of [body, head, leftArm, rightArm, leftLeg, rightLeg]) {
    part.castShadow = true;
    group.add(part);
  }
  group.userData.leftArm = leftArm;
  group.userData.rightArm = rightArm;
  group.userData.leftLeg = leftLeg;
  group.userData.rightLeg = rightLeg;
  return group;
}

function createGround() {
  const geometry = new T.PlaneGeometry(2000, 2000, 160, 160);
  geometry.rotateX(-Math.PI / 2);
  const vertices = geometry.attributes.position,
    colors: number[] = [],
    color = new T.Color();
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i),
      z = vertices.getZ(i);
    vertices.setY(i, terrainHeight(x, z));
    const variation = Math.sin(x / 37) * Math.cos(z / 29);
    color.setHSL(0.22 + variation * 0.025, 0.25, 0.46 + variation * 0.055);
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function createWorld(
  host: HTMLElement,
  engine: RideEngine,
  getZombies?: () => ZombiesSnapshot,
) {
  const scene = new T.Scene();
  scene.background = new T.Color("#bfd7e5");
  scene.fog = new T.Fog("#bfd7e5", 350, 2200);
  const renderer = new T.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  const maxPixelRatio = Math.min(window.devicePixelRatio, 1.5);
  renderer.setPixelRatio(maxPixelRatio);
  renderer.setSize(host.clientWidth, host.clientHeight);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);
  const camera = new T.PerspectiveCamera(
    52,
    host.clientWidth / host.clientHeight,
    0.1,
    4000,
  );
  scene.add(new T.HemisphereLight(0xd9edff, 0x77765b, 1.8));
  const sun = new T.DirectionalLight(0xfff0d7, 2.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {
    left: -55,
    right: 55,
    top: 55,
    bottom: -55,
    near: 1,
    far: 400,
  });
  sun.shadow.normalBias = 0.04;
  sun.shadow.bias = -0.0002;
  scene.add(sun, sun.target);
  const sky = new T.Mesh(
    new T.SphereGeometry(3000, 24, 16),
    new T.MeshBasicMaterial({
      map: worldTexture("sky"),
      side: T.BackSide,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    }),
  );
  scene.add(sky);
  const grassMap = surfaceTexture("grass");
  grassMap.repeat.set(400, 400);
  const roadMap = surfaceTexture("road"),
    gravelMap = surfaceTexture("gravel");
  const ground = new T.Mesh(
    createGround(),
    new T.MeshStandardMaterial({
      map: grassMap,
      vertexColors: true,
      roughness: 1,
    }),
  );
  ground.receiveShadow = true;
  scene.add(ground);
  scene.add(
    ribbon(8.3, 0, -0.03, 0xd2cabb, gravelMap),
    ribbon(6.8, 0, 0.02, 0x747777, roadMap),
    ribbon(0.11, -3.1, 0.035, 0xe4e4c8),
    ribbon(0.11, 3.1, 0.035, 0xe4e4c8),
  );
  const marks = new T.InstancedMesh(
    new T.BoxGeometry(0.1, 0.025, 2.7),
    new T.MeshStandardMaterial({ color: 0xe1dbc1 }),
    Math.floor(route.distanceMeters / 9),
  );
  const marker = new T.Object3D();
  for (let i = 0; i < marks.count; i++) {
    const p = lookupRoute(i * 9);
    marker.position.set(p.x, p.y + 0.04, p.z);
    marker.rotation.set(-Math.atan(p.gradient), p.heading, 0, "YXZ");
    marker.updateMatrix();
    marks.setMatrixAt(i, marker.matrix);
  }
  scene.add(marks);
  addScenery(scene);
  addStartGate(scene);
  const rider = createRider();
  scene.add(rider.group);
  const zombieMeshes = Array.from({ length: 4 }, (_, index) => {
    const zombie = createZombie(index);
    zombie.visible = false;
    scene.add(zombie);
    return zombie;
  });
  let cameraMode = 0,
    initialized = false,
    qualityTime = 0,
    qualityFrames = 0,
    orbitYaw = 0,
    orbitPitch = 0,
    orbitDistance = 5.7,
    dragging = false,
    pointerId: number | null = null,
    lastPointerX = 0,
    lastPointerY = 0;
  const canvas = renderer.domElement;
  canvas.style.cursor = "grab";
  canvas.style.touchAction = "none";
  const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));
  const resetOrbit = () => {
    orbitYaw = 0;
    orbitPitch = 0;
    orbitDistance = cameraMode === 0 ? 5.7 : 0.35;
    initialized = false;
  };
  const stopDragging = () => {
    dragging = false;
    pointerId = null;
    canvas.style.cursor = "grab";
  };
  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    dragging = true;
    pointerId = event.pointerId;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = "grabbing";
    event.preventDefault();
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!dragging || event.pointerId !== pointerId) return;
    orbitYaw -= (event.clientX - lastPointerX) * 0.006;
    orbitPitch = clamp(
      orbitPitch + (event.clientY - lastPointerY) * 0.004,
      -0.82,
      0.68,
    );
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
  };
  const onPointerUp = (event: PointerEvent) => {
    if (event.pointerId === pointerId) stopDragging();
  };
  const onWheel = (event: WheelEvent) => {
    orbitDistance = clamp(
      orbitDistance * Math.exp(event.deltaY * 0.001),
      cameraMode === 0 ? 3.2 : 0.18,
      cameraMode === 0 ? 14 : 1.4,
    );
    event.preventDefault();
  };
  const onDoubleClick = () => resetOrbit();
  const onContextMenu = (event: MouseEvent) => event.preventDefault();
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("lostpointercapture", stopDragging);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("dblclick", onDoubleClick);
  canvas.addEventListener("contextmenu", onContextMenu);
  const resize = new ResizeObserver(() => {
    const width = host.clientWidth,
      height = host.clientHeight;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  });
  resize.observe(host);
  return {
    cameraName: () => (cameraMode === 0 ? "Chase" : "First person"),
    toggleCamera: () => {
      cameraMode = (cameraMode + 1) % 2;
      resetOrbit();
    },
    render(dt: number) {
      if (dt > 0 && !document.hidden) {
        qualityTime += dt;
        qualityFrames++;
        if (qualityTime > 3) {
          const average = qualityTime / qualityFrames,
            currentRatio = renderer.getPixelRatio();
          const nextRatio =
            average > 1 / 42
              ? Math.max(0.8, currentRatio - 0.15)
              : average < 1 / 58
                ? Math.min(maxPixelRatio, currentRatio + 0.05)
                : currentRatio;
          if (nextRatio !== currentRatio) renderer.setPixelRatio(nextRatio);
          qualityTime = 0;
          qualityFrames = 0;
        }
      }
      const state = engine.state,
        point = lookupRoute(state.distanceMeters);
      rider.group.position.set(point.x, point.y + 0.07, point.z);
      rider.group.rotation.set(
        -Math.atan(point.gradient),
        point.heading,
        0,
        "YXZ",
      );
      rider.group.visible = cameraMode === 0;
      const moving = !engine.paused && !engine.completed;
      rider.update(
        dt,
        moving ? state.cadenceRpm : 0,
        state.speedMetersPerSecond,
      );
      const zombieSnapshot = getZombies?.(),
        visibleZombieCount = zombieSnapshot?.caught
          ? 4
          : zombieSnapshot?.threat === "danger"
            ? Math.min(
                4,
                Math.max(2, 5 - Math.ceil(zombieSnapshot.nearestGapMeters / 6)),
              )
            : zombieSnapshot?.threat === "warning"
              ? Math.min(
                  3,
                  Math.max(
                    1,
                    4 - Math.ceil(zombieSnapshot.nearestGapMeters / 10),
                  ),
                )
              : 0,
        activeZombies =
          zombieSnapshot?.threat === "warning" ||
          zombieSnapshot?.threat === "danger" ||
          zombieSnapshot?.threat === "caught"
            ? zombieSnapshot.zombies
            : [];
      zombieMeshes.forEach((mesh, index) => {
        const zombie = activeZombies[index] ?? activeZombies[0];
        mesh.visible = index < visibleZombieCount && !!zombie;
        if (!zombie) return;
        const routeDistance = route.distanceMeters,
          visualGap =
            zombieSnapshot?.threat === "danger" ||
            zombieSnapshot?.threat === "caught"
              ? 1.35 + index * 0.28
              : 2.2 + index * 0.35,
          visualDistance = state.distanceMeters - visualGap,
          wrappedDistance =
            ((visualDistance % routeDistance) + routeDistance) % routeDistance,
          z = lookupRoute(wrappedDistance);
        const stagger = index % 2 === 0 ? -2.35 : 2.35,
          bob = Math.sin(state.elapsedSeconds * 9 + index) * 0.08;
        mesh.position.set(
          z.x + Math.cos(z.heading) * stagger,
          z.y + bob,
          z.z - Math.sin(z.heading) * stagger,
        );
        mesh.rotation.set(-Math.atan(z.gradient), z.heading, 0, "YXZ");
        mesh.scale.setScalar(zombieSnapshot?.threat === "warning" ? 0.95 : 1.1);
        const stride = Math.sin(state.elapsedSeconds * 11 + index);
        (mesh.userData.leftArm as T.Mesh).rotation.x = -0.95 + stride * 0.35;
        (mesh.userData.rightArm as T.Mesh).rotation.x = -0.95 - stride * 0.35;
        (mesh.userData.leftLeg as T.Mesh).rotation.x = stride * 0.45;
        (mesh.userData.rightLeg as T.Mesh).rotation.x = -stride * 0.45;
      });
      const ahead = lookupRoute(
          (state.distanceMeters + 12) % route.distanceMeters,
        ),
        target = new T.Vector3(
          point.x,
          point.y + (cameraMode ? 1.5 : 1),
          point.z,
        );
      const distance = orbitDistance;
      const orbitAngle =
        point.heading + (cameraMode ? orbitYaw : Math.PI + orbitYaw);
      const desired = target
        .clone()
        .add(
          new T.Vector3(
            Math.sin(orbitAngle) * distance,
            (cameraMode ? 0.15 : 1.65) + Math.sin(orbitPitch) * distance,
            Math.cos(orbitAngle) * distance,
          ),
        );
      if (!initialized) {
        camera.position.copy(desired);
        initialized = true;
      } else camera.position.lerp(desired, 1 - Math.exp(-dt * 5));
      camera.lookAt(ahead.x, ahead.y + (cameraMode ? 1.5 : 1), ahead.z);
      sun.position.set(point.x - 80, point.y + 150, point.z + 65);
      sun.target.position.set(point.x, point.y, point.z);
      renderer.render(scene, camera);
    },
    dispose() {
      resize.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("lostpointercapture", stopDragging);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("dblclick", onDoubleClick);
      canvas.removeEventListener("contextmenu", onContextMenu);
      const geometries = new Set<T.BufferGeometry>(),
        materials = new Set<T.Material>(),
        textures = new Set<T.Texture>();
      scene.traverse((object) => {
        if (!(object instanceof T.Mesh)) return;
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material]) {
          materials.add(material);
          for (const value of Object.values(material))
            if (value instanceof T.Texture) textures.add(value);
        }
        if (object instanceof T.InstancedMesh) object.dispose();
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      textures.forEach((texture) => texture.dispose());
      sun.shadow.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
