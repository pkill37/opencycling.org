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
    await page.addInitScript(() => {
      const Original = window.AudioContext;
      if (!Original) return;
      window.AudioContext = new Proxy(Original, {
        construct(target, args) {
          const context = Reflect.construct(target, args) as AudioContext;
          document.documentElement.dataset.audioContexts = String(
            Number(document.documentElement.dataset.audioContexts || 0) + 1,
          );
          const createGain = context.createGain.bind(context);
          let firstGain = true;
          context.createGain = () => {
            const gain = createGain();
            if (firstGain) {
              firstGain = false;
              Object.assign(window, { zombieMasterGain: gain.gain });
            }
            return gain;
          };
          const create = context.createBufferSource.bind(context);
          context.createBufferSource = () => {
            const source = create();
            const start = source.start.bind(source);
            source.start = (...args) => {
              document.documentElement.dataset.zombieSounds = String(
                Number(document.documentElement.dataset.zombieSounds || 0) + 1,
              );
              start(...args);
            };
            return source;
          };
          return context;
        },
      });
    });
    await page.goto("/ride/");
    await expect(page.locator("canvas")).toHaveCount(0);
    expect(
      await page.locator("html").getAttribute("data-audio-contexts"),
    ).toBeNull();
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
    if (mode === "Zombies Mode") {
      const mute = page.getByRole("button", { name: "Mute zombie sound" });
      await expect(mute).toHaveAttribute("aria-pressed", "true");
      await expect
        .poll(async () =>
          Number(await page.locator("html").getAttribute("data-zombie-sounds")),
        )
        .toBeGreaterThan(0);
      await mute.click();
      await expect(
        page.getByRole("button", { name: "Enable zombie sound" }),
      ).toHaveAttribute("aria-pressed", "false");
      const sounds = await page
        .locator("html")
        .getAttribute("data-zombie-sounds");
      await page.waitForTimeout(300);
      await expect(page.locator("html")).toHaveAttribute(
        "data-zombie-sounds",
        sounds!,
      );
      await page.getByRole("button", { name: "Enable zombie sound" }).click();
      await expect(mute).toBeVisible();
    } else {
      expect(
        await page.locator("html").getAttribute("data-audio-contexts"),
      ).toBeNull();
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
    if (mode === "Zombies Mode") {
      await expect(page.getByText("BEHIND YOU", { exact: true })).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as unknown as { zombieMasterGain: AudioParam })
                .zombieMasterGain.value,
          ),
        )
        .toBe(0);
      const overlay = await page.addStyleTag({
        content: '[class*="pauseCard"] { visibility: hidden !important; }',
      });
      const canvas = page.locator("canvas");
      const bounds = (await canvas.boundingBox())!;
      // An oblique rear view keeps the player's body from occluding the horde.
      await page.mouse.move(bounds.x + 900, bounds.y + 350);
      await page.mouse.down();
      await page.mouse.move(bounds.x + 450, bounds.y + 350, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(500);
      await page.screenshot({
        path: "test-results/zombies-safe-rear-view.png",
      });
      await expect(board).toHaveText(paused!);
      await overlay.evaluate((element) => {
        element.parentNode?.removeChild(element);
      });
    }
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

test("zombies catch and eat an AI rider while the player keeps racing", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "bluetooth", {
      value: undefined,
      configurable: true,
    }),
  );
  const climb = `<gpx><trk><name>Zombie climb</name><trkseg>${Array.from(
    { length: 11 },
    (_, index) =>
      `<trkpt lat="${45 + index * 0.001}" lon="6"><ele>${700 + index * 22.2}</ele></trkpt>`,
  ).join("")}</trkseg></trk></gpx>`;
  await page.goto("/ride/");
  await page.getByLabel("Route file").setInputFiles({
    name: "climb.gpx",
    mimeType: "application/gpx+xml",
    buffer: Buffer.from(climb),
  });
  await page.getByRole("button", { name: "Validate selected segment" }).click();
  await page.getByRole("button", { name: "Use reviewed preview" }).click();
  await page.getByRole("button", { name: "Zombies Mode", exact: true }).click();
  await startRide(page);
  await page.keyboard.press("9");
  const board = page.getByRole("table", { name: "Local race leaderboard" });
  await expect(
    board.getByRole("cell", { name: "EATEN", exact: true }).first(),
  ).toBeVisible({ timeout: 45000 });
  await expect(page.getByText(/AI riders eaten: [1-4]/)).toBeVisible();
  const victimBox = (await board
    .getByRole("cell", { name: "EATEN", exact: true })
    .first()
    .locator("..")
    .boundingBox())!;
  const routeBox = (await page.locator('[class*="routeHud"]').boundingBox())!;
  expect(
    victimBox.y + victimBox.height <= routeBox.y ||
      victimBox.x >= routeBox.x + routeBox.width ||
      victimBox.x + victimBox.width <= routeBox.x,
  ).toBe(true);
  await expect(
    page.getByRole("heading", { name: "THE HORDE CAUGHT YOU." }),
  ).toHaveCount(0);
  await page.keyboard.press("p");
  await page.addStyleTag({
    content: '[class*="pauseCard"] { visibility: hidden !important; }',
  });
  const canvas = page.locator("canvas");
  await canvas.dispatchEvent("pointerdown", {
    pointerId: 1,
    button: 0,
    clientX: 900,
    clientY: 350,
  });
  await canvas.dispatchEvent("pointermove", {
    pointerId: 1,
    clientX: 450,
    clientY: 350,
  });
  await canvas.dispatchEvent("pointerup", { pointerId: 1 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: "test-results/zombie-feeding.png" });
  expect(errors).toEqual([]);
});
