import "dotenv/config";
import express from "express";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateRisk } from "./riskEngine.js";
import {
  checkDbReady,
  createApiKey,
  findActiveApiKeyByToken,
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
app.disable("x-powered-by");

const IS_PROD = process.env.NODE_ENV === "production";
const ENFORCE_API_KEYS_IN_PROD = (process.env.ENFORCE_API_KEYS_IN_PROD ?? "true") === "true";
const ENFORCE_WEBHOOK_SECRET_IN_PROD = (process.env.ENFORCE_WEBHOOK_SECRET_IN_PROD ?? "true") === "true";
const ENABLE_HSTS = (process.env.ENABLE_HSTS ?? "true") === "true";
const TRUST_PROXY = process.env.TRUST_PROXY;

if (TRUST_PROXY !== undefined) {
  const normalized = TRUST_PROXY.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) app.set("trust proxy", true);
  else if (["0", "false", "no", "off"].includes(normalized)) app.set("trust proxy", false);
  else {
    const hops = Number(TRUST_PROXY);
    if (Number.isInteger(hops) && hops >= 0) app.set("trust proxy", hops);
    else app.set("trust proxy", TRUST_PROXY);
  }
}

// Lightweight in-memory limiter for public API routes.
const hits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX_PER_MIN ?? 120);
const RATE_LIMIT_MAX_KEYS = Number(process.env.RATE_LIMIT_MAX_KEYS ?? 10_000);
const RATE_LIMIT_CLEANUP_EVERY = Number(process.env.RATE_LIMIT_CLEANUP_EVERY ?? 100);
let rateLimitReqCounter = 0;

const ENABLE_SELF_SERVE_ONBOARDING = (process.env.ENABLE_SELF_SERVE_ONBOARDING ?? "false") === "true";
const ONBOARDING_ALLOWED_REPOS = new Set(
  (process.env.ONBOARDING_ALLOWED_REPOS ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
);
const ONBOARDING_KEY_TTL_DAYS = Number(process.env.ONBOARDING_KEY_TTL_DAYS ?? 30);
const ONBOARDING_MAX_ISSUES_PER_IP_PER_DAY = Number(process.env.ONBOARDING_MAX_ISSUES_PER_IP_PER_DAY ?? 3);
const onboardingIssuesByIp = new Map<string, { count: number; resetAt: number }>();

app.use((req, res, next) => {
  const requestId = crypto.randomUUID();
  res.setHeader("x-request-id", requestId);
  (req as express.Request & { requestId?: string }).requestId = requestId;
  next();
});

app.use((req, res, next) => {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader("x-xss-protection", "0");
  res.setHeader("x-permitted-cross-domain-policies", "none");
  res.setHeader("cross-origin-opener-policy", "same-origin");
  res.setHeader("cross-origin-resource-policy", "same-origin");
  res.setHeader("permissions-policy", "accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()");
  res.setHeader("content-security-policy", "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; form-action 'self'");

  const proto = req.header("x-forwarded-proto")?.split(",")[0]?.trim();
  const secure = req.secure || proto === "https";
  if (ENABLE_HSTS && secure) {
    res.setHeader("strict-transport-security", "max-age=31536000; includeSubDomains");
  }

  if (corsOrigins.length > 0) {
    const origin = req.header("origin");
    if (origin && corsOrigins.includes(origin)) {
      res.setHeader("access-control-allow-origin", origin);
      res.setHeader("vary", "origin");
      res.setHeader("access-control-allow-headers", "content-type, authorization, x-api-key");
      res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
    }
  }

  if (req.method === "OPTIONS") return res.status(204).end();
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
  rateLimitReqCounter += 1;
  if (rateLimitReqCounter % RATE_LIMIT_CLEANUP_EVERY === 0 || hits.size > RATE_LIMIT_MAX_KEYS) {
    pruneRateLimiter(now);
  }

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

type AnalyzePrLinkRequest = {
  url: string;
};

const MAX_FILES_PER_REQUEST = Number(process.env.MAX_FILES_PER_REQUEST ?? 500);
const MAX_FILENAME_LENGTH = Number(process.env.MAX_FILENAME_LENGTH ?? 300);
const MAX_PATCH_LENGTH = Number(process.env.MAX_PATCH_LENGTH ?? 200_000);
const REPO_NAME_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;
const OWNER_NAME_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

type ApiRole = "read" | "write";
type ApiKeyConfig = { key: string; role: ApiRole; repos?: string[] };

const apiKeys = (() => {
  const raw = process.env.API_KEYS_JSON;
  if (!raw) return [] as ApiKeyConfig[];
  try {
    const parsed = JSON.parse(raw) as ApiKeyConfig[];
    return parsed.filter((k) => k && typeof k.key === "string" && (k.role === "read" || k.role === "write"));
  } catch {
    return [] as ApiKeyConfig[];
  }
})();

if (IS_PROD && ENFORCE_API_KEYS_IN_PROD && apiKeys.length === 0) {
  throw new Error("Refusing to start in production without API_KEYS_JSON (set ENFORCE_API_KEYS_IN_PROD=false to override)");
}

if (IS_PROD && ENFORCE_WEBHOOK_SECRET_IN_PROD && !process.env.GITHUB_WEBHOOK_SECRET) {
  throw new Error("Refusing to start in production without GITHUB_WEBHOOK_SECRET (set ENFORCE_WEBHOOK_SECRET_IN_PROD=false to override)");
}

if (!IS_PROD && apiKeys.length === 0 && !process.env.GITHUB_WEBHOOK_SECRET) {
  console.warn("[security] API_KEYS_JSON and GITHUB_WEBHOOK_SECRET are both unset; /api and /webhook routes may be effectively open in this environment.");
}

const corsOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);

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

type AsyncRoute = (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<unknown>;

function asyncHandler(fn: AsyncRoute) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

function extractApiKey(req: express.Request) {
  const headerKey = req.header("x-api-key");
  if (headerKey) return headerKey;

  const auth = req.header("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();

  return undefined;
}

function secureTokenEqual(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function findEnvApiKeyConfig(token: string) {
  return apiKeys.find((k) => secureTokenEqual(k.key, token));
}

async function findAnyApiKeyConfig(token: string) {
  const envKey = findEnvApiKeyConfig(token);
  if (envKey) return envKey;
  const dbKey = await findActiveApiKeyByToken(token);
  return dbKey ? { role: dbKey.role, repos: dbKey.repos ?? [] } : null;
}

function pruneRateLimiter(now: number) {
  for (const [key, entry] of hits.entries()) {
    if (now > entry.resetAt) hits.delete(key);
  }

  if (hits.size <= RATE_LIMIT_MAX_KEYS) return;

  for (const key of hits.keys()) {
    hits.delete(key);
    if (hits.size <= RATE_LIMIT_MAX_KEYS) break;
  }
}

function canAccessRepo(config: ApiKeyConfig | { repos?: string[] | null }, repo?: string) {
  if (!config.repos || config.repos.length === 0 || config.repos.includes("*")) return true;
  if (!repo) return true;
  return config.repos.includes(repo);
}

function isRepoAllowedForOnboarding(repo: string) {
  if (ONBOARDING_ALLOWED_REPOS.size === 0) return true;
  return ONBOARDING_ALLOWED_REPOS.has(repo) || ONBOARDING_ALLOWED_REPOS.has("*");
}

function checkAndIncrementOnboardingLimit(ip: string) {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const entry = onboardingIssuesByIp.get(ip);

  if (!entry || now > entry.resetAt) {
    onboardingIssuesByIp.set(ip, { count: 1, resetAt: now + dayMs });
    return true;
  }

  if (entry.count >= ONBOARDING_MAX_ISSUES_PER_IP_PER_DAY) return false;
  entry.count += 1;
  return true;
}

function requireApiRole(role: ApiRole) {
  return asyncHandler(async (req, res, next) => {
    const hasConfiguredAuth = apiKeys.length > 0 || ENABLE_SELF_SERVE_ONBOARDING;
    if (!hasConfiguredAuth) return next();

    const token = extractApiKey(req);
    if (!token) return res.status(401).json({ error: "missing API key" });

    const key = await findAnyApiKeyConfig(token);
    if (!key) return res.status(401).json({ error: "invalid API key" });

    if (role === "write" && key.role !== "write") return res.status(403).json({ error: "write access required" });

    const repoFromBody = typeof (req.body as { repo?: unknown })?.repo === "string" ? (req.body as { repo: string }).repo : undefined;
    const repoFromQuery = typeof req.query.repo === "string" ? req.query.repo : undefined;
    const repo = repoFromBody ?? repoFromQuery;

    if (!canAccessRepo(key, repo)) return res.status(403).json({ error: "repo access denied" });

    return next();
  });
}

const requireWebhookAccess = asyncHandler(async (req, res, next) => {
  const secretConfigured = Boolean(process.env.GITHUB_WEBHOOK_SECRET);
  const hasApiAuth = apiKeys.length > 0 || ENABLE_SELF_SERVE_ONBOARDING;
  if (!secretConfigured && !hasApiAuth) return next();

  const token = extractApiKey(req);
  if (token) {
    const key = await findAnyApiKeyConfig(token);
    if (key?.role === "write") return next();
  }

  const rawBody = (req as express.Request & { rawBody?: Buffer }).rawBody;
  const sig = req.header("x-hub-signature-256") || undefined;
  if (secretConfigured && rawBody && validSignature(rawBody, sig)) return next();

  return res.status(401).json({ error: "webhook auth required" });
});

function validSignature(payload: Buffer, signatureHeader?: string) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return true;
  if (!signatureHeader) return false;

  const expected = `sha256=${crypto.createHmac("sha256", secret).update(payload).digest("hex")}`;
  const expectedBuf = Buffer.from(expected);
  const receivedBuf = Buffer.from(signatureHeader);
  if (expectedBuf.length !== receivedBuf.length) return false;

  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

function isValidFilename(filename: string) {
  if (filename.length === 0 || filename.length > MAX_FILENAME_LENGTH) return false;
  if (filename.includes("\\") || filename.includes("\0")) return false;
  if (filename.startsWith("/") || filename.startsWith("~")) return false;
  if (/\p{C}/u.test(filename)) return false;

  const segments = filename.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) return false;

  return true;
}

function validateAnalyzeRequest(body: AnalyzeRequest) {
  if (!body || typeof body !== "object") {
    return "invalid request body";
  }

  if (!body.repo || !body.prNumber || !Array.isArray(body.files) || body.files.length === 0) {
    return "repo, prNumber, and non-empty files are required";
  }

  if (!REPO_NAME_PATTERN.test(body.repo)) {
    return "repo must match [A-Za-z0-9._-] and be <= 100 chars";
  }

  if (!Number.isInteger(body.prNumber) || body.prNumber <= 0) {
    return "prNumber must be a positive integer";
  }

  if (body.owner !== undefined && (typeof body.owner !== "string" || !OWNER_NAME_PATTERN.test(body.owner))) {
    return "owner must match [A-Za-z0-9._-] and be <= 100 chars";
  }

  if (body.files.length > MAX_FILES_PER_REQUEST) {
    return `files exceeds max allowed (${MAX_FILES_PER_REQUEST})`;
  }

  for (const file of body.files) {
    if (typeof file.filename !== "string" || !isValidFilename(file.filename)) {
      return "each file must include a valid, safe filename";
    }

    if (file.patch !== undefined && (typeof file.patch !== "string" || file.patch.length > MAX_PATCH_LENGTH)) {
      return `patch must be a string <= ${MAX_PATCH_LENGTH} chars`;
    }
  }

  return null;
}

type WebhookPRContext = { action: "opened" | "synchronize" | "reopened"; owner: string; repo: string; prNumber: number };

type ParsedGithubPrUrl = { owner: string; repo: string; prNumber: number };

function parseGitHubPullRequestUrl(rawUrl: string): ParsedGithubPrUrl | null {
  const candidate = rawUrl.trim();
  if (!candidate) return null;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (host !== "github.com" && host !== "www.github.com") return null;

  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length < 4) return null;

  const [owner, repo, pullToken, prRaw] = segments;
  if (pullToken !== "pull") return null;
  if (!OWNER_NAME_PATTERN.test(owner) || !REPO_NAME_PATTERN.test(repo)) return null;
  const prNumber = Number(prRaw);
  if (!Number.isInteger(prNumber) || prNumber <= 0) return null;

  return { owner, repo, prNumber };
}

function parseAnalyzePrLinkRequest(body: unknown) {
  if (!body || typeof body !== "object") return { error: "invalid request body" as const };
  const url = typeof (body as AnalyzePrLinkRequest).url === "string" ? (body as AnalyzePrLinkRequest).url : "";
  const parsed = parseGitHubPullRequestUrl(url);
  if (!parsed) {
    return {
      error: "url must be a valid GitHub pull request link (https://github.com/<owner>/<repo>/pull/<number>)" as const
    };
  }

  return { parsed };
}

function parseWebhookPRContext(payload: unknown): WebhookPRContext | null {
  if (!payload || typeof payload !== "object") return null;

  const maybeAction = (payload as { action?: unknown }).action;
  const pr = (payload as { pull_request?: { number?: unknown } }).pull_request;
  const repository = (payload as { repository?: { name?: unknown; owner?: { login?: unknown } } }).repository;

  if (!["opened", "synchronize", "reopened"].includes(String(maybeAction ?? ""))) return null;

  const action = maybeAction as WebhookPRContext["action"];
  const prNumber = pr?.number;
  const repo = repository?.name;
  const owner = repository?.owner?.login;

  if (!Number.isInteger(prNumber) || typeof repo !== "string" || repo.length === 0 || typeof owner !== "string" || owner.length === 0) {
    return null;
  }

  return { action, owner, repo, prNumber: Number(prNumber) };
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
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/openapi.yaml", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "openapi.yaml"));
});

app.get("/docs/onboarding", (_req, res) => {
  res.redirect("https://github.com/emirsimsek00/ai-pr-risk-gate/blob/main/docs/ONBOARDING.md");
});

app.get("/health/live", (_req, res) => {
  res.json({ ok: true, service: "ai-pr-risk-gate", check: "live" });
});

app.get("/health/ready", asyncHandler(async (_req, res) => {
  const dbReady = await checkDbReady();
  if (!dbReady) return res.status(503).json({ ok: false, service: "ai-pr-risk-gate", check: "ready", db: "down" });
  return res.json({ ok: true, service: "ai-pr-risk-gate", check: "ready", db: "up" });
}));

app.get("/health", asyncHandler(async (_req, res) => {
  const dbReady = await checkDbReady();
  if (!dbReady) return res.status(503).json({ ok: false, service: "ai-pr-risk-gate", db: "down" });
  return res.json({ ok: true, service: "ai-pr-risk-gate", db: "up" });
}));

app.get("/api/trends", requireApiRole("read"), asyncHandler(async (req, res) => {
  const repo = typeof req.query.repo === "string" ? req.query.repo : undefined;
  const days = typeof req.query.days === "string" ? Number(req.query.days) : 30;
  const safeDays = Number.isFinite(days) && days > 0 ? Math.min(days, 365) : 30;
  const trends = await getRiskTrends(repo, safeDays);
  return res.json({ repo: repo ?? "all", days: safeDays, trends });
}));

app.get("/api/recent", requireApiRole("read"), asyncHandler(async (req, res) => {
  const repo = typeof req.query.repo === "string" ? req.query.repo : undefined;
  const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : 20;
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 100)) : 20;
  const rows = await getRecentAssessments(safeLimit, repo);
  return res.json({ limit: safeLimit, rows });
}));

app.get("/api/severity", requireApiRole("read"), asyncHandler(async (req, res) => {
  const repo = typeof req.query.repo === "string" ? req.query.repo : undefined;
  const days = typeof req.query.days === "string" ? Number(req.query.days) : 30;
  const safeDays = Number.isFinite(days) && days > 0 ? Math.min(days, 365) : 30;
  const rows = await getSeverityDistribution(safeDays, repo);
  return res.json({ repo: repo ?? "all", days: safeDays, rows });
}));

app.get("/api/findings", requireApiRole("read"), asyncHandler(async (req, res) => {
  const repo = typeof req.query.repo === "string" ? req.query.repo : undefined;
  const days = typeof req.query.days === "string" ? Number(req.query.days) : 30;
  const safeDays = Number.isFinite(days) && days > 0 ? Math.min(days, 365) : 30;
  const rows = await getTopFindings(safeDays, repo, 8);
  return res.json({ repo: repo ?? "all", days: safeDays, rows });
}));

app.post("/api/onboarding/issue-key", asyncHandler(async (req, res) => {
  if (!ENABLE_SELF_SERVE_ONBOARDING) {
    return res.status(404).json({ error: "self-serve onboarding is disabled" });
  }

  const repo = typeof (req.body as { repo?: unknown })?.repo === "string" ? (req.body as { repo: string }).repo.trim() : "";
  const ownerLabel = typeof (req.body as { ownerLabel?: unknown })?.ownerLabel === "string"
    ? (req.body as { ownerLabel: string }).ownerLabel.trim().slice(0, 120)
    : "self-serve";

  if (!repo || !REPO_NAME_PATTERN.test(repo)) {
    return res.status(400).json({ error: "repo is required and must match [A-Za-z0-9._-]" });
  }

  if (!isRepoAllowedForOnboarding(repo)) {
    return res.status(403).json({ error: "repo is not allowed for self-serve onboarding" });
  }

  const ip = req.ip || "unknown";
  if (!checkAndIncrementOnboardingLimit(ip)) {
    return res.status(429).json({ error: "daily onboarding key limit reached for this IP" });
  }

  const issued = await createApiKey({
    role: "write",
    repos: [repo],
    ownerLabel,
    expiresInDays: ONBOARDING_KEY_TTL_DAYS
  });

  logEvent("info", req, "self-serve key issued", { repo, ownerLabel, expiresAt: issued.key.expiresAt });

  return res.status(201).json({
    key: issued.token,
    role: issued.key.role,
    repos: issued.key.repos,
    expiresAt: issued.key.expiresAt,
    warning: "Store this key now. It will not be shown again."
  });
}));

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

app.post("/analyze", requireApiRole("write"), asyncHandler(analyzeHandler));
app.post("/api/analyze", requireApiRole("write"), asyncHandler(analyzeHandler));

app.post("/api/analyze/pr-link", requireApiRole("write"), asyncHandler(async (req, res) => {
  const parsedRequest = parseAnalyzePrLinkRequest(req.body);
  if ("error" in parsedRequest) {
    logEvent("error", req, "pr-link validation failed", { validationError: parsedRequest.error });
    return res.status(400).json({ error: parsedRequest.error });
  }

  const { owner, repo, prNumber } = parsedRequest.parsed;

  try {
    const files = await fetchPullRequestFiles({ owner, repo, prNumber, allowUnauthenticated: true });
    if (files.length === 0) {
      return res.status(422).json({ error: "pull request has no changed files to analyze" });
    }

    const { result, policy } = await runRiskAssessment({ repo, owner, prNumber, files });

    await postPRComment({
      owner,
      repo,
      prNumber,
      body: [
        formatComment(result.score, result.severity, result.findings, result.recommendations),
        `\n- **Policy gate:** ${policy.allowed ? "ALLOW ✅" : `BLOCK ❌ (${policy.reason})`}`
      ].join("\n")
    });

    logEvent("info", req, "pr-link analysis complete", {
      owner,
      repo,
      prNumber,
      score: result.score,
      severity: result.severity,
      policyAllowed: policy.allowed
    });

    return res.status(policy.allowed ? 200 : 409).json({
      ...result,
      policy,
      source: "pr-link",
      pr: { owner, repo, prNumber }
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    logEvent("error", req, "pr-link analysis failed", { owner, repo, prNumber, detail });

    if (detail.includes("GitHub API error 404")) {
      return res.status(404).json({ error: "pull request not found or not accessible" });
    }

    if (detail.includes("GitHub API error 403")) {
      return res.status(429).json({ error: "GitHub API rate limit reached; try again shortly" });
    }

    return res.status(502).json({ error: "failed to fetch pull request files", detail });
  }
}));

app.post("/webhook/github", requireWebhookAccess, asyncHandler(async (req, res) => {
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

    const eventName = req.header("x-github-event");
    if (eventName !== "pull_request") {
      return res.status(200).send("ignored");
    }

    const payload = JSON.parse(rawBody.toString("utf8"));
    const context = parseWebhookPRContext(payload);

    if (!context) {
      return res.status(200).send("ignored");
    }

    const { owner, repo, prNumber } = context;
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
}));

app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logEvent("error", req, "unhandled route error", {
    detail: err instanceof Error ? err.message : "unknown error"
  });

  return res.status(500).json({ error: "internal server error" });
});

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT || 8787);
  app.listen(port, () => console.log(`ai-pr-risk-gate listening on :${port}`));
}
