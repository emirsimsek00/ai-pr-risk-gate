import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

export const db = connectionString
  ? new Pool({ connectionString })
  : null;

export async function saveAssessment(input: {
  repo: string;
  prNumber: number;
  score: number;
  severity: string;
  findings: string[];
}) {
  if (!db) return;
  await db.query(
    `insert into risk_assessments (repo, pr_number, score, severity, findings)
     values ($1,$2,$3,$4,$5::jsonb)`,
    [input.repo, input.prNumber, input.score, input.severity, JSON.stringify(input.findings)]
  );
}
