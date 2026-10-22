import { startRide } from "./helpers";
import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.title.startsWith("FTMS browser")) return;
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "bluetooth", {
      value: undefined,
      configurable: true,
    });
  });
});

test("GPX validation, preview and selected-course riding", async ({ page }) => {
  await page.goto("/ride/");
  await page.getByText("Debug settings", { exact: true }).click();
  await page.getByText("Import GPX or route package", { exact: true }).click();
  await page.getByLabel("Route file").setInputFiles({
    name: "test.gpx",
    mimeType: "application/gpx+xml",
    buffer: Buffer.from(
      '<gpx><trk><name>Imported ascent</name><trkseg><trkpt lat="45" lon="6"><ele>700</ele></trkpt><trkpt lat="45.001" lon="6"><ele>710</ele></trkpt><trkpt lat="45.002" lon="6"><ele>720</ele></trkpt></trkseg></trk></gpx>',
    ),
  });
  await page.getByRole("button", { name: "Validate selected segment" }).click();
  await expect(
    page.getByText("Imported ascent · 3 samples · unverified"),
  ).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.getByRole("button", { name: "Use reviewed preview" }).click();
  await expect(page.getByRole("button", { name: "Start ride" })).toBeEnabled();
  await page.getByRole("button", { name: "Start ride" }).click();
  await expect(page.locator("canvas")).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Imported ascent elevation profile" }),
  ).toBeVisible();
  await expect(page.getByText("CORNER MODEL", { exact: false })).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Imported ascent route map" }),
  ).toBeVisible();
  const rider = page.getByTestId("minimap-rider");
  const before = await rider.getAttribute("transform");
  await expect(rider).not.toHaveAttribute("transform", before!);
  await page.getByRole("button", { name: "Hide HUD" }).click();
  await expect(page.getByLabel("Route minimap")).toBeHidden();
});
test("completed ride retains its live world under the green summary overlay", async ({
  page,
}) => {
  await page.goto("/ride/");
  await page.getByText("Debug settings", { exact: true }).click();
  await page.getByText("Import GPX or route package", { exact: true }).click();
  await page.getByLabel("Route file").setInputFiles({
    name: "finish.gpx",
    mimeType: "application/gpx+xml",
    buffer: Buffer.from(
      '<gpx><trk><name>Finish fixture</name><trkseg><trkpt lat="45" lon="6"><ele>700</ele></trkpt><trkpt lat="45.00005" lon="6"><ele>700</ele></trkpt></trkseg></trk></gpx>',
    ),
  });
  await page.getByRole("button", { name: "Validate selected segment" }).click();
  await page.getByRole("button", { name: "Use reviewed preview" }).click();
  await expect(page.getByRole("button", { name: "Start ride" })).toBeEnabled();
  await page.getByRole("button", { name: "Start ride" }).click();
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  await canvas.evaluate((el) => el.setAttribute("data-original-world", "true"));
  await expect(page.getByRole("heading", { name: "You made it." })).toBeVisible(
    { timeout: 15000 },
  );
  await expect(canvas).toHaveAttribute("data-original-world", "true");
  const before = await canvas.screenshot();
  await expect
    .poll(async () => Buffer.compare(before, await canvas.screenshot()))
    .not.toBe(0);
  await page.getByRole("button", { name: "Back to setup" }).click();
  await expect(canvas).toHaveCount(0);
});
test("simulator ride, controls, pause, summary and restart", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Free virtual cycling in your browser.",
    }),
  ).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.screenshot({
    path: "test-results/home-desktop.png",
    fullPage: true,
  });
  const modes = page.getByRole("group", { name: "Ride mode", exact: true });
  await expect(modes.getByRole("button", { name: "Online" })).toBeDisabled();
  await modes.getByRole("button", { name: "Zombies Mode" }).click();
  await expect(
    modes.getByRole("button", { name: "Zombies Mode" }),
  ).toHaveAttribute("aria-pressed", "true");
  await modes.getByRole("button", { name: "Open Ride", exact: true }).click();
  await expect(
    modes.getByRole("button", { name: "Open Ride", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await startRide(page);
  await expect(
    page.getByText("VIRTUAL TRAINER", { exact: true }),
  ).toBeVisible();
  await page.locator("main").click({ position: { x: 400, y: 300 } });
  await page.keyboard.press("5");
  await expect(
    page.getByRole("group", { name: "Power", exact: true }).locator("strong"),
  ).toHaveText(/300\s*W/);
  await page.getByRole("button", { name: "Increase power" }).click();
  await expect(
    page.getByRole("group", { name: "Power", exact: true }).locator("strong"),
  ).toHaveText(/325\s*W/);
  await page.screenshot({ path: "test-results/ride-desktop.png" });
  await page.getByRole("button", { name: "Change camera" }).click();
  await expect(page.getByText("First person", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ride paused" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Resume ride" }).click();
  await expect(page.getByRole("heading", { name: "Ride paused" })).toBeHidden();
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ride wrapped." }),
  ).toBeVisible();
  await expect(page.getByText("AVERAGE POWER", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Ride again" }).click();
  await expect(
    page.getByText("VIRTUAL TRAINER", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("phone simulator touch controls remain usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ride/");
  await startRide(page);
  await expect(
    page.getByRole("button", { name: "Increase power" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Increase power" }).click();
  const power = page.getByRole("group", { name: "Power", exact: true });
  await expect(power.locator("strong")).toHaveText(/175\s*W/);
  await expect(
    power.getByRole("button", { name: "Increase power" }),
  ).toBeVisible();
  const powerBounds = await power.boundingBox();
  expect(powerBounds!.y).toBeLessThan(100);
  await page.screenshot({ path: "test-results/ride-phone.png" });
  await page.getByRole("button", { name: "Sprint", exact: true }).click();
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ride wrapped." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("mouse orbit and wheel zoom control the ride camera", async ({ page }) => {
  await page.goto("/ride/");
  await page.getByRole("button", { name: "Start ride" }).click();
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ride paused" }),
  ).toBeVisible();

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  // Keep the gesture outside the centered pause dialog.
  const centerX = box!.x + box!.width * 0.82;
  const centerY = box!.y + box!.height * 0.22;
  const before = await canvas.screenshot();

  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX + 180, centerY - 60, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(100);
  const afterOrbit = await canvas.screenshot();
  expect(Buffer.compare(afterOrbit, before)).not.toBe(0);

  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(100);
  const afterZoom = await canvas.screenshot();
  expect(Buffer.compare(afterZoom, afterOrbit)).not.toBe(0);
});

test("FTMS browser notifications drive the ride and disconnect offers reconnect", async ({
  page,
}) => {
  await page.addInitScript(() => {
    class BikeData extends EventTarget {
      uuid = "00002ad2-0000-1000-8000-00805f9b34fb";
      value = new DataView(
        new Uint8Array([0x44, 0, 0x10, 0x0e, 180, 0, 250, 0]).buffer,
      );
      timer?: ReturnType<typeof setInterval>;
      async startNotifications() {
        this.timer = setInterval(
          () => this.dispatchEvent(new Event("characteristicvaluechanged")),
          100,
        );
        return this;
      }
    }
    const characteristic = new BikeData();
    const device = new EventTarget() as EventTarget & {
      name: string;
      gatt: unknown;
    };
    device.name = "Mock FTMS Trainer";
    const gatt = {
      connect: async () => gatt,
      disconnect: () => {
        clearInterval(characteristic.timer);
      },
      getPrimaryService: async (uuid: string) => {
        if (!uuid.includes("1826")) throw new Error("CPS unavailable");
        return {
          getCharacteristic: async (uuid: string) => {
            if (uuid.includes("2acc"))
              return {
                readValue: async () => new DataView(new ArrayBuffer(8)),
              };
            return characteristic;
          },
        };
      },
    };
    device.gatt = gatt;
    Object.defineProperty(navigator, "bluetooth", {
      value: { requestDevice: async () => device },
    });
    window.addEventListener("test-trainer-disconnect", () => {
      gatt.disconnect();
      device.dispatchEvent(new Event("gattserverdisconnected"));
    });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Start ride" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Use simulator" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Connect smart trainer" }).click();
  await expect(page.getByText("Mock FTMS Trainer · connected")).toBeHidden();
  await page.getByText("Debug settings", { exact: true }).click();
  await expect(page.getByText("Mock FTMS Trainer · connected")).toBeHidden();
  await page.getByText("Bluetooth debug log", { exact: true }).click();
  await expect(page.getByText("Mock FTMS Trainer · connected")).toBeVisible();
  await expect(page.getByText("250 W · 90 rpm · 36.0 km/h raw")).toBeVisible();
  await startRide(page);
  await expect(page.getByText("LIVE TRAINER", { exact: true })).toBeVisible();
  await expect(page.locator('[class*="power"] strong')).toHaveText("250W");
  await page.evaluate(() =>
    window.dispatchEvent(new Event("test-trainer-disconnect")),
  );
  await expect(page.locator("main").getByRole("alert")).toContainText("stale", {
    timeout: 6000,
  });
  await expect(page.getByRole("heading", { name: "Ride paused" })).toBeVisible({
    timeout: 12000,
  });
  await expect(
    page.getByRole("button", { name: "Reconnect", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Increase power" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Use simulator" })).toHaveCount(
    0,
  );
});
