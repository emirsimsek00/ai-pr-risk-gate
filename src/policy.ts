import type { PolicyConfig, PolicyDecision, RiskSeverity } from "./types.js";

const severityRank: Record<RiskSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

const defaultPolicies: PolicyConfig[] = [
  {
    repo: "*",
    blockAtOrAbove: "critical"
  }
];

function resolvePolicies(): PolicyConfig[] {
  // Optional JSON config (single source for repo-specific thresholds).
  // Example:
  // RISK_POLICIES_JSON='[{"repo":"ai-pr-risk-gate","blockAtOrAbove":"high"}]'
  const raw = process.env.RISK_POLICIES_JSON;
  if (!raw) return defaultPolicies;

  try {
    const parsed = JSON.parse(raw) as PolicyConfig[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : defaultPolicies;
  } catch {
    return defaultPolicies;
  }
}

function pickPolicy(repo: string): PolicyConfig {
  const policies = resolvePolicies();
  return policies.find((p) => p.repo === repo) ?? policies.find((p) => p.repo === "*") ?? defaultPolicies[0];
}

export function evaluatePolicy(repo: string, severity: RiskSeverity): PolicyDecision {
  const policy = pickPolicy(repo);
  const blocked = severityRank[severity] >= severityRank[policy.blockAtOrAbove];

  if (blocked) {
    return {
      allowed: false,
      reason: `Blocked by policy: severity ${severity.toUpperCase()} >= ${policy.blockAtOrAbove.toUpperCase()} threshold`
    };
  }

  return { allowed: true };
}
