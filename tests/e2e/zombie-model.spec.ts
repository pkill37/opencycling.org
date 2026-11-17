import { test, expect } from "@playwright/test";
import { build } from "esbuild";

test("redesigned zombie variants render detailed faces and articulated silhouettes", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  const script = await build({
    stdin: {
      contents: `
      import * as T from "three";
      import { createZombie } from "./src/game/world/zombie";
      const scene = new T.Scene(); scene.background = new T.Color(0x15211e);
      const camera = new T.PerspectiveCamera(38, 1280 / 800, 0.1, 100);
      camera.position.set(1.2, 2.1, 8.7); camera.lookAt(0, 1, 0);
      const renderer = new T.WebGLRenderer({antialias: true});
      renderer.setSize(1280, 800); renderer.outputColorSpace = T.SRGBColorSpace;
      document.body.appendChild(renderer.domElement);
      scene.add(new T.HemisphereLight(0xd8efdb, 0x273329, 2));
      const light = new T.DirectionalLight(0xffe9ca, 3); light.position.set(-3, 6, 5); scene.add(light);
      const floor = new T.Mesh(new T.PlaneGeometry(100, 100), new T.MeshStandardMaterial({color:0x26382f}));
      floor.rotation.x = -Math.PI/2; scene.add(floor);
      for (let i = 0; i < 4; i++) {
        const zombie = createZombie(i); zombie.update(0.8 + i * 0.1, false);
        zombie.group.position.x = (i - 1.5) * 1.65;
        zombie.group.rotation.y = i % 2 ? -0.28 : 0.18;
        scene.add(zombie.group);
      }
      renderer.render(scene, camera);
    `,
      resolveDir: process.cwd(),
      loader: "ts",
    },
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
  });
  await page.setContent(
    '<body style="margin:0;background:#15211e"><div style="position:absolute;top:28px;left:36px;color:#ecdfba;font:22px system-ui;letter-spacing:3px">THE HORDE</div></body>',
  );
  await page.addScriptTag({ content: script.outputFiles[0].text });
  await expect(page.locator("canvas")).toBeVisible();
  await page.screenshot({ path: "test-results/zombie-redesign.png" });
  expect(errors).toEqual([]);
});
