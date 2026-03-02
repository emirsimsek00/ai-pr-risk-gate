import { describe, expect, it, vi } from "vitest";
import { fetchWithRetry } from "./http.js";

describe("http retry helper", () => {
  it("retries retriable HTTP statuses and eventually succeeds", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ status: 500 })
      .mockResolvedValueOnce({ status: 429 })
      .mockResolvedValueOnce({ status: 200, ok: true });

    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchWithRetry("https://example.com");
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-retriable statuses", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 404, ok: false });
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchWithRetry("https://example.com");
    expect(res.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws after retry attempts on network failures", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchWithRetry("https://example.com")).rejects.toThrow("network down");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("aborts requests that exceed HTTP timeout", async () => {
    const original = process.env.HTTP_TIMEOUT_MS;
    process.env.HTTP_TIMEOUT_MS = "10";

    vi.resetModules();
    const { fetchWithRetry: fetchWithTimeout } = await import("./http.js");

    const fetchMock = vi.fn((_url: string | URL, init?: RequestInit) => new Promise((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }));

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await expect(fetchWithTimeout("https://example.com")).rejects.toThrow("aborted");

    process.env.HTTP_TIMEOUT_MS = original;
    vi.resetModules();
  });
});
