import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
    launchOptions: {
      args: [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    },
  },
  webServer: {
    command: "npx serve out -l tcp://127.0.0.1:4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
  },
  timeout: 30000,
});
