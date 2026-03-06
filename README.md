# AI PR Risk Gate

Backend service that scores pull requests for operational/security risk before merge.

![Node](https://img.shields.io/badge/node-22+-green)
![TypeScript](https://img.shields.io/badge/typescript-5-blue)
![License](https://img.shields.io/badge/license-MIT-lightgrey)
![CI](https://github.com/emirsimsek00/ai-pr-risk-gate/actions/workflows/ci.yml/badge.svg)
![E2E Smoke](https://github.com/emirsimsek00/ai-pr-risk-gate/actions/workflows/e2e-smoke.yml/badge.svg)
![Release Health Gate](https://github.com/emirsimsek00/ai-pr-risk-gate/actions/workflows/release-health-gate.yml/badge.svg)

## Why this project
- Matches current employer pain: AI-assisted code ships fast, but quality/safety checks lag.
- Demonstrates backend + CI/CD + security thinking.
- Demo-ready in ~2 weeks with measurable impact.

## Architecture
- **GitHub Actions** (or GitHub webhook) triggers analysis.
- Service ingests PR files (from CI payload or GitHub API webhook fetch).
- **Risk Engine** applies heuristic rules and returns score + findings.
- **Policy Engine** applies per-repo severity thresholds.
- Service optionally posts PR comment and stores result in **Postgres**.

## MVP features
- Risk score (0-100) from changed files + patch heuristics
- PR URL ingestion endpoint (`POST /api/analyze/pr-link`) for user-friendly one-link analysis
- Severity levels: low / medium / high / critical
- Findings + recommendations
- Optional PR comment posting via GitHub API
- Assessment persistence to Postgres
- Demo UI at `/` for recruiter-friendly live walkthroughs
- Professional metrics dashboard at `/dashboard` (repo filter + trend visuals)
- Structured JSON request logging with request IDs
- In-memory API rate limiting guardrails
- Optional self-serve onboarding endpoint for scoped write-key issuance (`/api/onboarding/issue-key`)

## Live links
- Live service: https://ai-pr-risk-gate.onrender.com
- Dashboard: https://ai-pr-risk-gate.onrender.com/dashboard
- Latest release: https://github.com/emirsimsek00/ai-pr-risk-gate/releases/latest

## Quick start (local)
```bash
npm install
cp .env.example .env
npm run dev
```

Health checks:
```bash
curl http://localhost:8787/health/live
curl http://localhost:8787/health/ready
curl http://localhost:8787/health
```

Open demo UI:
```bash
open http://localhost:8787/
```

## Authentication & CORS (Sprint 1)
In local/dev, API keys are optional by default.
In production (`NODE_ENV=production`), startup now fails closed unless keys are configured.

Enable role-based API keys:
```bash
API_KEYS_JSON='[{"key":"read-key","role":"read"},{"key":"write-key","role":"write"}]'
```

Production safety defaults:
```bash
ENFORCE_API_KEYS_IN_PROD=true
ENFORCE_WEBHOOK_SECRET_IN_PROD=true
ENABLE_HSTS=true
TRUST_PROXY=true
```

Use either header:
- `x-api-key: <key>`
- `Authorization: Bearer <key>`

Role behavior:
- `read` key: `GET /api/*`
- `write` key: analyze + webhook endpoints

Optional repo scoping:
```bash
API_KEYS_JSON='[{"key":"team-a-write","role":"write","repos":["repo-a"]}]'
```

Optional CORS allowlist:
```bash
CORS_ORIGINS='https://example.com,https://dashboard.example.com'
```

## DB setup
Run migrations:
```bash
npm run migrate
```

Legacy bootstrap SQL still exists at `sql/init.sql`.

## Docker (free self-host setup)
```bash
docker compose up --build
```

This starts:
- app on `http://localhost:8787`
- postgres on `localhost:5432`

## Analyze endpoints
- `POST /analyze` (alias: `POST /api/analyze`) for direct payload analysis
- `POST /api/analyze/pr-link` for GitHub PR URL ingestion

```json
{
  "owner": "your-org",
  "repo": "your-repo",
  "prNumber": 123,
  "files": [
    {
      "filename": "src/auth/jwt.ts",
      "patch": "+ const token = sign(payload, secret)"
    }
  ]
}
```

Response:
```json
{
  "score": 38,
  "severity": "medium",
  "findings": ["Authentication/authorization-related code changed"],
  "recommendations": ["Require security review and add auth regression tests"]
}
```

PR URL ingestion example:
```bash
curl -X POST https://ai-pr-risk-gate.onrender.com/api/analyze/pr-link \
  -H "content-type: application/json" \
  -H "x-api-key: <write-key>" \
  -d '{"url":"https://github.com/vercel/next.js/pull/123"}'
```

## GitHub integration
Workflows:
- `.github/workflows/pr-risk-check.yml` (risk scoring on PR changes)
- `.github/workflows/ci.yml` (build + tests)

Webhook endpoint:
- `POST /webhook/github` (supports `opened`, `synchronize`, `reopened` PR events)
- Requires `GITHUB_TOKEN` + `GITHUB_WEBHOOK_SECRET`

### Required GitHub secret
- `RISK_GATE_URL` = your deployed service base URL
  - Example: `https://ai-pr-risk-gate.onrender.com`

## Deploy on Render (one-click via repo)
This repo includes `render.yaml`.

1. In Render, create a **Blueprint** from this GitHub repo.
2. Set environment variables:
   - `DATABASE_URL`
   - `GITHUB_TOKEN` (fine-grained token with repo comment access)
   - `GITHUB_WEBHOOK_SECRET` (recommended for webhook path)
   - `API_KEYS_JSON` (required in production when `ENFORCE_API_KEYS_IN_PROD=true`)
3. Deploy.
4. Add `RISK_GATE_URL` in your target GitHub repository secrets.

Minimal production env example:
```bash
NODE_ENV=production
ENFORCE_API_KEYS_IN_PROD=true
ENFORCE_WEBHOOK_SECRET_IN_PROD=true
ENABLE_HSTS=true
TRUST_PROXY=true
```

## Suggested recruiter demo flow
1. Open a PR with auth/db/CI changes.
2. GitHub Action runs risk check.
3. PR shows score + findings comment.
4. If score >= 80, check fails and blocks merge.

## Policy thresholds (repo-level)
Default behavior blocks only `critical` severity.

Override with env var:
```bash
RISK_POLICIES_JSON='[{"repo":"ai-pr-risk-gate","blockAtOrAbove":"high"},{"repo":"*","blockAtOrAbove":"critical"}]'
```

## Analytics endpoints
- `GET /api/trends?repo=<name>&days=30` → daily average risk score + volume
- `GET /api/recent?repo=<name>&limit=20` → recent assessment records
- `GET /api/severity?repo=<name>&days=30` → severity distribution
- `GET /api/findings?repo=<name>&days=30` → top recurring findings

## Autonomous operations toolkit
Scripts in `ops/`:
- `ops/healthcheck.sh` — verifies `/`, `/health`, and analyze smoke test
- `ops/recover-openclaw.sh` — quick gateway sanity check + restart fallback

Examples:
```bash
./ops/healthcheck.sh https://ai-pr-risk-gate.onrender.com
./ops/recover-openclaw.sh
```

## Next steps (v2)
- Pull live PR file patches directly from GitHub API (no CI payload needed)
- Add semantic policy checks (secrets, PII, unsafe SQL)
- Add threshold policies per repo/team
- Add trend dashboard (risk over time by repo/team)

## Documentation
- Diagram + request flow: `docs/ARCHITECTURE.md`
- Threat model: `docs/THREAT-MODEL.md`
- Employer readiness checklist: `docs/EMPLOYER_READINESS.md`

## Configuration
- Full env/config reference: `docs/CONFIGURATION.md`

## API contract and tooling
- OpenAPI spec: `openapi.yaml`
- Postman collection: `postman_collection.json`

## Operations
- Onboarding guide: `docs/ONBOARDING.md`
- Runbook: `docs/RUNBOOK.md`
- Backup/restore: `docs/BACKUP-RESTORE.md`
- Security policy: `SECURITY.md`
- Release notes: `CHANGELOG.md`

## Resume-ready bullets
- Built an AI PR Risk Gate service (Node.js/TypeScript/Postgres) that scores pull request risk and enforces configurable policy thresholds before merge.
- Implemented webhook + CI ingestion paths, structured request logging, and analytics endpoints powering a professional dashboard for risk trends and recurring findings.
- Added CI quality gates with automated tests and coverage thresholds to improve release safety and maintainability.

## License
MIT
