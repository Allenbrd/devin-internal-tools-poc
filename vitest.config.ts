import path from "node:path";
import { defineConfig } from "vitest/config";

// Set here (main process) so globalSetup and workers share them.
// CI overrides DATABASE_URL to run the same suite against Postgres.
process.env.DATABASE_URL ??= "file:./test.db";
process.env.SESSION_SECRET ??= "test-only-session-secret-0123456789-abcdefgh";
process.env.AUTH_PROVIDER ??= "mock";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "tests/support/empty.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/support/global-setup.ts"],
    setupFiles: ["tests/support/setup.ts"],
    // Tests share one database.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 120_000,
  },
});
