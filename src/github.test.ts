import { beforeEach, describe, expect, it, vi } from "vitest";
import { postPRComment } from "./github.js";
import { fetchPullRequestFiles } from "./githubApi.js";

describe("github integrations", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("throws when comment API returns non-ok", async () => {
    process.env.GITHUB_TOKEN = "token";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "boom" }));

    await expect(postPRComment({ owner: "o", repo: "r", prNumber: 1, body: "x" })).rejects.toThrow("GitHub comment API error");
  });

  it("fetches PR files across pages", async () => {
    process.env.GITHUB_TOKEN = "token";

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [{ filename: "a.ts", status: "modified", patch: "+a" }] })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] });

    vi.stubGlobal("fetch", fetchMock);

    const files = await fetchPullRequestFiles({ owner: "o", repo: "r", prNumber: 1 });
    expect(files.length).toBe(1);
    expect(files[0].filename).toBe("a.ts");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
