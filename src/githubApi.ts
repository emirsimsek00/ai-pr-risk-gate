import type { ChangedFile } from "./types.js";

type PullFileResponse = {
  filename: string;
  status?: string;
  patch?: string;
};

export async function fetchPullRequestFiles(input: {
  owner: string;
  repo: string;
  prNumber: number;
}): Promise<ChangedFile[]> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is required for webhook-driven PR fetch");

  const perPage = 100;
  let page = 1;
  const files: ChangedFile[] = [];

  while (true) {
    const url = new URL(`https://api.github.com/repos/${input.owner}/${input.repo}/pulls/${input.prNumber}/files`);
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("page", String(page));

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json"
      }
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GitHub API error ${res.status}: ${body}`);
    }

    const batch = (await res.json()) as PullFileResponse[];
    files.push(...batch.map((f) => ({ filename: f.filename, status: f.status, patch: f.patch })));

    if (batch.length < perPage) break;
    page += 1;
  }

  return files;
}
