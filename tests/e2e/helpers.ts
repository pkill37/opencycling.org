import { expect, type Page } from "@playwright/test";

export async function startRide(page: Page) {
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.locator("canvas")).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole("status")).toBeHidden();
}
