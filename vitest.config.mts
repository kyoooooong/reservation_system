import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    hookTimeout: 120_000,
    testTimeout: 120_000,
    fileParallelism: false,
  },
});
