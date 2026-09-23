import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"], environment: "node" },
      },
      {
        extends: true,
        // Requires the local Supabase stack (`npm run db:start`).
        test: { name: "db", include: ["tests/db/**/*.test.ts"], environment: "node", fileParallelism: false, testTimeout: 30000 },
      },
    ],
  },
});
