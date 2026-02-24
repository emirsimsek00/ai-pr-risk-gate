import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadAppWithEnv(env: Record<string, string | undefined>) {
  const snapshot = {
    API_KEYS_JSON: process.env.API_KEYS_JSON,
    CORS_ORIGINS: process.env.CORS_ORIGINS
  };

  process.env.API_KEYS_JSON = env.API_KEYS_JSON;
  process.env.CORS_ORIGINS = env.CORS_ORIGINS;

  vi.resetModules();
  const mod = await import("./index.js");

  process.env.API_KEYS_JSON = snapshot.API_KEYS_JSON;
  process.env.CORS_ORIGINS = snapshot.CORS_ORIGINS;

  return mod.app;
}

describe("auth + cors integration", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("blocks write endpoint when only read key is provided", async () => {
    const app = await loadAppWithEnv({
      API_KEYS_JSON: JSON.stringify([{ key: "read-key", role: "read" }]),
      CORS_ORIGINS: undefined
    });

    const res = await request(app)
      .post("/api/analyze")
      .set("x-api-key", "read-key")
      .send({ repo: "ai-pr-risk-gate", prNumber: 1, files: [{ filename: "src/a.ts", patch: "+x" }] });

    expect(res.status).toBe(403);
  });

  it("allows read endpoint with read key", async () => {
    const app = await loadAppWithEnv({
      API_KEYS_JSON: JSON.stringify([{ key: "read-key", role: "read" }]),
      CORS_ORIGINS: undefined
    });

    const res = await request(app)
      .get("/api/recent")
      .set("x-api-key", "read-key");

    expect(res.status).toBe(200);
  });

  it("applies CORS allowlist", async () => {
    const app = await loadAppWithEnv({
      API_KEYS_JSON: undefined,
      CORS_ORIGINS: "https://example.com"
    });

    const res = await request(app)
      .options("/api/recent")
      .set("origin", "https://example.com");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("https://example.com");
  });
});
