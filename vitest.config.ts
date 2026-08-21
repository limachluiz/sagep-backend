import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup-env.ts"],
    hookTimeout: 30000,
    testTimeout: 45000,
    pool: "forks",
    fileParallelism: false,
  },
});
