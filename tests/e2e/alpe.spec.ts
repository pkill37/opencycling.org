import { test, expect } from "@playwright/test";

test("bundled Alpe ascent loads and starts a simulated ride", async ({
  page,
}) => {
  await page.goto("/ride/");
  await page.getByLabel("Route", { exact: true }).selectOption("alpe");
  await expect(
    page.getByRole("heading", { name: "Alpe d’Huez (test)", exact: true }),
  ).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.getByRole("button", { name: "Start ride" }).click();
  await expect(page.locator("canvas")).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Alpe d’Huez (test) route map" }),
  ).toBeVisible();
  const rider = page.getByTestId("minimap-rider");
  const before = await rider.getAttribute("transform");
  await expect(rider).not.toHaveAttribute("transform", before!);
});
