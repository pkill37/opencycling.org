import { test, expect } from "@playwright/test";
import { startRide } from "./helpers";

// Includes previously unsafe building sites and the close, vertically separated
// Alpine switchbacks. Fractions address the distance-sampled minimap polyline.
const maps = [
  {
    slug: "alpe-d-huez",
    title: "Alpe d’Huez",
    checkpoints: [0.01, 0.22, 0.423, 0.525, 0.562, 0.75, 0.95],
  },
  {
    slug: "marseille",
    title: "Marseille",
    checkpoints: [0.01, 0.18, 0.28, 0.5, 0.75, 0.98],
  },
  {
    slug: "paris",
    title: "Paris",
    checkpoints: [0.01, 0.15, 0.25, 0.5, 0.75, 0.98],
  },
];

for (const map of maps) {
  test(`${map.slug}: inspect road and scenery throughout the route`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width: 900, height: 600 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        /THREE|WebGL|shader/i.test(message.text())
      )
        errors.push(message.text());
    });
    await page.addInitScript(() =>
      Object.defineProperty(navigator, "bluetooth", {
        value: undefined,
        configurable: true,
      }),
    );
    await page.goto("/ride/");
    await page
      .getByRole("button", { name: `Select ${map.title}`, exact: true })
      .click();
    await startRide(page);
    await page.keyboard.press("p");
    await expect(
      page.getByRole("heading", { name: "Ride paused" }),
    ).toBeVisible();
    await page.addStyleTag({
      content: '[class*="pauseCard"] { visibility: hidden !important; }',
    });
    const minimap = page.getByLabel("Route minimap").locator("svg");

    for (const fraction of map.checkpoints) {
      await minimap.evaluate((element, fraction) => {
        const path = element.querySelector("path")!.getAttribute("d")!;
        const points = [...path.matchAll(/[ML]([-\d.]+),([-\d.]+)/g)];
        const p = points[Math.floor(fraction * (points.length - 1))];
        const bounds = element.getBoundingClientRect();
        element.dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            clientX: bounds.left + (Number(p[1]) / 240) * bounds.width,
            clientY: bounds.top + (Number(p[2]) / 160) * bounds.height,
          }),
        );
      }, fraction);
      // Allow the chase camera's exponential follow to settle after teleporting.
      await page.waitForTimeout(1400);
      await page.keyboard.press("h");
      await page.screenshot({
        path: testInfo.outputPath(
          `${map.slug}-${Math.round(fraction * 1000)}-chase.png`,
        ),
      });
      await page.keyboard.press("c");
      await page.screenshot({
        path: testInfo.outputPath(
          `${map.slug}-${Math.round(fraction * 1000)}-first-person.png`,
        ),
      });
      await page.keyboard.press("c");
      await page.keyboard.press("h");
    }
    // An oblique orbit reveals floating bases and road/terrain separation hidden
    // by the normal forward-facing camera.
    await page.mouse.move(650, 350);
    await page.mouse.down();
    await page.mouse.move(800, 280, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.press("h");
    await page.waitForTimeout(500);
    await page.screenshot({
      path: testInfo.outputPath(`${map.slug}-orbit.png`),
    });
    expect(errors).toEqual([]);
  });
}
