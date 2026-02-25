import { Pool, type QueryResult } from "pg";

const connectionString = process.env.DATABASE_URL;
const DB_QUERY_TIMEOUT_MS = Number(process.env.DB_QUERY_TIMEOUT_MS ?? 3000);
const DB_QUERY_RETRY_ATTEMPTS = Number(process.env.DB_QUERY_RETRY_ATTEMPTS ?? 2);
const DB_QUERY_RETRY_BASE_MS = Number(process.env.DB_QUERY_RETRY_BASE_MS ?? 120);

export const db = connectionString
  ? new Pool({ connectionString })
  : null;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetriableDbError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const code = (error as Error & { code?: string }).code;
  if (!code) return false;
  return ["40001", "40P01", "53300", "08000", "08003", "08006"].includes(code);
}

async function queryWithTimeout(query: string, params: Array<string | number>): Promise<QueryResult> {
  if (!db) throw new Error("database is not configured");

  let lastError: unknown;

  for (let attempt = 1; attempt <= DB_QUERY_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const timeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`db query timeout after ${DB_QUERY_TIMEOUT_MS}ms`)), DB_QUERY_TIMEOUT_MS);
      });

      return await Promise.race([
        db.query(query, params),
        timeout
      ]) as QueryResult;
    } catch (error) {
      lastError = error;
      if (!isRetriableDbError(error) || attempt === DB_QUERY_RETRY_ATTEMPTS) {
        throw error;
      }
      await sleep(DB_QUERY_RETRY_BASE_MS * 2 ** (attempt - 1));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("db query failed");
}

export async function saveAssessment(input: {
  repo: string;
  prNumber: number;
  score: number;
  severity: string;
  findings: string[];
}) {
  if (!db) return;
  await queryWithTimeout(
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

  try {
    const result = await queryWithTimeout(query, params);
    return result.rows as Array<{ day: string; avgScore: number; count: number }>;
  } catch {
    return [] as Array<{ day: string; avgScore: number; count: number }>;
  }
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

  try {
    const result = await queryWithTimeout(
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
  } catch {
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
}

export async function getSeverityDistribution(days = 30, repo?: string) {
  if (!db) return [] as Array<{ severity: string; count: number }>;
  const params: Array<string | number> = [days];
  let where = `where created_at >= now() - ($1::text || ' days')::interval`;
  if (repo) {
    params.push(repo);
    where += ` and repo = $2`;
  }

  try {
    const result = await queryWithTimeout(
      `select severity, count(*)::int as count
       from risk_assessments
       ${where}
       group by severity
       order by count(*) desc`,
      params
    );

    return result.rows as Array<{ severity: string; count: number }>;
  } catch {
    return [] as Array<{ severity: string; count: number }>;
  }
}

export async function checkDbReady() {
  if (!db) return true;
  try {
    await queryWithTimeout("select 1", []);
    return true;
  } catch {
    return false;
  }
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
  try {
    const result = await queryWithTimeout(
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
  } catch {
    return [] as Array<{ finding: string; count: number }>;
  }
}
