# AI PR Risk Gate (MVP)

Backend service that scores pull requests for operational/security risk before merge.

![Node](https://img.shields.io/badge/node-22+-green)
![TypeScript](https://img.shields.io/badge/typescript-5-blue)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

## Why this project
- Matches current employer pain: AI-assisted code ships fast, but quality/safety checks lag.
- Demonstrates backend + CI/CD + security thinking.
- Demo-ready in ~2 weeks with measurable impact.

## Architecture
- **GitHub Actions** collects PR changed files/patches.
- Action calls **`POST /analyze`** on Risk Gate service.
- **Risk Engine** applies heuristic rules and returns score + findings.
- Service optionally posts PR comment and stores result in **Postgres**.

## MVP features
- Risk score (0-100) from changed files + patch heuristics
- Severity levels: low / medium / high / critical
- Findings + recommendations
- Optional PR comment posting via GitHub API
- Assessment persistence to Postgres
- Demo UI at `/` for recruiter-friendly live walkthroughs

## Quick start (local)
```bash
npm install
cp .env.example .env
npm run dev
```

Health check:
```bash
curl http://localhost:8787/health
```

Open demo UI:
```bash
open http://localhost:8787/
```

## DB setup
Run `sql/init.sql` on your Postgres database.

## Analyze endpoint (current MVP path)
`POST /analyze`

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

## GitHub integration (MVP)
Workflow file: `.github/workflows/pr-risk-check.yml`

### Required GitHub secret
- `RISK_GATE_URL` = your deployed service base URL
  - Example: `https://ai-pr-risk-gate.onrender.com`

## Deploy on Render (one-click via repo)
This repo includes `render.yaml`.

1. In Render, create a **Blueprint** from this GitHub repo.
2. Set environment variables:
   - `DATABASE_URL`
   - `GITHUB_TOKEN` (fine-grained token with repo comment access)
   - `GITHUB_WEBHOOK_SECRET` (optional for webhook path)
3. Deploy.
4. Add `RISK_GATE_URL` in your target GitHub repository secrets.

## Suggested recruiter demo flow
1. Open a PR with auth/db/CI changes.
2. GitHub Action runs risk check.
3. PR shows score + findings comment.
4. If score >= 80, check fails and blocks merge.

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

## License
MIT
