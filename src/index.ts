import "dotenv/config";
import express from "express";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateRisk, type ChangedFile } from "./riskEngine.js";
import { saveAssessment } from "./db.js";
import { formatComment, postPRComment } from "./github.js";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "..", "public");

// Keep payload limits explicit for predictable behavior in CI/webhook calls.
app.use(express.json({ limit: "2mb" }));
app.use(express.static(publicDir));

type AnalyzeRequest = {
  repo: string;
  owner?: string;
  prNumber: number;
  files: ChangedFile[];
};

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

// Human-friendly root page for demos/recruiters.
app.get("/", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "ai-pr-risk-gate" });
});

const analyzeHandler = async (req: express.Request, res: express.Response) => {
  const payload = req.body as AnalyzeRequest;
  const validationError = validateAnalyzeRequest(payload);

  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const { repo, owner, prNumber, files } = payload;
  const result = evaluateRisk(files);

  await saveAssessment({
    repo,
    prNumber,
    score: result.score,
    severity: result.severity,
    findings: result.findings
  });

  // Optional PR comment posting is intentionally best-effort.
  if (owner) {
    const body = formatComment(result.score, result.severity, result.findings, result.recommendations);
    await postPRComment({ owner, repo, prNumber, body });
  }

  return res.json(result);
};

app.post("/analyze", analyzeHandler);
app.post("/api/analyze", analyzeHandler);

// GitHub webhook skeleton (v1): validates signature and accepts relevant PR events.
app.post("/webhook/github", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.header("x-hub-signature-256") || undefined;
  if (!validSignature(req.body as Buffer, sig)) {
    return res.status(401).send("invalid signature");
  }

  const payload = JSON.parse((req.body as Buffer).toString("utf8"));
  const action = payload?.action;
  const prNumber = payload?.pull_request?.number;
  const repo = payload?.repository?.name;

  if (!prNumber || !repo || !["opened", "synchronize", "reopened"].includes(action)) {
    return res.status(200).send("ignored");
  }

  return res.status(202).send("received; use /analyze endpoint with changed files payload from CI for MVP");
});

const port = Number(process.env.PORT || 8787);
app.listen(port, () => console.log(`ai-pr-risk-gate listening on :${port}`));
