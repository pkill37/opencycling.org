import { test, expect } from "@playwright/test";

import { startRide } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "bluetooth", {
      value: undefined,
      configurable: true,
    });
  });
});

for (const [city, title, name] of [
  ["alpe", "Alpe d’Huez", "Alpe d’Huez (test)"],
  ["marseille", "Marseille", "Marseille Corniche (flat preview)"],
  ["paris", "Paris", "Paris 2023 finale (preview)"],
]) {
  test(`${city} GPX preview loads and starts`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (
        (message.type() === "error" &&
          /THREE|shader|WebGL/i.test(message.text())) ||
        (message.type() === "warning" && /THREE|shader/i.test(message.text()))
      )
        errors.push(message.text());
    });
    await page.goto("/ride/");
    await page
      .getByRole("button", { name: `Select ${title}`, exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: `Select ${title}`, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    if (city !== "alpe")
      await expect(
        page.getByRole("link", { name: "Download source GPX" }),
      ).toHaveAttribute("href", `/${city}.gpx`);
    await expect(page.locator("canvas")).toHaveCount(0);
    await startRide(page);
    await expect(page.locator("canvas")).toHaveAttribute(
      "data-scenery",
      city === "alpe"
        ? "alpine"
        : city === "marseille"
          ? "mediterranean"
          : "paris",
    );
    await expect(page.locator("canvas")).toHaveAttribute(
      "data-terrain-generation",
      "worker",
    );
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            performance
              .getEntriesByType("resource")
              .filter((entry) => entry.name.includes("/world/")).length,
        ),
      )
      .toBeGreaterThanOrEqual(5);
    await page
      .locator("canvas")
      .screenshot({ path: testInfo.outputPath(`${city}-chase.png`) });
    await page.getByRole("button", { name: "Change camera" }).click();
    await page
      .locator("canvas")
      .screenshot({ path: testInfo.outputPath(`${city}-first-person.png`) });
    await expect(
      page.getByRole("img", { name: `${name} route map` }),
    ).toBeVisible();
    const rider = page.getByTestId("minimap-rider");
    const before = await rider.getAttribute("transform");
    await expect(rider).not.toHaveAttribute("transform", before!);
    expect(errors).toEqual([]);
  });
}

test("missing textures fall back and scenery survives repeated ride entry", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, "Worker", {
      value: undefined,
      configurable: true,
    });
  });
  await page.route("**/routes/*.terrain.json", (route) => route.abort());
  await page.route("**/world/*.webp", (route) => route.abort());
  await page.goto("/ride/");
  await page
    .getByRole("button", { name: "Select Marseille", exact: true })
    .click();
  for (let i = 0; i < 2; i++) {
    await startRide(page);
    await expect(page.locator("canvas")).toHaveAttribute(
      "data-scenery",
      "mediterranean",
    );
    await expect(page.locator("canvas")).toHaveAttribute(
      "data-terrain-generation",
      "synchronous",
    );
    await page.getByRole("button", { name: "Finish", exact: true }).click();
    await page.getByRole("button", { name: "Back to setup" }).click();
    await expect(page.locator("canvas")).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
