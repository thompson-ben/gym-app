import base from "./playwright.config";
import { defineConfig } from "@playwright/test";

/**
 * Regenerates the landing-page screenshots in public/landing from a demo account on the local
 * stack (sample data, never a real account). Run after `npm run build`:
 *   npx playwright test --config playwright.marketing.config.ts
 */
export default defineConfig({
  ...base,
  testDir: "tests/marketing",
  timeout: 180_000,
  projects: [{ name: "marketing", use: { browserName: "chromium", colorScheme: "dark" } }],
});
