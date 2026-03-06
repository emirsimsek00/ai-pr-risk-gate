import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatComment, postPRComment } from "./github.js";
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

  it("posts comment successfully when GitHub API returns ok", async () => {
    process.env.GITHUB_TOKEN = "token";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);

    await expect(postPRComment({ owner: "o", repo: "r", prNumber: 1, body: "x" })).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws when comment API returns non-ok", async () => {
    process.env.GITHUB_TOKEN = "token";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "boom" }));

    await expect(postPRComment({ owner: "o", repo: "r", prNumber: 1, body: "x" })).rejects.toThrow("GitHub comment API error");
  });

  it("throws when webhook PR fetch token is missing", async () => {
    await expect(fetchPullRequestFiles({ owner: "o", repo: "r", prNumber: 1 })).rejects.toThrow("GITHUB_TOKEN is required");
  });

  it("allows unauthenticated PR fetch when explicitly enabled", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [{ filename: "a.ts", status: "modified", patch: "+a" }]
    });

    vi.stubGlobal("fetch", fetchMock);

    const files = await fetchPullRequestFiles({ owner: "o", repo: "r", prNumber: 2, allowUnauthenticated: true });
    expect(files).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0] as [string, { headers?: Record<string, string> }];
    expect(options?.headers?.Authorization).toBeUndefined();
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

  it("formats comment with critical icon and full details", () => {
    const markdown = formatComment(92, "critical", ["Dangerous shell execution"], ["Security review", "Add regression tests"]);
    expect(markdown).toContain("🛑 PR Risk Gate Result");
    expect(markdown).toContain("**Risk Score:** 92/100");
    expect(markdown).toContain("**Severity:** CRITICAL");
    expect(markdown).toContain("`Dangerous shell execution`");
    expect(markdown).toContain("Security review; Add regression tests");
  });

  it("formats comment with no findings/recommendations", () => {
    const markdown = formatComment(10, "low", [], []);
    expect(markdown).toContain("🟢 PR Risk Gate Result");
    expect(markdown).toContain("**Findings:** none");
    expect(markdown).toContain("**Recommended checks:** none");
  });
});
