import { test, expect } from "@playwright/test";

test("landing content and SEO are present without JavaScript", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page).toHaveTitle("OpenRide — Open source virtual cycling");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    /Bluetooth smart trainer/,
  );
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    /OpenRide/,
  );
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Cedar Valley Loop" }),
  ).toBeVisible();
  await expect(page.locator("noscript p")).toBeVisible();
  expect(
    await page
      .locator("img")
      .evaluate(
        (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
      ),
  ).toBe(true);
  await page.goto("/ride/");
  await expect(page).toHaveTitle("Ride Cedar Valley | OpenRide");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, follow",
  );
  await context.close();
});

test("static crawler files are served without a runtime server", async ({
  request,
}) => {
  const robots = await request.get("/robots.txt");
  expect(robots.ok()).toBe(true);
  expect(await robots.text()).toContain("Allow: /");
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBe(true);
  expect(await sitemap.text()).toContain("<urlset");
  expect(await sitemap.text()).not.toContain("/ride/");
});

test("landing page stays static, stable and within its script budget", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    const metrics = { lcp: 0, cls: 0, webgl: 0 };
    Object.assign(window, { landingMetrics: metrics });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) metrics.lcp = entry.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & {
          value: number;
          hadRecentInput: boolean;
        };
        if (!shift.hadRecentInput) metrics.cls += shift.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      ...args: Parameters<typeof original>
    ) {
      if (String(args[0]).includes("webgl")) metrics.webgl++;
      return original.apply(this, args);
    } as typeof original;
  });
  await page.goto("/");
  await expect(page.getByText("Checking Bluetooth support…")).toBeHidden();
  await page.waitForTimeout(1000);
  await expect(page.locator("canvas")).toHaveCount(0);
  const metrics = await page.evaluate(() => ({
    ...(
      window as unknown as {
        landingMetrics: { lcp: number; cls: number; webgl: number };
      }
    ).landingMetrics,
    scriptBytes: performance
      .getEntriesByType("resource")
      .filter(
        (entry) =>
          (entry as PerformanceResourceTiming).initiatorType === "script",
      )
      .reduce(
        (sum, entry) =>
          sum + (entry as PerformanceResourceTiming).decodedBodySize,
        0,
      ),
  }));
  await testInfo.attach("landing-performance.json", {
    body: JSON.stringify(metrics, null, 2),
    contentType: "application/json",
  });
  expect(metrics.webgl).toBe(0);
  expect(metrics.cls).toBeLessThanOrEqual(0.1);
  expect(metrics.scriptBytes).toBeLessThan(700_000);
  await page.getByRole("button", { name: "Start ride" }).click();
  await expect(page.locator("canvas")).toBeVisible();
});

test("mobile landing page fits without horizontal scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByText("Checking Bluetooth support…")).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.getByRole("button", { name: "Start ride" })).toBeEnabled();
});

test("WebGL failure produces an actionable error and a paused ride", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      ...args: Parameters<typeof original>
    ) {
      if (String(args[0]).includes("webgl")) return null;
      return original.apply(this, args);
    } as typeof original;
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Start ride" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Enable hardware acceleration",
  );
  await expect(
    page.getByRole("heading", { name: "Ride paused" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toBeHidden();
});

test("failed scene download clears loading and reports recovery", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Checking Bluetooth support…")).toBeHidden();
  await page.route("**/*.js", (route) => route.abort());
  await page.getByRole("button", { name: "Start ride" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Reload to try again",
  );
  await expect(page.getByRole("status")).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "Ride paused" }),
  ).toBeVisible();
});
