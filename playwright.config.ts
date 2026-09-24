import { execSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* optional */
}

// Local-only admin key for creating pre-confirmed test users (printed by the Supabase CLI for
// the local stack; never a production credential).
if (!process.env.SUPABASE_LOCAL_SECRET_KEY) {
  try {
    const env = execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const match = env.match(/^SERVICE_ROLE_KEY="?([^"\n]+)"?/m);
    if (match) process.env.SUPABASE_LOCAL_SECRET_KEY = match[1];
  } catch {
    /* stack not running: auth tests will fail loudly */
  }
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
