import { describe, expect, it } from "vitest";
import { evaluateRisk } from "./riskEngine.js";

describe("risk engine", () => {
  it("assigns higher risk to auth and infra changes", () => {
    const result = evaluateRisk([
      { filename: "src/auth/jwt.ts", patch: "+ const token = sign(payload, secret)" },
      { filename: ".github/workflows/ci.yml", patch: "+ run: npm test" }
    ]);

    expect(result.score).toBeGreaterThan(20);
    expect(["medium", "high", "critical", "low"]).toContain(result.severity);
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it("caps score at 100", () => {
    const many = Array.from({ length: 100 }, (_, i) => ({
      filename: `src/auth/file-${i}.ts`,
      patch: "+ select * from users"
    }));

    const result = evaluateRisk(many);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
