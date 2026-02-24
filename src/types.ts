export type ChangedFile = {
  filename: string;
  status?: string;
  patch?: string;
};

export type RiskSeverity = "low" | "medium" | "high" | "critical";

export type RiskResult = {
  score: number;
  severity: RiskSeverity;
  findings: string[];
  recommendations: string[];
};

export type PolicyDecision = {
  allowed: boolean;
  reason?: string;
};

export type PolicyConfig = {
  repo: string;
  blockAtOrAbove: RiskSeverity;
};
