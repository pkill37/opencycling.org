import type { TerrainTileData } from "./terrain-data";
import type { ElevationSampler } from "../route/terrain";
import * as T from "three";
import { lookupRoute } from "../route/route";
import type { CyclingRoute } from "../../types";
import type { RideEngine } from "../loop/engine";
import type { ZombiesSnapshot } from "../modes/zombies";
import { createRider } from "./rider";
import { createScenery } from "./scenery";
import { createTexturedGeometry } from "./geometry";

function ribbon(
  route: CyclingRoute,
  width: number,
  offset: number,
  lift: number,
  color: number,
  material?: T.MeshStandardMaterial,
) {
  const positions: number[] = [],
    indices: number[] = [],
    uvs: number[] = [];
  // Keep the rendered ribbon dense enough that tight GPS corners do not read as
  // polygonal. This only affects the world mesh; route lookup and physics keep
  // their original sampling and measurements.
  const spacing = Math.max(1.5, Math.min(4, route.distanceMeters / 3500));
  const samples: ReturnType<typeof lookupRoute>[] = [];
  for (let distance = 0; distance < route.distanceMeters; distance += spacing)
    samples.push(lookupRoute(distance, route));
  samples.push(lookupRoute(route.distanceMeters, route));
  samples.forEach((p, i) => {
    const previous = samples[Math.max(0, i - 1)];
    const next = samples[Math.min(samples.length - 1, i + 1)];
    const heading =
      previous === next
        ? p.heading
        : Math.atan2(next.x - previous.x, next.z - previous.z);
    for (const side of [-1, 1]) {
      const lateral = offset + (side * width) / 2;
      positions.push(
        p.x + Math.cos(heading) * lateral,
        p.y + lift,
        p.z - Math.sin(heading) * lateral,
      );
      uvs.push(
        ((side + 1) * width) / 8,
        (p.progress * route.distanceMeters) / 8,
      );
    }
    if (i) {
      const n = i * 2;
      indices.push(n - 2, n, n - 1, n - 1, n, n + 1);
    }
  });
  const geometry = createTexturedGeometry(positions, uvs, indices);
  const mesh = new T.Mesh(
    geometry,
    material ??
      new T.MeshStandardMaterial({
        color,
        roughness: 1,
        side: T.DoubleSide,
      }),
  );
  mesh.receiveShadow = true;
  return mesh;
}

function createContactShadow() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const gradient = context.createRadialGradient(64, 64, 4, 64, 64, 62);
  gradient.addColorStop(0, "rgba(11, 19, 17, 0.48)");
  gradient.addColorStop(0.45, "rgba(11, 19, 17, 0.22)");
  gradient.addColorStop(1, "rgba(11, 19, 17, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  const shadow = new T.Mesh(
    new T.PlaneGeometry(1.45, 2.35),
    new T.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      opacity: 0.8,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.renderOrder = 1;
  return shadow;
}

function addStartGate(scene: T.Scene, route: CyclingRoute) {
  const start = lookupRoute(0, route),
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

export function createWorld(
  host: HTMLElement,
  engine: RideEngine,
  getZombies?: () => ZombiesSnapshot,
  getResting?: () => boolean,
  elevation?: ElevationSampler,
  prepared?: TerrainTileData[],
) {
  const route = engine.course;
  const scene = new T.Scene();
  scene.background = new T.Color("#bfd7e5");
  scene.fog = new T.Fog("#bfd7e5", 350, 2200);
  const renderer = new T.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  // Keep the default render target modest; the adaptive scaler can still lower
  // it on slower devices, but starting at 1.5x causes an avoidable GPU spike.
  const lowPowerDevice =
    (navigator.hardwareConcurrency ?? 4) <= 4 || window.innerWidth <= 900;
  const maxPixelRatio = Math.min(
    window.devicePixelRatio,
    lowPowerDevice ? 1 : 1.25,
  );
  renderer.setPixelRatio(maxPixelRatio);
  renderer.setSize(host.clientWidth, host.clientHeight);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  host.appendChild(renderer.domElement);
  const camera = new T.PerspectiveCamera(
    52,
    host.clientWidth / host.clientHeight,
    0.1,
    4000,
  );
  scene.add(new T.HemisphereLight(0xd9edff, 0x77765b, 1.8));
  const fill = new T.DirectionalLight(0xb9d9ff, 0.42);
  fill.position.set(-120, 90, -160);
  scene.add(fill);
  const sun = new T.DirectionalLight(0xfff0d7, 2.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(512, 512);
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
  // The sun follows the rider, but a 20 Hz shadow refresh is visually smooth
  // enough and avoids rebuilding a large shadow map on every animation frame.
  renderer.shadowMap.autoUpdate = false;
  sun.shadow.needsUpdate = true;
  scene.add(sun, sun.target);
  const scenery = createScenery(scene, route, renderer, elevation, prepared);
  if (scenery.region === "alpine") {
    camera.far = 8000;
    camera.updateProjectionMatrix();
  }
  renderer.domElement.dataset.scenery = scenery.region;
  renderer.domElement.dataset.terrainGeneration = prepared
    ? "worker"
    : "synchronous";
  scene.add(
    ribbon(route, 8.3, 0, -0.03, 0xd2cabb, scenery.materials.gravel),
    ribbon(route, 6.8, 0, 0.02, 0x747777, scenery.materials.road),
    ribbon(route, 0.11, -3.1, 0.035, 0xe4e4c8),
    ribbon(route, 0.11, 3.1, 0.035, 0xe4e4c8),
  );
  const marks = new T.InstancedMesh(
    new T.BoxGeometry(0.1, 0.025, 2.7),
    new T.MeshStandardMaterial({ color: 0xe1dbc1 }),
    Math.floor(route.distanceMeters / 9),
  );
  const marker = new T.Object3D();
  for (let i = 0; i < marks.count; i++) {
    const p = lookupRoute(i * 9, route);
    marker.position.set(p.x, p.y + 0.04, p.z);
    marker.rotation.set(-Math.atan(p.gradient), p.heading, 0, "YXZ");
    marker.updateMatrix();
    marks.setMatrixAt(i, marker.matrix);
  }
  scene.add(marks);
  addStartGate(scene, route);
  const rider = createRider();
  const riderShadow = createContactShadow();
  scene.add(rider.group);
  if (riderShadow) scene.add(riderShadow);
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
    shadowTime = 1 / 20,
    orbitYaw = 0,
    orbitPitch = 0,
    orbitDistance = 5.7,
    dragging = false,
    pointerId: number | null = null,
    lastPointerX = 0,
    lastPointerY = 0;
  const canvas = renderer.domElement;
  const cameraTarget = new T.Vector3();
  const cameraOffset = new T.Vector3();
  const desiredCameraPosition = new T.Vector3();
  const lookTarget = new T.Vector3();
  canvas.style.cursor = "grab";
  canvas.style.touchAction = "none";
  const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));
  const resetOrbit = () => {
    orbitYaw = 0;
    orbitPitch = 0;
    orbitDistance = cameraMode === 0 ? 6.2 : 0.35;
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
      cameraMode === 0 ? 2.8 : 0.18,
      cameraMode === 0 ? 22 : 1.4,
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
        point = lookupRoute(state.distanceMeters, route);
      const resting = getResting?.() ?? false;
      if (resting && cameraMode !== 0) {
        cameraMode = 0;
        resetOrbit();
      }
      rider.group.position.set(point.x, point.y + 0.07, point.z);
      rider.group.rotation.set(
        -Math.atan(point.gradient),
        point.heading,
        0,
        "YXZ",
      );
      rider.group.visible = cameraMode === 0;
      if (riderShadow) {
        riderShadow.position.set(point.x, point.y + 0.012, point.z);
        riderShadow.rotation.y = point.heading;
        riderShadow.visible = cameraMode === 0;
      }
      const moving = !engine.paused && !engine.completed && !resting;
      rider.update(
        dt,
        moving ? state.cadenceRpm : 0,
        moving ? state.speedMetersPerSecond : 0,
        resting,
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
        mesh.visible = !resting && index < visibleZombieCount && !!zombie;
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
          z = lookupRoute(
            route.loop ? wrappedDistance : Math.max(0, visualDistance),
            route,
          );
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
      cameraTarget.set(point.x, point.y + (cameraMode ? 1.5 : 1), point.z);
      const distance = orbitDistance;
      const orbitAngle =
        point.heading + (cameraMode ? orbitYaw : Math.PI + orbitYaw);
      cameraOffset.set(
        Math.sin(orbitAngle) * distance,
        (cameraMode ? 0.15 : 1.65) + Math.sin(orbitPitch) * distance,
        Math.cos(orbitAngle) * distance,
      );
      desiredCameraPosition.copy(cameraTarget).add(cameraOffset);
      if (!initialized) {
        camera.position.copy(desiredCameraPosition);
        initialized = true;
      } else camera.position.lerp(desiredCameraPosition, 1 - Math.exp(-dt * 5));
      camera.position.y = Math.max(
        camera.position.y,
        scenery.groundAt(camera.position.x, camera.position.z) + 0.5,
      );
      const lookOffset = cameraMode ? 12 : Math.cos(orbitYaw) * 12;
      const lookDistance = route.loop
        ? (((state.distanceMeters + lookOffset) % route.distanceMeters) +
            route.distanceMeters) %
          route.distanceMeters
        : clamp(state.distanceMeters + lookOffset, 0, route.distanceMeters);
      const lookPoint = lookupRoute(lookDistance, route);
      lookTarget.set(
        lookPoint.x,
        lookPoint.y + (cameraMode ? 1.5 : 1),
        lookPoint.z,
      );
      camera.lookAt(lookTarget);
      shadowTime += Math.max(0, dt);
      if (shadowTime >= 1 / 20) {
        sun.position.set(point.x - 80, point.y + 150, point.z + 65);
        sun.target.position.set(point.x, point.y, point.z);
        sun.shadow.needsUpdate = true;
        shadowTime = 0;
      }
      scenery.update(dt, point.x, point.z);
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
      materials.forEach((material) => {
        if (!scenery.materials.owns(material)) material.dispose();
      });
      textures.forEach((texture) => {
        if (!scenery.materials.owns(texture)) texture.dispose();
      });
      scenery.dispose();
      sun.shadow.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
