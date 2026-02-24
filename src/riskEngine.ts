export type ChangedFile = {
  filename: string;
  status?: string;
  patch?: string;
};

export type RiskResult = {
  score: number;
  severity: "low" | "medium" | "high" | "critical";
  findings: string[];
  recommendations: string[];
};

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

export function evaluateRisk(files: ChangedFile[]): RiskResult {
  let score = 0;
  const findings = new Set<string>();
  const recommendations = new Set<string>();

  for (const file of files) {
    for (const rule of RULES) {
      if (rule.test(file)) {
        score += rule.points;
        findings.add(rule.finding);
        recommendations.add(rule.recommendation);
      }
    }
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
