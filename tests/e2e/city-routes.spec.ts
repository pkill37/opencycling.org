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
  test(`${city} GPX preview loads and starts`, async ({ page }) => {
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
    await expect(
      page.getByRole("img", { name: `${name} route map` }),
    ).toBeVisible();
    const rider = page.getByTestId("minimap-rider");
    const before = await rider.getAttribute("transform");
    await expect(rider).not.toHaveAttribute("transform", before!);
  });
}
