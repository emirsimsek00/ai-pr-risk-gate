import "dotenv/config";
import express from "express";
import crypto from "node:crypto";
import { evaluateRisk, type ChangedFile } from "./riskEngine.js";
import { saveAssessment } from "./db.js";
import { formatComment, postPRComment } from "./github.js";

const app = express();
app.use(express.json({ limit: "2mb" }));

function validSignature(payload: Buffer, signatureHeader?: string) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return true;
  if (!signatureHeader) return false;
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(payload).digest("hex")}`;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
}

app.get("/", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "ai-pr-risk-gate",
    message: "Service is running",
    endpoints: {
      health: "GET /health",
      analyze: "POST /analyze",
      githubWebhook: "POST /webhook/github"
    }
  });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "ai-pr-risk-gate" });
});

app.post("/analyze", async (req, res) => {
  const { repo, owner, prNumber, files } = req.body as {
    repo: string;
    owner?: string;
    prNumber: number;
    files: ChangedFile[];
  };

  if (!repo || !prNumber || !Array.isArray(files)) {
    return res.status(400).json({ error: "repo, prNumber, and files are required" });
  }

  const result = evaluateRisk(files);
  await saveAssessment({ repo, prNumber, score: result.score, severity: result.severity, findings: result.findings });

  if (owner) {
    const body = formatComment(result.score, result.severity, result.findings, result.recommendations);
    await postPRComment({ owner, repo, prNumber, body });
  }

  return res.json(result);
});

// GitHub webhook skeleton (for later direct diff fetch)
app.post("/webhook/github", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.header("x-hub-signature-256") || undefined;
  if (!validSignature(req.body as Buffer, sig)) return res.status(401).send("invalid signature");

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
