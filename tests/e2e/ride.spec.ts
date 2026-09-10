import { test, expect } from "@playwright/test";
test("simulator ride, controls, pause, summary and restart", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A little power. A world to ride." }),
  ).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.screenshot({
    path: "test-results/home-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Use simulator" }).click();
  await page.getByRole("button", { name: "Start ride" }).click();
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByRole("status")).toBeHidden();
  await expect(
    page.getByText("VIRTUAL TRAINER", { exact: true }),
  ).toBeVisible();
  await page.locator("main").click({ position: { x: 400, y: 300 } });
  await page.keyboard.press("5");
  await expect(page.getByText("300 W", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Increase power" }).click();
  await expect(page.getByText("325 W", { exact: true })).toBeVisible();
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
  await page.getByRole("button", { name: "Start ride" }).click();
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByRole("status")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Increase power" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Increase power" }).click();
  await expect(page.getByText("175 W", { exact: true })).toBeVisible();
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

test("FTMS browser notifications drive the ride and disconnect offers fallback", async ({
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
  await page.getByRole("button", { name: "Connect smart trainer" }).click();
  await expect(page.getByText("Mock FTMS Trainer · connected")).toBeVisible();
  await expect(page.getByText("250 W · 90 rpm · 36.0 km/h raw")).toBeVisible();
  await page.getByRole("button", { name: "Start ride" }).click();
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByRole("status")).toBeHidden();
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
  await page.getByRole("button", { name: "Use simulator" }).click();
  await page.getByRole("button", { name: "Resume ride" }).click();
  await expect(
    page.getByText("VIRTUAL TRAINER", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("main").getByRole("alert")).toBeHidden();
});
