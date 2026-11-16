import { test, expect } from "@playwright/test";
import { startRide } from "./helpers";

const gpx = `<gpx><trk><name>NPC race</name><trkseg>${Array.from(
  { length: 11 },
  (_, index) =>
    `<trkpt lat="${45 + index * 0.001}" lon="6"><ele>700</ele></trkpt>`,
).join("")}</trkseg></trk></gpx>`;

for (const mode of ["Open Ride", "Ghost Mode", "Zombies Mode"]) {
  test(`${mode} has racing NPCs and a live local leaderboard`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "bluetooth", {
        value: undefined,
        configurable: true,
      });
      localStorage.setItem(
        "opencycling:ghost:gpx-import",
        JSON.stringify({
          routeId: "gpx-import",
          elapsedSeconds: 120,
          samples: [0, 120].map((elapsedSeconds) => ({
            elapsedSeconds,
            distanceMeters: elapsedSeconds * 4,
            speedMetersPerSecond: 4,
            cadenceRpm: 80,
          })),
        }),
      );
    });
    await page.goto("/ride/");
    await expect(page.locator("canvas")).toHaveCount(0);
    await page.getByLabel("Route file").setInputFiles({
      name: "race.gpx",
      mimeType: "application/gpx+xml",
      buffer: Buffer.from(gpx),
    });
    await page
      .getByRole("button", { name: "Validate selected segment" })
      .click();
    await page.getByRole("button", { name: "Use reviewed preview" }).click();
    await page
      .getByRole("group", { name: "Ride mode" })
      .getByRole("button", { name: mode, exact: mode !== "Ghost Mode" })
      .click();
    if (mode === "Open Ride") {
      await page.getByRole("button", { name: "Start" }).click();
      const countdown = page.getByRole("status", { name: "Race countdown" });
      await expect(countdown.locator("strong")).toHaveText("1", {
        timeout: 30000,
      });
      const waitingBoard = page.getByRole("table", {
        name: "Local race leaderboard",
      });
      const startingStandings = await waitingBoard.textContent();
      for (const label of ["2", "3"]) {
        await expect(countdown.locator("strong")).toHaveText(label);
        await expect(waitingBoard).toHaveText(startingStandings!);
        await expect(page.getByText("00:00", { exact: true })).toBeVisible();
      }
      await page.screenshot({ path: "test-results/race-countdown.png" });
      await expect(countdown.locator("strong")).toHaveText("START");
      await expect(countdown).toBeHidden();
    } else {
      await startRide(page);
    }
    const board = page.getByRole("table", { name: "Local race leaderboard" });
    await expect(board).toBeVisible();
    await expect(board.locator("tbody tr")).toHaveCount(5);
    for (const name of ["Ari", "Blake", "Casey", "Drew", "You"]) {
      await expect(
        board.getByRole("rowheader", { name: new RegExp(name) }),
      ).toBeVisible();
    }
    await page.keyboard.press("1");
    await expect
      .poll(async () => board.locator("tbody tr").first().textContent())
      .not.toContain("You");
    await page.keyboard.press("p");
    await expect(
      page.getByRole("heading", { name: "Ride paused" }),
    ).toBeVisible();
    const paused = await board.textContent();
    await page.waitForTimeout(350);
    await expect(board).toHaveText(paused!);
    await page.getByRole("button", { name: "Resume ride" }).click();
    await page.keyboard.press("h");
    await expect(board).toBeHidden();
    await page.keyboard.press("h");
    await expect(board).toBeVisible();
    if (mode === "Open Ride") {
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(board).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({ path: "test-results/npc-race-phone.png" });
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.screenshot({ path: "test-results/npc-race-desktop.png" });
      await page.keyboard.press("Escape");
      await expect(
        page.getByText(/Local race · .* when the ride ended/),
      ).toBeVisible();
      await page.getByRole("button", { name: "Ride again" }).click();
      await expect(board.locator("tbody tr")).toHaveCount(5);
    }
    expect(errors).toEqual([]);
  });
}
