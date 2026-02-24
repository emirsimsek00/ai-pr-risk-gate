# AI PR Risk Gate (MVP)

Backend service that scores pull requests for operational/security risk before merge.

## Why this project
- Matches current employer pain: AI-assisted code shipping too fast without guardrails.
- Shows backend + CI/CD + security thinking.
- Designed for internship-ready demos in ~2 weeks.

## MVP features
- Risk score (0-100) from changed files + patch heuristics
- Severity levels: low / medium / high / critical
- Findings + recommendations
- Optional PR comment posting via GitHub API
- Assessment persistence to Postgres

## Quick start
```bash
npm install
cp .env.example .env
npm run dev
```

Health check:
```bash
curl http://localhost:8787/health
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
For fast delivery, have GitHub Actions collect changed files and call `/analyze`.
A starter workflow is included at `.github/workflows/pr-risk-check.yml`.

## Next steps (v2)
- Pull live PR file patches directly from GitHub API (no CI payload needed)
- Add semantic policy checks (secrets, PII, unsafe SQL)
- Add threshold-based merge gate output for required checks
- Add trend dashboard (risk over time by repo/team)
