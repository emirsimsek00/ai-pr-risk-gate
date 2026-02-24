import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "./index.js";

describe("api integration", () => {
  it("returns health", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
  });


  it("validates analyze payload", async () => {
    const res = await request(app).post("/api/analyze").send({ repo: "x" });
    expect(res.status).toBe(400);
  });

  it("rejects empty files array", async () => {
    const res = await request(app).post("/api/analyze").send({ repo: "x", prNumber: 2, files: [] });
    expect(res.status).toBe(400);
  });

  it("rejects path traversal filenames", async () => {
    const res = await request(app).post("/api/analyze").send({
      repo: "ai-pr-risk-gate",
      prNumber: 3,
      files: [{ filename: "../../etc/passwd", patch: "+x" }]
    });

    expect(res.status).toBe(400);
    expect(String(res.body.error)).toContain("valid, safe filename");
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

  it("rejects webhook with invalid signature when secret is configured", async () => {
    const previous = process.env.GITHUB_WEBHOOK_SECRET;
    process.env.GITHUB_WEBHOOK_SECRET = "test-secret";

    const res = await request(app)
      .post("/webhook/github")
      .set("x-hub-signature-256", "sha256=deadbeef")
      .send({ action: "opened" });

    process.env.GITHUB_WEBHOOK_SECRET = previous;
    expect(res.status).toBe(401);
  });

  it("ignores non pull_request webhook events", async () => {
    const previous = process.env.GITHUB_WEBHOOK_SECRET;
    delete process.env.GITHUB_WEBHOOK_SECRET;

    const res = await request(app)
      .post("/webhook/github")
      .set("x-github-event", "issues")
      .send({ action: "opened" });

    process.env.GITHUB_WEBHOOK_SECRET = previous;
    expect(res.status).toBe(200);
    expect(res.text).toBe("ignored");
  });
});
