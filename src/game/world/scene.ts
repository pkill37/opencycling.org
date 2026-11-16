import type { TerrainTileData } from "./terrain-data";
import type { ElevationSampler } from "../route/terrain";
import * as T from "three";
import { lookupRoute } from "../route/route";
import type { CyclingRoute } from "../../types";
import type { RideEngine } from "../loop/engine";
import { localOpponents, type RaceRider } from "../modes/local-race";
import type { ZombiesSnapshot } from "../modes/zombies";
import { createAtmosphere, SUN_DIRECTION } from "./atmosphere";
import { createRider } from "./rider";
import { createScenery } from "./scenery";
import { roadStrip, roadPose } from "./road";
import type { GhostPlayback } from "../../lib/ghost";

function ribbon(
  route: CyclingRoute,
  width: number,
  offset: number,
  lift: number,
  color: number,
  material?: T.MeshStandardMaterial,
) {
  const geometry = roadStrip(
    route,
    offset - width / 2,
    offset + width / 2,
    lift,
  );
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

function gatePost(
  group: T.Group,
  x: number,
  z: number,
  material: T.Material,
  groundAt: (x: number, z: number) => number,
) {
  const world = new T.Vector3(x, 0, z)
    .applyAxisAngle(new T.Vector3(0, 1, 0), group.rotation.y)
    .add(group.position);
  const bottom = groundAt(world.x, world.z) - group.position.y - 0.05;
  const post = new T.Mesh(
    new T.BoxGeometry(0.5, Math.max(0.2, 8 - bottom), 0.5),
    material,
  );
  post.position.set(x, (8 + bottom) / 2, z);
  post.castShadow = true;
  group.add(post);
}

function addStartGate(
  scene: T.Scene,
  route: CyclingRoute,
  groundAt: (x: number, z: number) => number,
) {
  const start = lookupRoute(0, route),
    gate = new T.Group();
  gate.position.set(start.x, start.y, start.z);
  gate.rotation.y = start.heading;
  const postMaterial = new T.MeshStandardMaterial({ color: 0xe8e7d6 });
  const accentMaterial = new T.MeshStandardMaterial({
    color: 0xd7f56d,
    emissive: 0x526b20,
    emissiveIntensity: 0.3,
  });
  const bannerMaterial = new T.MeshStandardMaterial({ color: 0x263f5d });
  for (const z of [-3, 0, 3]) {
    for (const x of [-7, 7]) {
      gatePost(gate, x, z, postMaterial, groundAt);
    }
    const beam = new T.Mesh(
      new T.BoxGeometry(14.5, 0.65, 0.55),
      accentMaterial,
    );
    beam.position.set(0, 8, z);
    beam.castShadow = true;
    gate.add(beam);
  }
  const roof = new T.Mesh(new T.BoxGeometry(15.2, 0.35, 6.8), bannerMaterial);
  roof.position.y = 8.35;
  roof.castShadow = true;
  gate.add(roof);
  const banner = new T.Mesh(new T.BoxGeometry(11, 1.15, 0.16), accentMaterial);
  banner.position.set(0, 6.9, -3.05);
  gate.add(banner);
  for (const x of [-7.8, 7.8]) {
    const flag = new T.Mesh(
      new T.ConeGeometry(0.6, 1.7, 4),
      new T.MeshStandardMaterial({ color: x < 0 ? 0xff8d7a : 0x35d7ff }),
    );
    flag.position.set(x, 7.3, -3.05);
    flag.rotation.z = x < 0 ? -0.35 : 0.35;
    gate.add(flag);
  }
  const startStripe = new T.Mesh(
    new T.BoxGeometry(8.2, 0.035, 1.35),
    new T.MeshStandardMaterial({ color: 0xf7f3dc }),
  );
  startStripe.position.y = 0.04;
  startStripe.receiveShadow = true;
  gate.add(startStripe);
  scene.add(gate);
}

function addFinishTunnel(
  scene: T.Scene,
  route: CyclingRoute,
  groundAt: (x: number, z: number) => number,
) {
  const finish = lookupRoute(route.distanceMeters, route);
  const tunnel = new T.Group();
  tunnel.position.set(finish.x, finish.y, finish.z);
  tunnel.rotation.y = finish.heading;
  const frame = new T.MeshStandardMaterial({ color: 0xf2eee0 });
  const accent = new T.MeshStandardMaterial({
    color: 0xd9f77e,
    emissive: 0x526b20,
    emissiveIntensity: 0.35,
  });
  const banner = new T.MeshStandardMaterial({ color: 0x263f5d });
  for (const z of [-3, 0, 3]) {
    for (const x of [-7, 7]) {
      gatePost(tunnel, x, z, frame, groundAt);
    }
    const beam = new T.Mesh(new T.BoxGeometry(14.5, 0.65, 0.55), accent);
    beam.position.set(0, 8, z);
    beam.castShadow = true;
    tunnel.add(beam);
  }
  const roof = new T.Mesh(new T.BoxGeometry(15.2, 0.35, 6.8), banner);
  roof.position.y = 8.35;
  roof.castShadow = true;
  tunnel.add(roof);
  const sign = new T.Mesh(new T.BoxGeometry(11, 1.15, 0.16), accent);
  sign.position.set(0, 6.9, -3.05);
  tunnel.add(sign);
  const finishStripe = new T.Mesh(
    new T.BoxGeometry(8.2, 0.035, 1.35),
    new T.MeshStandardMaterial({ color: 0xf7f3dc }),
  );
  finishStripe.position.y = 0.04;
  finishStripe.receiveShadow = true;
  tunnel.add(finishStripe);
  scene.add(tunnel);

  const celebration = new T.Group();
  const colors = [0xd9f77e, 0x35d7ff, 0xff8d7a, 0xf7f3dc, 0xb68cff];
  const particles: Array<{
    mesh: T.Mesh;
    velocity: T.Vector3;
    spin: T.Vector3;
  }> = [];
  for (let i = 0; i < 42; i++) {
    const mesh = new T.Mesh(
      new T.BoxGeometry(0.14, 0.14, 0.08),
      new T.MeshBasicMaterial({ color: colors[i % colors.length] }),
    );
    const angle = (i / 42) * Math.PI * 2;
    mesh.position.set(
      Math.cos(angle) * 5.5,
      2.5 + (i % 5),
      Math.sin(angle) * 2.5,
    );
    celebration.add(mesh);
    particles.push({
      mesh,
      velocity: new T.Vector3(
        Math.cos(angle) * (2 + (i % 3)),
        4 + (i % 4) * 0.8,
        Math.sin(angle) * (2 + (i % 2)),
      ),
      spin: new T.Vector3(1.5 + (i % 3), 2 + (i % 4), 1 + (i % 2)),
    });
  }
  celebration.position.set(finish.x, finish.y, finish.z);
  celebration.rotation.y = finish.heading;
  celebration.visible = false;
  scene.add(celebration);
  let celebrationTime = 0;
  return {
    celebrate() {
      if (celebration.visible) return;
      celebrationTime = 0;
      celebration.visible = true;
      particles.forEach(({ mesh, velocity }, index) => {
        const angle = (index / particles.length) * Math.PI * 2;
        mesh.position.set(
          Math.cos(angle) * 5.5,
          2.5 + (index % 5),
          Math.sin(angle) * 2.5,
        );
        velocity.y = 4 + (index % 4) * 0.8;
      });
    },
    update(dt: number) {
      if (!celebration.visible) return;
      celebrationTime += dt;
      particles.forEach(({ mesh, velocity, spin }) => {
        velocity.y -= 7.5 * dt;
        mesh.position.addScaledVector(velocity, dt);
        mesh.rotation.x += spin.x * dt;
        mesh.rotation.y += spin.y * dt;
        mesh.rotation.z += spin.z * dt;
      });
      if (celebrationTime > 5) celebration.visible = false;
    },
  };
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
  getGhost?: () => GhostPlayback | undefined,
  elevation?: ElevationSampler,
  prepared?: TerrainTileData[],
  getRaceRiders?: () => RaceRider[],
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
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  host.appendChild(renderer.domElement);
  const camera = new T.PerspectiveCamera(
    52,
    host.clientWidth / host.clientHeight,
    0.1,
    6000,
  );
  scene.add(new T.HemisphereLight(0xd2e8e5, 0x8d7959, 1.65));
  const fill = new T.DirectionalLight(0xb9d9e2, 0.48);
  fill.position.set(-120, 90, -160);
  scene.add(fill);
  const sun = new T.DirectionalLight(0xffdfab, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(
    lowPowerDevice ? 256 : 512,
    lowPowerDevice ? 256 : 512,
  );
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
    camera.far = 14000;
    camera.updateProjectionMatrix();
  }
  const atmosphere = createAtmosphere(scene);
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
  const marks = new T.Mesh(
    roadStrip(route, -0.05, 0.05, 0.04, undefined, true),
    new T.MeshStandardMaterial({ color: 0xe1dbc1 }),
  );
  marks.receiveShadow = true;
  scene.add(marks);
  addStartGate(scene, route, scenery.groundAt);
  const finishScene = addFinishTunnel(scene, route, scenery.groundAt);
  const rider = createRider();
  const npcRiders = localOpponents.map((profile) => {
    const npc = createRider(profile.color);
    npc.group.name = `NPC ${profile.name}`;
    scene.add(npc.group);
    return npc;
  });
  const ghostRider = createRider();
  ghostRider.group.traverse((object) => {
    if (!(object instanceof T.Mesh)) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    materials.forEach((material) => {
      material.transparent = true;
      material.opacity = 0.72;
      material.depthWrite = false;
      if (material instanceof T.MeshStandardMaterial && material.map) {
        material.map = null;
        material.color.set(0x35d7ff);
      }
    });
    object.renderOrder = 3;
  });
  ghostRider.group.scale.setScalar(0.98);
  ghostRider.group.renderOrder = 3;
  ghostRider.group.visible = false;
  const riderShadow = createContactShadow();
  scene.add(rider.group);
  scene.add(ghostRider.group);
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
    shadowTime = 1 / 12,
    orbitYaw = 0,
    orbitPitch = 0,
    orbitDistance = 5.7,
    dragging = false,
    finishCelebrationTriggered = false,
    pointerId: number | null = null,
    lastPointerX = 0,
    lastPointerY = 0;
  const canvas = renderer.domElement;
  const cameraTarget = new T.Vector3();
  const cameraOffset = new T.Vector3();
  const desiredCameraPosition = new T.Vector3();
  const lookTarget = new T.Vector3();
  const ghostRotation = new T.Euler(0, 0, 0, "YXZ");
  const ghostOrientation = new T.Quaternion();
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
        if (qualityTime > 1.5) {
          const average = qualityTime / qualityFrames,
            currentRatio = renderer.getPixelRatio();
          const nextRatio =
            average > 1 / 48
              ? Math.max(0.8, currentRatio - 0.15)
              : average < 1 / 57
                ? Math.min(maxPixelRatio, currentRatio + 0.05)
                : currentRatio;
          if (nextRatio !== currentRatio) renderer.setPixelRatio(nextRatio);
          qualityTime = 0;
          qualityFrames = 0;
        }
      }
      const state = engine.state,
        point = roadPose(state.distanceMeters, route);
      if (engine.completed && !finishCelebrationTriggered) {
        finishCelebrationTriggered = true;
        finishScene.celebrate();
      }
      finishScene.update(Math.max(0, dt));
      const resting = getResting?.() ?? false;
      if (resting && cameraMode !== 0) {
        cameraMode = 0;
        resetOrbit();
      }
      rider.group.position.set(point.x, point.y + 0.035, point.z);
      rider.group.rotation.set(
        -Math.atan(point.gradient),
        point.heading,
        0,
        "YXZ",
      );
      rider.group.visible = cameraMode === 0;
      if (riderShadow) {
        riderShadow.position.set(point.x, point.y + 0.028, point.z);
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
      const raceRiders = getRaceRiders?.() ?? [];
      npcRiders.forEach((npc, index) => {
        const competitor = raceRiders[index];
        npc.group.visible =
          !!competitor &&
          Math.abs(competitor.state.distanceMeters - state.distanceMeters) <
            220;
        if (!competitor || !npc.group.visible) return;
        const pose = roadPose(competitor.state.distanceMeters, route);
        npc.group.position.set(
          pose.x + Math.cos(pose.heading) * competitor.lane,
          pose.y + 0.035,
          pose.z - Math.sin(pose.heading) * competitor.lane,
        );
        npc.group.rotation.set(
          -Math.atan(pose.gradient),
          pose.heading,
          0,
          "YXZ",
        );
        const pedaling = moving && competitor.finishTimeSeconds === undefined;
        npc.update(
          dt,
          pedaling ? competitor.state.cadenceRpm : 0,
          pedaling ? competitor.state.speedMetersPerSecond : 0,
          resting,
        );
      });
      const ghost = getGhost?.();
      if (ghost?.visible) {
        const ghostPoint = roadPose(ghost.distanceMeters, route);
        const ghostLateralOffset = 2.2;
        ghostRider.group.position.set(
          ghostPoint.x + Math.cos(ghostPoint.heading) * ghostLateralOffset,
          ghostPoint.y + 0.035,
          ghostPoint.z - Math.sin(ghostPoint.heading) * ghostLateralOffset,
        );
        ghostRotation.set(
          -Math.atan(ghostPoint.gradient),
          ghostPoint.heading,
          0,
        );
        ghostOrientation.setFromEuler(ghostRotation);
        if (!ghostRider.group.visible)
          ghostRider.group.quaternion.copy(ghostOrientation);
        else if (moving)
          ghostRider.group.quaternion.slerp(
            ghostOrientation,
            1 - Math.exp(-Math.max(0, dt) * 18),
          );
        ghostRider.group.visible = true;
        ghostRider.update(
          moving ? dt : 0,
          ghost.cadenceRpm,
          ghost.speedMetersPerSecond,
        );
      } else ghostRider.group.visible = false;
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
      if (
        !initialized ||
        camera.position.distanceToSquared(desiredCameraPosition) > 80 * 80
      ) {
        camera.position.copy(desiredCameraPosition);
        initialized = true;
      } else camera.position.lerp(desiredCameraPosition, 1 - Math.exp(-dt * 5));
      camera.position.y = Math.max(
        camera.position.y,
        scenery.groundAt(camera.position.x, camera.position.z) + 0.5,
      );
      const lookAhead = scenery.region === "alpine" ? 24 : 18;
      const lookOffset = cameraMode
        ? lookAhead
        : Math.cos(orbitYaw) * lookAhead;
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
        sun.target.position.set(point.x, point.y, point.z);
        sun.position
          .copy(sun.target.position)
          .addScaledVector(SUN_DIRECTION, 180);
        sun.shadow.needsUpdate = true;
        shadowTime = 0;
      }
      scenery.update(dt, point.x, point.z);
      atmosphere.update(dt, camera);
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
