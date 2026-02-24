import { fetchWithRetry } from "./http.js";

export async function postPRComment(input: {
  owner: string;
  repo: string;
  prNumber: number;
  body: string;
}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return;

  const response = await fetchWithRetry(`https://api.github.com/repos/${input.owner}/${input.repo}/issues/${input.prNumber}/comments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ body: input.body })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GitHub comment API error ${response.status}: ${detail}`);
  }
}

export function formatComment(score: number, severity: string, findings: string[], recommendations: string[]) {
  const icon = severity === "critical" ? "🛑" : severity === "high" ? "🔴" : severity === "medium" ? "🟠" : "🟢";
  return [
    `## ${icon} PR Risk Gate Result`,
    `- **Risk Score:** ${score}/100`,
    `- **Severity:** ${severity.toUpperCase()}`,
    findings.length ? `- **Findings:** ${findings.map((f) => `\`${f}\``).join(", ")}` : "- **Findings:** none",
    recommendations.length ? `- **Recommended checks:** ${recommendations.join("; ")}` : "- **Recommended checks:** none"
  ].join("\n");
}
