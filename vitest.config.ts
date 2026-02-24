import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      thresholds: {
        lines: 48,
        functions: 60,
        branches: 50,
        statements: 48
      }
    }
  }
});
