# Threat Model (Lightweight)

## Assets
- PR metadata and diff patches
- Risk decisions/policy outcomes
- GitHub integration secrets and API keys
- Assessment history in Postgres

## Trust boundaries
1. Public HTTP boundary (`/api/*`, `/webhook/*`)
2. GitHub webhook boundary
3. Database boundary (`DATABASE_URL`)
4. Browser dashboard boundary (`CORS_ORIGINS`)

## Primary threats and mitigations

### 1) Unauthorized API usage
- **Threat:** attacker calls write endpoints.
- **Mitigations:** API key RBAC (`API_KEYS_JSON`), read/write split, optional repo scoping.

### 2) Webhook spoofing
- **Threat:** forged webhook payloads trigger false analyses/comments.
- **Mitigations:** `GITHUB_WEBHOOK_SECRET` signature verification; event-type filtering (`pull_request` only).

### 3) Input abuse / injection
- **Threat:** malformed filenames, oversized payloads, traversal-like inputs.
- **Mitigations:** strict request validation, safe filename checks, payload limits, JSON-only parsing.

### 4) Stored/Reflected XSS in dashboard
- **Threat:** untrusted findings/repo names rendered to UI.
- **Mitigations:** frontend output escaping before HTML insertion.

### 5) Resource exhaustion
- **Threat:** high request volume or slow downstream dependencies.
- **Mitigations:** in-memory rate limiting, query timeouts, retry backoff, liveness/readiness split.

### 6) Secrets exposure
- **Threat:** token leakage from logs or repo.
- **Mitigations:** env-only secrets, no hardcoded credentials, security policy + rotation guidance.

## Residual risk / next hardening
- Add persistent audit logs and anomaly alerting.
- Add key rotation endpoints and short-lived keys.
- Add optional mTLS or IP allowlisting for webhook ingress.
