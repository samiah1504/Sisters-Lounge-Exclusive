import { defineConfig } from "vitest/config";
import path from "node:path";

const integration = process.env.INTEGRATION === "1";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    include: integration
      ? ["tests/integration/**/*.test.ts"]
      : ["src/**/*.test.ts"],
    environment: "node",
    testTimeout: 20_000,
    // DB tests share one connection; keep them sequential.
    ...(integration ? { fileParallelism: false, maxConcurrency: 1, sequence: { concurrent: false } } : {}),
  },
});
