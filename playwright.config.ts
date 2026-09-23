import { defineConfig, devices } from "@playwright/test";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* optional */
}

const PORT = Number(process.env.E2E_PORT ?? 3100);

/**
 * End-to-end tests against a production build and the local Supabase stack
 * (`npm run db:start`). Run with `npm run test:e2e`.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : undefined,
  },
  projects: [{ name: "mobile", use: { ...devices["Pixel 7"], browserName: "chromium", colorScheme: "dark" } }],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/sign-in`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
