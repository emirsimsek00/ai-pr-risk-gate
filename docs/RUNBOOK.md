# Production Runbook

## 1) Service ownership
- Service: AI PR Risk Gate
- Runtime: Node.js 22 + Express + Postgres
- Primary URL: `https://ai-pr-risk-gate.onrender.com`

## 2) SLOs
- Availability target: 99.5% monthly
- P95 API latency target: < 800ms for analytics, < 2s for analyze

## 3) Deploy procedure
1. Merge to `main`
2. Confirm CI green (build + tests + coverage)
3. Verify Render deployed latest commit
4. Smoke test:
   - `GET /health`
   - `GET /dashboard`
   - `POST /api/analyze`

## 4) Rollback procedure
1. In Render, rollback to previous healthy deploy
2. Validate `/health` and `/api/analyze`
3. Announce rollback + incident summary

## 5) Incident triage
- Symptoms:
  - 5xx spikes
  - webhook failures
  - DB query timeouts
- Steps:
  1. Check recent logs for request IDs and failing routes
  2. Validate DB connectivity (`DATABASE_URL`)
  3. Validate `GITHUB_TOKEN` and webhook secret
  4. Run `ops/healthcheck.sh`
  5. If degraded, rollback

## 6) Security operations
- Rotate `GITHUB_TOKEN` quarterly or on suspicion
- Rotate `GITHUB_WEBHOOK_SECRET` quarterly
- Keep API rate limit enabled (`RATE_LIMIT_MAX_PER_MIN`)

## 7) Capacity guidance
- If rate-limits trigger often: increase limit gradually and profile top clients
- If analytics queries slow: add DB indexes and retention policy

## 8) Verification checklist (release)
- [ ] CI passes
- [ ] Deployment healthy
- [ ] Dashboard loads
- [ ] Webhook signature validation tested
- [ ] Policy gate behavior validated (allow + block)
