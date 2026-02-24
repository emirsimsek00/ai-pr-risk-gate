import "dotenv/config";
import express from "express";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateRisk } from "./riskEngine.js";
import {
  getRecentAssessments,
  getRiskTrends,
  getSeverityDistribution,
  getTopFindings,
  saveAssessment
} from "./db.js";
import { formatComment, postPRComment } from "./github.js";
import { fetchPullRequestFiles } from "./githubApi.js";
import { evaluatePolicy } from "./policy.js";
import type { ChangedFile } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "..", "public");

export const app = express();

// Lightweight in-memory limiter for public API routes.
const hits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX_PER_MIN ?? 120);

app.use((req, res, next) => {
  const requestId = crypto.randomUUID();
  res.setHeader("x-request-id", requestId);
  (req as express.Request & { requestId?: string }).requestId = requestId;
  next();
});

app.use(express.json({
  limit: "2mb",
  verify: (req, _res, buf) => {
    (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
  }
}));
app.use(express.static(publicDir));

app.use((req, res, next) => {
  if (!req.path.startsWith("/api") && req.path !== "/analyze") return next();

  const key = req.ip || "unknown";
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }

  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX) {
    return res.status(429).json({ error: "rate limit exceeded" });
  }

  return next();
});

type AnalyzeRequest = {
  repo: string;
  owner?: string;
  prNumber: number;
  files: ChangedFile[];
};

function logEvent(level: "info" | "error", req: express.Request, message: string, extra?: Record<string, unknown>) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    requestId: (req as express.Request & { requestId?: string }).requestId,
    method: req.method,
    path: req.path,
    message,
    ...extra
  };

  if (level === "error") {
    console.error(JSON.stringify(payload));
    return;
  }

  console.log(JSON.stringify(payload));
}

function validSignature(payload: Buffer, signatureHeader?: string) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return true;
  if (!signatureHeader) return false;

  const expected = `sha256=${crypto.createHmac("sha256", secret).update(payload).digest("hex")}`;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
}

function validateAnalyzeRequest(body: AnalyzeRequest) {
  if (!body.repo || !body.prNumber || !Array.isArray(body.files)) {
    return "repo, prNumber, and files are required";
  }

  if (body.files.some((file) => typeof file.filename !== "string" || file.filename.length === 0)) {
    return "each file must include a non-empty filename";
  }

  return null;
}

async function runRiskAssessment(input: AnalyzeRequest) {
  const result = evaluateRisk(input.files);
  const policy = evaluatePolicy(input.repo, result.severity);

  await saveAssessment({
    repo: input.repo,
    prNumber: input.prNumber,
    score: result.score,
    severity: result.severity,
    findings: result.findings
  });

  return { result, policy };
}

app.get("/", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/dashboard", (_req, res) => {
  res.sendFile(path.join(publicDir, "dashboard.html"));
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "ai-pr-risk-gate" });
});

app.get("/api/trends", async (req, res) => {
  const repo = typeof req.query.repo === "string" ? req.query.repo : undefined;
  const days = typeof req.query.days === "string" ? Number(req.query.days) : 30;
  const safeDays = Number.isFinite(days) && days > 0 ? Math.min(days, 365) : 30;
  const trends = await getRiskTrends(repo, safeDays);
  return res.json({ repo: repo ?? "all", days: safeDays, trends });
});

app.get("/api/recent", async (req, res) => {
  const repo = typeof req.query.repo === "string" ? req.query.repo : undefined;
  const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : 20;
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 100)) : 20;
  const rows = await getRecentAssessments(safeLimit, repo);
  return res.json({ limit: safeLimit, rows });
});

app.get("/api/severity", async (req, res) => {
  const repo = typeof req.query.repo === "string" ? req.query.repo : undefined;
  const days = typeof req.query.days === "string" ? Number(req.query.days) : 30;
  const safeDays = Number.isFinite(days) && days > 0 ? Math.min(days, 365) : 30;
  const rows = await getSeverityDistribution(safeDays, repo);
  return res.json({ repo: repo ?? "all", days: safeDays, rows });
});

app.get("/api/findings", async (req, res) => {
  const repo = typeof req.query.repo === "string" ? req.query.repo : undefined;
  const days = typeof req.query.days === "string" ? Number(req.query.days) : 30;
  const safeDays = Number.isFinite(days) && days > 0 ? Math.min(days, 365) : 30;
  const rows = await getTopFindings(safeDays, repo, 8);
  return res.json({ repo: repo ?? "all", days: safeDays, rows });
});

const analyzeHandler = async (req: express.Request, res: express.Response) => {
  const payload = req.body as AnalyzeRequest;
  const validationError = validateAnalyzeRequest(payload);

  if (validationError) {
    logEvent("error", req, "analyze validation failed", { validationError });
    return res.status(400).json({ error: validationError });
  }

  const { repo, owner, prNumber } = payload;
  const { result, policy } = await runRiskAssessment(payload);

  if (owner) {
    const body = [
      formatComment(result.score, result.severity, result.findings, result.recommendations),
      `\n- **Policy gate:** ${policy.allowed ? "ALLOW ✅" : `BLOCK ❌ (${policy.reason})`}`
    ].join("\n");

    await postPRComment({ owner, repo, prNumber, body });
  }

  logEvent("info", req, "analysis complete", {
    repo,
    prNumber,
    score: result.score,
    severity: result.severity,
    policyAllowed: policy.allowed
  });

  return res.status(policy.allowed ? 200 : 409).json({ ...result, policy });
};

app.post("/analyze", analyzeHandler);
app.post("/api/analyze", analyzeHandler);

app.post("/webhook/github", async (req, res) => {
  try {
    const rawBody = (req as express.Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody) {
      return res.status(400).json({ error: "missing raw webhook payload" });
    }

    const sig = req.header("x-hub-signature-256") || undefined;
    if (!validSignature(rawBody, sig)) {
      logEvent("error", req, "invalid webhook signature");
      return res.status(401).send("invalid signature");
    }

    const payload = JSON.parse(rawBody.toString("utf8"));
    const action = payload?.action as string | undefined;
    const prNumber = payload?.pull_request?.number as number | undefined;
    const repo = payload?.repository?.name as string | undefined;
    const owner = payload?.repository?.owner?.login as string | undefined;

    if (!prNumber || !repo || !owner || !["opened", "synchronize", "reopened"].includes(action ?? "")) {
      return res.status(200).send("ignored");
    }

    const files = await fetchPullRequestFiles({ owner, repo, prNumber });
    const { result, policy } = await runRiskAssessment({ repo, owner, prNumber, files });

    const body = [
      formatComment(result.score, result.severity, result.findings, result.recommendations),
      `\n- **Policy gate:** ${policy.allowed ? "ALLOW ✅" : `BLOCK ❌ (${policy.reason})`}`
    ].join("\n");

    await postPRComment({ owner, repo, prNumber, body });
    logEvent("info", req, "webhook analysis complete", {
      repo,
      prNumber,
      score: result.score,
      severity: result.severity,
      policyAllowed: policy.allowed
    });

    return res.status(policy.allowed ? 202 : 409).json({ ...result, policy, source: "webhook" });
  } catch (error) {
    logEvent("error", req, "webhook processing failed", {
      detail: error instanceof Error ? error.message : "unknown error"
    });
    return res.status(500).json({
      error: "webhook processing failed",
      detail: error instanceof Error ? error.message : "unknown error"
    });
  }
});

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT || 8787);
  app.listen(port, () => console.log(`ai-pr-risk-gate listening on :${port}`));
}
