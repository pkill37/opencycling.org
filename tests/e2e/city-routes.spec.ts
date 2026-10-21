import { test, expect } from "@playwright/test";

for (const [city, name] of [
  ["marseille", "Marseille Corniche (flat preview)"],
  ["paris", "Paris 2023 finale (preview)"],
]) {
  test(`${city} GPX preview loads and starts`, async ({ page }) => {
    await page.goto("/ride/");
    await page.getByLabel("Route", { exact: true }).selectOption(city);
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Download source GPX" }),
    ).toHaveAttribute("href", `/${city}.gpx`);
    await expect(page.locator("canvas")).toHaveCount(0);
    await page.getByRole("button", { name: "Start ride" }).click();
    await expect(page.locator("canvas")).toBeVisible();
    await expect(
      page.getByRole("img", { name: `${name} route map` }),
    ).toBeVisible();
  });
}
