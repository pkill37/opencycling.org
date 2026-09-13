import { test, expect, type Page } from "@playwright/test";

async function setPad(page: Page, buttons: number[] = [], connected = true) {
  await page.evaluate(
    async ({ buttons, connected }) => {
      window.dispatchEvent(
        new CustomEvent("test-gamepad", { detail: { buttons, connected } }),
      );
      // Let the browser poll both the pressed and neutral snapshots, even
      // while the software-rendered world is starting up.
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    },
    { buttons, connected },
  );
}

test("gamepad starts a ride, controls it, and pauses on disconnect", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let buttons: number[] = [];
    let connected = true;
    window.addEventListener("test-gamepad", (event) => {
      ({ buttons, connected } = (event as CustomEvent).detail);
    });
    Object.defineProperty(navigator, "getGamepads", {
      value: () =>
        connected
          ? [
              {
                id: "Mock USB / Bluetooth controller",
                index: 0,
                mapping: "standard",
                connected,
                axes: [0, 0],
                buttons: Array.from({ length: 17 }, (_, index) => ({
                  pressed: buttons.includes(index),
                  value: buttons.includes(index) ? 1 : 0,
                })),
              },
            ]
          : [],
    });
  });
  await page.goto("/");
  await expect(
    page.getByText("Mock USB / Bluetooth controller", { exact: true }),
  ).toBeVisible();
  await setPad(page, [4]);
  await expect(page.getByText("Input received")).toBeVisible();
  await setPad(page);
  await expect(page.getByText("Waiting for input")).toBeVisible();
  await setPad(page, [9]);
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByRole("status")).toBeHidden();
  await setPad(page);
  await page.waitForTimeout(100);
  await setPad(page, [12]);
  await page.waitForTimeout(100);
  await setPad(page);
  await expect(page.getByText("175 W", { exact: true })).toBeVisible();
  await page.waitForTimeout(100);
  await setPad(page, [2]);
  await expect(page.getByText("First person", { exact: true })).toBeVisible();
  await page.waitForTimeout(250);
  await expect(page.getByText("First person", { exact: true })).toBeVisible();
  await setPad(page);
  await page.waitForTimeout(100);
  await setPad(page, [9]);
  await expect(
    page.getByRole("heading", { name: "Ride paused" }),
  ).toBeVisible();
  await page.waitForTimeout(250);
  await expect(
    page.getByRole("heading", { name: "Ride paused" }),
  ).toBeVisible();
  await setPad(page);
  await page.waitForTimeout(100);
  await setPad(page, [9]);
  await expect(page.getByRole("heading", { name: "Ride paused" })).toBeHidden();
  await setPad(page, [], false);
  await expect(
    page.getByRole("heading", { name: "Ride paused" }),
  ).toBeVisible();
  await page.getByText("Gamepad · Not connected", { exact: true }).click();
  await expect(page.getByText(/No gamepad detected/)).toBeVisible();
  await setPad(page, [9]);
  await page.waitForTimeout(200);
  await expect(
    page.getByRole("heading", { name: "Ride paused" }),
  ).toBeVisible();
  await setPad(page);
  await page.waitForTimeout(100);
  await setPad(page, [9]);
  await expect(page.getByRole("heading", { name: "Ride paused" })).toBeHidden();
});

test("blocked gamepad access leaves simulator usable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "getGamepads", {
      value: () => {
        throw new DOMException("Blocked", "SecurityError");
      },
    });
  });
  await page.goto("/");
  await expect(page.getByText(/Gamepad access blocked/)).toBeVisible();
  await page.getByRole("button", { name: "Start ride" }).click();
  await expect(page.locator("canvas")).toBeVisible();
  await page.getByRole("button", { name: "Increase power" }).click();
  await expect(page.getByText("175 W", { exact: true })).toBeVisible();
});

test("Bluetooth and USB setup guide detection and retry recovers access", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    let mode = "waiting";
    window.addEventListener("test-gamepad-mode", (event) => {
      mode = (event as CustomEvent).detail;
    });
    Object.defineProperty(navigator, "getGamepads", {
      value: () => {
        if (mode === "blocked")
          throw new DOMException("Blocked", "SecurityError");
        if (mode === "waiting") return [];
        return [
          {
            id: "Paired Bluetooth controller",
            index: 0,
            mapping: mode === "unknown" ? "" : "standard",
            connected: true,
            axes: [0, 0],
            buttons: [],
          },
        ];
      },
    });
  });
  await page.goto("/");
  const card = page.getByRole("region", { name: "Gamepad connection" });
  await expect(card.getByText(/Already paired/)).toBeVisible();
  await expect(
    card.getByRole("button", { name: "Bluetooth", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await card.getByRole("button", { name: "USB", exact: true }).click();
  await expect(card.getByText(/USB port with a data cable/)).toBeVisible();
  await card.getByRole("button", { name: "Check connection" }).click();
  await expect(card.getByText(/No gamepad detected/)).toBeVisible();
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("test-gamepad-mode", { detail: "blocked" }),
    ),
  );
  await expect(card.getByText(/Gamepad access blocked/)).toBeVisible();
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("test-gamepad-mode", { detail: "connected" }),
    ),
  );
  await card.getByRole("button", { name: "Check connection" }).click();
  await expect(
    card.getByText("Paired Bluetooth controller", { exact: true }),
  ).toBeVisible();
  await expect(
    card.getByText("Connected", { exact: false }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/gamepad-connected-phone.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("test-gamepad-mode", { detail: "unknown" }),
    ),
  );
  await expect(card.getByText(/Controller layout unsupported/)).toBeVisible();
  await expect(
    card.getByText("Paired Bluetooth controller", { exact: true }),
  ).toBeVisible();
});
