import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "./index.js";

describe("api integration", () => {
  it("returns health", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("validates analyze payload", async () => {
    const res = await request(app).post("/api/analyze").send({ repo: "x" });
    expect(res.status).toBe(400);
  });

  it("analyzes valid payload", async () => {
    const res = await request(app).post("/api/analyze").send({
      repo: "ai-pr-risk-gate",
      prNumber: 99,
      files: [{ filename: "src/auth/jwt.ts", patch: "+ const token = sign(payload, secret)" }]
    });

    expect([200, 409]).toContain(res.status);
    expect(typeof res.body.score).toBe("number");
    expect(res.body.policy).toBeTruthy();
  });
});
