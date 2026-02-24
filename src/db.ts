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

export async function getRiskTrends(repo?: string, days = 30) {
  if (!db) return [] as Array<{ day: string; avgScore: number; count: number }>;

  const params: Array<string | number> = [days];
  let where = `where created_at >= now() - ($1::text || ' days')::interval`;

  if (repo) {
    params.push(repo);
    where += ` and repo = $2`;
  }

  const query = `
    select
      to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day,
      round(avg(score)::numeric, 2) as "avgScore",
      count(*)::int as count
    from risk_assessments
    ${where}
    group by 1
    order by 1 asc
  `;

  const result = await db.query(query, params);
  return result.rows as Array<{ day: string; avgScore: number; count: number }>;
}
