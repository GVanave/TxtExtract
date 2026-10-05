import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run the real app in dev mode with a fake Gemini, in-memory storage and sign-in turned off
 * (these switches only work outside production builds).
 */
const PORT = 3100;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions: { executablePath, args: ["--no-proxy-server"] },
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/signin`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { AUTH_DISABLED: "1", GEMINI_FAKE: "1", DATA_BACKEND: "memory", NEXT_TELEMETRY_DISABLED: "1" },
  },
});
