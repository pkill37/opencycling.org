import { startRide } from "./helpers";
import { test, expect, type Page } from "@playwright/test";

const flatGearGpx = `<gpx><trk><name>Flat gears</name><trkseg>${Array.from(
  { length: 11 },
  (_, index) =>
    `<trkpt lat="${45 + index * 0.001}" lon="6"><ele>700</ele></trkpt>`,
).join("")}</trkseg></trk></gpx>`;

async function prepareImportedRide(page: Page, name: string, gpx: string) {
  await page.goto("/ride/");
  await page.getByLabel("Route file").setInputFiles({
    name,
    mimeType: "application/gpx+xml",
    buffer: Buffer.from(gpx),
  });
  await page.getByRole("button", { name: "Validate selected segment" }).click();
}

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
  await prepareImportedRide(
    page,
    "test.gpx",
    '<gpx><trk><name>Imported ascent</name><trkseg><trkpt lat="45" lon="6"><ele>700</ele></trkpt><trkpt lat="45.001" lon="6"><ele>710</ele></trkpt><trkpt lat="45.002" lon="6"><ele>720</ele></trkpt></trkseg></trk></gpx>',
  );
  await expect(
    page.getByText("Imported ascent · 3 samples · unverified"),
  ).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.getByRole("button", { name: "Use reviewed preview" }).click();
  await expect(page.getByRole("button", { name: "Start" })).toBeEnabled();
  await page.getByRole("button", { name: "Start" }).click();
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
  await page.keyboard.press("h");
  await expect(page.getByLabel("Route minimap")).toBeHidden();
});
test("completed ride retains its live world under the green summary overlay", async ({
  page,
}) => {
  await prepareImportedRide(
    page,
    "finish.gpx",
    '<gpx><trk><name>Finish fixture</name><trkseg><trkpt lat="45" lon="6"><ele>700</ele></trkpt><trkpt lat="45.00005" lon="6"><ele>700</ele></trkpt></trkseg></trk></gpx>',
  );
  await page.getByRole("button", { name: "Use reviewed preview" }).click();
  await expect(page.getByRole("button", { name: "Start" })).toBeEnabled();
  await page.getByRole("button", { name: "Start" }).click();
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
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /THREE|WebGL|shader/i.test(message.text())
    )
      errors.push(message.text());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Free indoor bike training in your browser.",
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
    page.getByRole("button", { name: "Increase power" }),
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
  await page.keyboard.press("p");
  await expect(
    page.getByRole("heading", { name: "Ride paused" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Resume ride" }).click();
  await expect(page.getByRole("heading", { name: "Ride paused" })).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("heading", { name: "Ride wrapped." }),
  ).toBeVisible();
  await expect(page.getByText("AVERAGE POWER", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Ride again" }).click();
  await expect(
    page.getByRole("button", { name: "Increase power" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("saved ghost replay renders and survives pause and resume", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /THREE|WebGL|shader/i.test(message.text())
    )
      errors.push(message.text());
  });
  await page.addInitScript(() => {
    localStorage.setItem(
      "opencycling:ghost:alpe-d-huez-test",
      JSON.stringify({
        routeId: "alpe-d-huez-test",
        elapsedSeconds: 60,
        samples: [
          [0, 0],
          [1, 3],
          [4, 16],
          [60, 240],
        ].map(([elapsedSeconds, distanceMeters]) => ({
          elapsedSeconds,
          distanceMeters,
          speedMetersPerSecond: 4,
          cadenceRpm: 80,
        })),
      }),
    );
  });
  await page.goto("/ride/");
  await page.getByRole("button", { name: "Ghost Mode" }).click();
  await startRide(page);
  const gap = page.getByText(/^GHOST ·/);
  await expect(gap).toBeVisible();
  await page.screenshot({ path: "test-results/ghost-replay.png" });
  await page.keyboard.press("p");
  await expect(
    page.getByRole("heading", { name: "Ride paused" }),
  ).toBeVisible();
  const pausedGap = await gap.textContent();
  await page.locator("canvas").screenshot();
  await expect(gap).toHaveText(pausedGap!);
  await page.getByRole("button", { name: "Resume ride" }).click();
  await expect(page.getByRole("heading", { name: "Ride paused" })).toBeHidden();
  await expect(gap).not.toHaveText(pausedGap!);
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
  await page.keyboard.press("Escape");
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
  await page.getByRole("button", { name: "Start" }).click();
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  await page.keyboard.press("p");
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
  test.setTimeout(45000);
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
  await prepareImportedRide(page, "flat.gpx", flatGearGpx);
  await page.getByRole("button", { name: "Use reviewed preview" }).click();
  await expect(page.getByRole("button", { name: "Start" })).toBeDisabled();
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
  await expect(
    page.getByRole("button", { name: "Easier gear" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Harder gear" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("group", { name: "Trainer gears" }),
  ).toContainText("does not offer trainer resistance control");
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

for (const simulation of [true, false]) {
  test(`FTMS browser gear controls send ${simulation ? "simulation" : "resistance"} commands`, async ({
    page,
  }) => {
    test.setTimeout(45000);
    await page.addInitScript((simulation) => {
      const writes: number[][] = [];
      class Characteristic extends EventTarget {
        value = new DataView(new ArrayBuffer(0));
        properties = { indicate: true, write: true };
        async startNotifications() {
          return this;
        }
        async writeValueWithResponse(buffer: ArrayBuffer) {
          const bytes = Array.from(new Uint8Array(buffer));
          writes.push(bytes);
          document.documentElement.dataset.controlWrites =
            JSON.stringify(writes);
          this.value = new DataView(Uint8Array.of(0x80, bytes[0], 1).buffer);
          this.dispatchEvent(new Event("characteristicvaluechanged"));
        }
      }
      const control = new Characteristic();
      const telemetry = new Characteristic();
      telemetry.value = new DataView(
        Uint8Array.of(0x44, 0, 0x10, 0x0e, 180, 0, 250, 0).buffer,
      );
      const status = new Characteristic();
      const device = new EventTarget() as EventTarget & {
        name: string;
        gatt: unknown;
      };
      device.name = "Gear trainer";
      const gatt = {
        connect: async () => gatt,
        disconnect: () => {},
        getPrimaryService: async (uuid: string) => {
          if (!uuid.includes("1826")) throw new Error("No CPS");
          return {
            getCharacteristic: async (uuid: string) => {
              if (uuid.includes("2ad2")) return telemetry;
              if (uuid.includes("2ad9")) return control;
              if (uuid.includes("2ada")) return status;
              if (uuid.includes("2acc"))
                return {
                  readValue: async () =>
                    new DataView(
                      Uint8Array.of(0, 0, 0, 0, 4, simulation ? 0x20 : 0, 0, 0)
                        .buffer,
                    ),
                };
              if (uuid.includes("2ad6"))
                return {
                  readValue: async () =>
                    new DataView(Uint8Array.of(0, 0, 200, 0, 1, 0).buffer),
                };
              throw new Error("Unavailable");
            },
          };
        },
      };
      device.gatt = gatt;
      Object.defineProperty(navigator, "bluetooth", {
        value: { requestDevice: async () => device },
      });
      setInterval(
        () => telemetry.dispatchEvent(new Event("characteristicvaluechanged")),
        100,
      );
      window.addEventListener("test-permission-lost", () => {
        status.value = new DataView(Uint8Array.of(0xff).buffer);
        status.dispatchEvent(new Event("characteristicvaluechanged"));
      });
    }, simulation);
    await prepareImportedRide(page, "flat.gpx", flatGearGpx);
    await page.getByRole("button", { name: "Use reviewed preview" }).click();
    await page.getByRole("button", { name: "Connect smart trainer" }).click();
    const consent = page.getByRole("checkbox", {
      name: "Control trainer resistance",
    });
    await expect(consent).not.toBeChecked();
    if (!simulation) {
      await consent.check();
      page.on("dialog", (dialog) => dialog.accept());
    }
    await startRide(page);
    const easier = page.getByRole("button", { name: "Easier gear" });
    const harder = page.getByRole("button", { name: "Harder gear" });
    const gear = page.getByRole("group", { name: "Trainer gears" });
    await expect(gear).toContainText("Gear 11 / 21");
    if (simulation) {
      // Starting read-only must allow opting in without leaving the live road.
      await expect(harder).toBeDisabled();
      const enable = page.getByRole("button", { name: "Enable trainer gears" });
      await expect(enable).toBeVisible();
      page.once("dialog", (dialog) => dialog.dismiss());
      await enable.click();
      await expect(harder).toBeDisabled();
      expect(
        await page.locator("html").getAttribute("data-control-writes"),
      ).toBeNull();
      page.on("dialog", (dialog) => dialog.accept());
      await enable.click();
      await expect(enable).toBeHidden();
    }
    await expect(harder).toBeEnabled();
    if (!simulation) await page.setViewportSize({ width: 390, height: 844 });
    const target = async () =>
      page.evaluate(
        (opcode) => {
          const writes: number[][] = JSON.parse(
            document.documentElement.dataset.controlWrites || "[]",
          );
          const bytes = writes.filter((entry) => entry[0] === opcode).at(-1);
          if (!bytes) return null;
          return new DataView(Uint8Array.from(bytes).buffer).getInt16(
            opcode === 0x11 ? 3 : 1,
            true,
          );
        },
        simulation ? 0x11 : 0x04,
      );
    await expect.poll(target).not.toBeNull();
    const neutral = (await target())!;
    await harder.click();
    await page.keyboard.press("]");
    await expect(gear).toContainText("Gear 13 / 21");
    await page.screenshot({
      path: `test-results/ftms-gears-${simulation ? "simulation" : "resistance"}.png`,
    });
    await expect.poll(target).toBeGreaterThan(neutral);
    await easier.click();
    await page.keyboard.press("[");
    await expect(gear).toContainText("Gear 11 / 21");
    await page.keyboard.down("]");
    await page.keyboard.down("]");
    await page.keyboard.up("]");
    await expect(gear).toContainText("Gear 12 / 21");
    await page.keyboard.press("[");
    await page.keyboard.press("p");
    await expect(harder).toBeDisabled();
    const pausedWrites = await page
      .locator("html")
      .getAttribute("data-control-writes");
    await page.keyboard.press("]");
    await expect(gear).toContainText("Gear 11 / 21");
    await page.waitForTimeout(350);
    await expect(page.locator("html")).toHaveAttribute(
      "data-control-writes",
      pausedWrites!,
    );
    await page.getByRole("button", { name: "Resume ride" }).click();
    await expect(harder).toBeEnabled();
    await page.evaluate(() =>
      window.dispatchEvent(new Event("test-permission-lost")),
    );
    await expect(harder).toBeDisabled();
    await expect(easier).toBeDisabled();
    await expect(page.locator("main").getByRole("alert")).toContainText(
      "permission",
    );
  });
}
