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

export async function getRecentAssessments(limit = 20, repo?: string) {
  if (!db) {
    return [] as Array<{
      id: number;
      repo: string;
      pr_number: number;
      score: number;
      severity: string;
      findings: unknown;
      created_at: string;
    }>;
  }

  const safeLimit = Math.max(1, Math.min(limit, 100));
  const params: Array<string | number> = [safeLimit];
  let where = "";
  if (repo) {
    params.push(repo);
    where = "where repo = $2";
  }

  const result = await db.query(
    `select id, repo, pr_number, score, severity, findings, created_at
     from risk_assessments
     ${where}
     order by created_at desc
     limit $1`,
    params
  );

  return result.rows as Array<{
    id: number;
    repo: string;
    pr_number: number;
    score: number;
    severity: string;
    findings: unknown;
    created_at: string;
  }>;
}

export async function getSeverityDistribution(days = 30, repo?: string) {
  if (!db) return [] as Array<{ severity: string; count: number }>;
  const params: Array<string | number> = [days];
  let where = `where created_at >= now() - ($1::text || ' days')::interval`;
  if (repo) {
    params.push(repo);
    where += ` and repo = $2`;
  }

  const result = await db.query(
    `select severity, count(*)::int as count
     from risk_assessments
     ${where}
     group by severity
     order by count(*) desc`,
    params
  );

  return result.rows as Array<{ severity: string; count: number }>;
}

export async function getTopFindings(days = 30, repo?: string, limit = 8) {
  if (!db) return [] as Array<{ finding: string; count: number }>;
  const safeLimit = Math.max(1, Math.min(limit, 20));
  const params: Array<string | number> = [days];
  let where = `where ra.created_at >= now() - ($1::text || ' days')::interval`;
  if (repo) {
    params.push(repo);
    where += ` and ra.repo = $2`;
  }
  params.push(safeLimit);

  const limitPos = params.length;
  const result = await db.query(
    `select finding, count(*)::int as count
     from risk_assessments ra,
          jsonb_array_elements_text(ra.findings) as finding
     ${where}
     group by finding
     order by count(*) desc
     limit $${limitPos}`,
    params
  );

  return result.rows as Array<{ finding: string; count: number }>;
}
