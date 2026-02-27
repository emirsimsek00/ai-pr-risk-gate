import { beforeEach, describe, expect, it, vi } from "vitest";
import { postPRComment } from "./github.js";
import { fetchPullRequestFiles } from "./githubApi.js";

describe("github integrations", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.GITHUB_TOKEN;
  });

  it("no-ops comment posting when token is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(postPRComment({ owner: "o", repo: "r", prNumber: 1, body: "x" })).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws when comment API returns non-ok", async () => {
    process.env.GITHUB_TOKEN = "token";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "boom" }));

    await expect(postPRComment({ owner: "o", repo: "r", prNumber: 1, body: "x" })).rejects.toThrow("GitHub comment API error");
  });

  it("throws when webhook PR fetch token is missing", async () => {
    await expect(fetchPullRequestFiles({ owner: "o", repo: "r", prNumber: 1 })).rejects.toThrow("GITHUB_TOKEN is required");
  });

  it("fetches PR files in a single page", async () => {
    process.env.GITHUB_TOKEN = "token";

    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [{ filename: "a.ts", status: "modified", patch: "+a" }]
    });

    vi.stubGlobal("fetch", fetchMock);

    const files = await fetchPullRequestFiles({ owner: "o", repo: "r", prNumber: 1 });
    expect(files.length).toBe(1);
    expect(files[0].filename).toBe("a.ts");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fetches PR files across pages", async () => {
    process.env.GITHUB_TOKEN = "token";

    const hundred = Array.from({ length: 100 }, (_, i) => ({
      filename: `f-${i}.ts`,
      status: "modified",
      patch: "+line"
    }));

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => hundred })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [{ filename: "final.ts", status: "added", patch: "+x" }] });

    vi.stubGlobal("fetch", fetchMock);

    const files = await fetchPullRequestFiles({ owner: "o", repo: "r", prNumber: 1 });
    expect(files.length).toBe(101);
    expect(files[100].filename).toBe("final.ts");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
