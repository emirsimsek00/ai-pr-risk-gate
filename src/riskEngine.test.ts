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

  it("keeps findings/recommendations deduplicated", () => {
    const result = evaluateRisk([
      { filename: "src/auth/a.ts", patch: "+ token" },
      { filename: "src/auth/b.ts", patch: "+ token" }
    ]);

    expect(result.findings).toHaveLength(1);
    expect(result.recommendations).toHaveLength(1);
  });

  it("returns low severity for low score and caps at 100", () => {
    const low = evaluateRisk([{ filename: "README.md", patch: "+ docs" }]);
    expect(low.severity).toBe("low");

    const many = Array.from({ length: 100 }, (_, i) => ({
      filename: `src/auth/file-${i}.ts`,
      patch: "+ select * from users"
    }));

    const high = evaluateRisk(many);
    expect(high.score).toBeLessThanOrEqual(100);
    expect(high.severity).toBe("critical");
  });
});
