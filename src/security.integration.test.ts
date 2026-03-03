import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadAppWithEnv(env: Record<string, string | undefined>) {
  const snapshot = {
    API_KEYS_JSON: process.env.API_KEYS_JSON,
    CORS_ORIGINS: process.env.CORS_ORIGINS,
    ENABLE_HSTS: process.env.ENABLE_HSTS
  };

  process.env.API_KEYS_JSON = env.API_KEYS_JSON;
  process.env.CORS_ORIGINS = env.CORS_ORIGINS;
  process.env.ENABLE_HSTS = env.ENABLE_HSTS;

  vi.resetModules();
  const mod = await import("./index.js");

  process.env.API_KEYS_JSON = snapshot.API_KEYS_JSON;
  process.env.CORS_ORIGINS = snapshot.CORS_ORIGINS;
  process.env.ENABLE_HSTS = snapshot.ENABLE_HSTS;

  return mod.app;
}

describe("security headers integration", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("does not expose x-powered-by", async () => {
    const app = await loadAppWithEnv({
      API_KEYS_JSON: undefined,
      CORS_ORIGINS: undefined,
      ENABLE_HSTS: "false"
    });

    const res = await request(app).get("/health/live");

    expect(res.status).toBe(200);
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("sets core hardening headers", async () => {
    const app = await loadAppWithEnv({
      API_KEYS_JSON: undefined,
      CORS_ORIGINS: undefined,
      ENABLE_HSTS: "false"
    });

    const res = await request(app).get("/health/live");

    expect(res.status).toBe(200);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(res.headers["permissions-policy"]).toContain("camera=()");
    expect(res.headers["cross-origin-opener-policy"]).toBe("same-origin");
    expect(res.headers["cross-origin-resource-policy"]).toBe("same-origin");
  });
});
