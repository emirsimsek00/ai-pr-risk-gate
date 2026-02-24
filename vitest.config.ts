import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      thresholds: {
        lines: 45,
        functions: 55,
        branches: 45,
        statements: 45
      }
    }
  }
});
