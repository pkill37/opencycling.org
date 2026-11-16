import * as T from "three";

// Shared by the visible sun and the directional light so the sky and shadows agree.
export const SUN_DIRECTION = new T.Vector3(-0.48, 0.24, 0.65).normalize();

export function createAtmosphere(scene: T.Scene) {
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const sky = new T.Mesh(
    new T.SphereGeometry(1, 32, 16),
    new T.ShaderMaterial({
      side: T.BackSide,
      depthWrite: false,
      depthTest: false,
      uniforms: { sunDirection: { value: SUN_DIRECTION } },
      vertexShader: `
        varying vec3 skyDirection;
        void main() {
          skyDirection = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position.z = gl_Position.w;
        }
      `,
      fragmentShader: `
        uniform vec3 sunDirection;
        varying vec3 skyDirection;
        void main() {
          vec3 direction = normalize(skyDirection);
          float height = max(direction.y, 0.0);
          vec3 color = mix(vec3(0.89, 0.72, 0.53), vec3(0.06, 0.32, 0.58), smoothstep(0.0, 0.28, height));
          float alignment = max(dot(direction, sunDirection), 0.0);
          float halo = pow(alignment, 24.0);
          vec3 tangent = normalize(cross(sunDirection, vec3(0.0, 1.0, 0.0)));
          vec3 up = cross(tangent, sunDirection);
          float angle = atan(dot(direction, up), dot(direction, tangent));
          float rays = pow(0.5 + 0.5 * cos(angle * 13.0 + sin(angle * 5.0)), 12.0);
          color += vec3(1.0, 0.62, 0.25) * (halo * 0.38 + rays * pow(alignment, 9.0) * 0.20);
          color = mix(color, vec3(1.0, 0.92, 0.69), smoothstep(0.9993, 0.9998, alignment));
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    }),
  );
  sky.name = "golden-hour-sky";
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);

  // A whole flock in one draw call. Wing tips bend in the vertex shader;
  // all animation is decorative and independent of the ride simulation.
  const geometry = new T.BufferGeometry();
  geometry.setAttribute(
    "position",
    new T.Float32BufferAttribute(
      [
        0, 0, 0.35, -1.3, 0, -0.12, -0.35, 0, -0.28, 0, 0, 0.35, 0.35, 0, -0.28,
        1.3, 0, -0.12, 0, 0.08, 0.55, -0.12, 0, -0.5, 0.12, 0, -0.5,
      ],
      3,
    ),
  );
  const time = { value: 0 };
  const birds = new T.InstancedMesh(
    geometry,
    new T.ShaderMaterial({
      side: T.DoubleSide,
      uniforms: { time },
      vertexShader: `
        uniform float time;
        void main() {
          vec3 wing = position;
          wing.y += abs(wing.x) * sin(time * 3.8 + instanceMatrix[3].x) * 0.48;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(wing, 1.0);
        }
      `,
      fragmentShader: `
        void main() {
          gl_FragColor = vec4(0.12, 0.18, 0.18, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    }),
    18,
  );
  birds.name = "swallow-flock";
  birds.frustumCulled = false;
  scene.add(birds);
  const bird = new T.Object3D();
  let elapsed = 0;
  return {
    update(dt: number, camera: T.Camera) {
      elapsed += reducedMotion ? 0 : Math.min(Math.max(dt, 0), 0.1);
      time.value = elapsed;
      sky.position.copy(camera.position);
      sky.scale.setScalar(1500);
      birds.position.copy(camera.position);
      for (let i = 0; i < birds.count; i++) {
        const flock = Math.floor(i / 6);
        const phase = elapsed * 0.025 + flock * 2.1;
        const radius = 135 + flock * 45 + (i % 6) * 5;
        bird.position.set(
          Math.sin(phase) * radius + (i % 3) * 8,
          42 + flock * 20 + Math.sin(i * 2.4) * 5,
          Math.cos(phase) * radius + (i % 6) * 4,
        );
        bird.rotation.set(0, phase + Math.PI / 2, Math.sin(phase + i) * 0.12);
        bird.scale.setScalar(0.65 + (i % 3) * 0.12);
        bird.updateMatrix();
        birds.setMatrixAt(i, bird.matrix);
      }
      birds.instanceMatrix.needsUpdate = true;
    },
  };
}
