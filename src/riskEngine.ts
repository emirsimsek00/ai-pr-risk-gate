import type { ChangedFile, RiskResult } from "./types.js";

const RULES = [
  {
    test: (f: ChangedFile) => /auth|jwt|session|permission|rbac|middleware/i.test(f.filename + (f.patch || "")),
    points: 22,
    finding: "Authentication/authorization-related code changed",
    recommendation: "Require security review and add auth regression tests"
  },
  {
    test: (f: ChangedFile) => /sql|query\(|where\(|select\s|insert\s|delete\s|update\s/i.test(f.patch || "") || /migrations?\//i.test(f.filename),
    points: 16,
    finding: "Database query or migration changes detected",
    recommendation: "Validate query safety/performance and run migration in staging first"
  },
  {
    test: (f: ChangedFile) => /\.github\/workflows|Dockerfile|docker-compose|k8s|terraform|helm/i.test(f.filename),
    points: 14,
    finding: "Infrastructure/CI configuration changed",
    recommendation: "Require DevOps review before merge"
  },
  {
    test: (f: ChangedFile) => /package-lock\.json|pnpm-lock\.yaml|yarn\.lock|requirements\.txt|poetry\.lock/i.test(f.filename),
    points: 10,
    finding: "Dependency changes detected",
    recommendation: "Run dependency vulnerability scan"
  },
  {
    test: (f: ChangedFile) => /-\s*it\(|-\s*test\(|-\s*describe\(/i.test(f.patch || "") && /test|spec/i.test(f.filename),
    points: 12,
    finding: "Test deletions detected",
    recommendation: "Block merge unless equivalent tests are added"
  },
  {
    test: (f: ChangedFile) => (f.patch || "").split("\n").filter((l) => l.startsWith("+")).length > 250,
    points: 14,
    finding: "Large code additions in single file",
    recommendation: "Split PR or require senior reviewer"
  }
];

function countPatchDelta(patch?: string) {
  if (!patch) return { additions: 0, deletions: 0 };

  let additions = 0;
  let deletions = 0;
  for (const line of patch.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) additions += 1;
    if (line.startsWith("-")) deletions += 1;
  }

  return { additions, deletions };
}

export function evaluateRisk(files: ChangedFile[]): RiskResult {
  let score = 0;
  const findings = new Set<string>();
  const recommendations = new Set<string>();

  if (files.length > 0) {
    score += 5;
    findings.add("Code changes detected");
    recommendations.add("Ensure at least one reviewer validates intent and correctness");
  }

  if (files.length >= 3) {
    score += 6;
    findings.add("Multi-file change set");
    recommendations.add("Review cross-file interactions and integration impact");
  }

  let totalDelta = 0;

  for (const file of files) {
    const { additions, deletions } = countPatchDelta(file.patch);
    totalDelta += additions + deletions;

    for (const rule of RULES) {
      if (rule.test(file)) {
        score += rule.points;
        findings.add(rule.finding);
        recommendations.add(rule.recommendation);
      }
    }
  }

  if (totalDelta > 50) {
    score += 8;
    findings.add("Moderate code churn detected");
    recommendations.add("Increase review depth and run targeted regression tests");
  }

  if (totalDelta > 200) {
    score += 12;
    findings.add("High code churn detected");
    recommendations.add("Require senior reviewer sign-off before merge");
  }

  if (files.length > 25) {
    score += 10;
    findings.add("High file-count change set");
    recommendations.add("Break PR into smaller reviewable chunks");
  }

  score = Math.min(score, 100);
  const severity = score >= 80 ? "critical" : score >= 60 ? "high" : score >= 30 ? "medium" : "low";

  return {
    score,
    severity,
    findings: [...findings],
    recommendations: [...recommendations]
  };
}
