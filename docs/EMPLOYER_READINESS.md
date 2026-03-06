# Employer Readiness Checklist (AI PR Risk Gate)

This checklist is for turning the project from "working" to "interview-ready and production-minded".

## 1) Verified technical baseline (done)
- Health endpoints return 200 and DB readiness is up.
- Self-serve onboarding endpoint works on allowlisted repos.
- Deny path works (`403` for non-allowlisted repo).
- CI test+coverage gate passes.
- Security headers are present in production responses.

## 2) What to keep as evidence in interviews
- CI badges (build, tests, smoke).
- Live deployment URL + dashboard URL.
- API contract (`openapi.yaml`) and Postman collection.
- Threat model + runbook docs.
- Changelog entries showing iterative delivery.

## 3) Boss actions (account-level, cannot be fully automated from code)
1. **Observability provider hookup**
   - Add `SENTRY_DSN` (or equivalent) in Render env.
   - Create one alert for 5xx spikes and one for service downtime.
2. **Render production alerts**
   - Enable notifications for deploy failures and health check failures.
3. **Secrets lifecycle**
   - Rotate API keys and GitHub webhook secret before final showcase.
   - Save rotation date in internal notes.
4. **Release proof**
   - Capture one successful CI run URL and one deployed release tag.

## 4) Suggested production-safe defaults
```env
ENABLE_SELF_SERVE_ONBOARDING=true
ONBOARDING_ALLOWED_REPOS=next.js,react,typescript,ai-pr-risk-gate
ONBOARDING_KEY_TTL_DAYS=14
ONBOARDING_MAX_ISSUES_PER_IP_PER_DAY=3
```

## 5) 15-minute demo script for employers
1. Show architecture diagram and explain the problem.
2. Show a PR payload hitting `/api/analyze` and returned risk score.
3. Show policy behavior (e.g., high/critical threshold gate).
4. Show onboarding issuance for an allowlisted repo.
5. Show trends/dashboard endpoint output and one security control (API keys + headers).

## 6) Final go/no-go rubric
- **Go now** if: CI green, smoke green, health green, docs linked, and one release tagged.
- **Hold** if any of: flaky tests, missing env controls, no observability alerts, or no rollback runbook.
