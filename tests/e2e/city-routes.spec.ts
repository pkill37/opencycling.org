import { test, expect } from "@playwright/test";

import { startRide } from "./helpers";

for (const [city, name] of [
  ["alpe", "Alpe d’Huez (test)"],
  ["marseille", "Marseille Corniche (flat preview)"],
  ["paris", "Paris 2023 finale (preview)"],
]) {
  test(`${city} GPX preview loads and starts`, async ({ page }) => {
    await page.goto("/ride/");
    await page.getByLabel("Route", { exact: true }).selectOption(city);
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
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
