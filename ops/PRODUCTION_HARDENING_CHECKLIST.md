# Production Hardening Checklist (AI PR Risk Gate)

Last completed: 2026-02-27
Owner: Eks

## 1) Identity, auth, and access control
- [x] **Fail-closed API authentication in production**
  - Implemented: app refuses startup in `NODE_ENV=production` if `API_KEYS_JSON` is missing (unless explicitly overridden).
  - Files: `src/index.ts`, `.env.example`, `docs/CONFIGURATION.md`
- [x] **Fail-closed webhook auth in production**
  - Implemented: app refuses startup in `NODE_ENV=production` if `GITHUB_WEBHOOK_SECRET` is missing (unless explicitly overridden).
  - Files: `src/index.ts`, `.env.example`, `docs/CONFIGURATION.md`
- [x] **RBAC maintained (`read` / `write`)**
  - Verified in existing integration tests.

## 2) Transport and browser security headers
- [x] **Server fingerprint reduction** (`x-powered-by` disabled)
- [x] **Hardening headers present**
  - `Content-Security-Policy`
  - `Permissions-Policy`
  - `Cross-Origin-Opener-Policy`
  - `Cross-Origin-Resource-Policy`
  - `X-Permitted-Cross-Domain-Policies`
  - Existing: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`
- [x] **HSTS on HTTPS** (`ENABLE_HSTS=true`)
- [x] **Proxy-aware TLS handling** (`TRUST_PROXY` supported)

## 3) Input safety and abuse controls
- [x] JSON body size limits enabled
- [x] Filename/path traversal validation in place
- [x] Patch length and file count limits in place
- [x] In-memory request rate limiting enabled

## 4) Dependency and supply-chain posture
- [x] `npm audit --audit-level=moderate` clean (0 vulnerabilities)
- [x] Upgraded test stack to remove vulnerable transitive tree
  - `vitest` -> `^4.0.18`
  - `@vitest/coverage-v8` -> `^4.0.18`

## 5) CI/CD gates
- [x] Build + tests + coverage gate in CI
- [x] PR risk check workflow in place
- [x] Post-deploy health gate workflow in place
- [ ] Add dependency review / CodeQL workflow (recommended next)

## 6) Deployment config hardening
- [x] Render blueprint includes required production env vars:
  - `API_KEYS_JSON` (secret)
  - `ENFORCE_API_KEYS_IN_PROD=true`
  - `ENFORCE_WEBHOOK_SECRET_IN_PROD=true`
  - `ENABLE_HSTS=true`
  - `TRUST_PROXY=true`
- [x] Documentation updated to reflect production defaults

## 7) Runtime verification (this pass)
- [x] `npm test` passing
- [x] `npm run build` passing
- [x] `npm audit --audit-level=moderate` passing

## 8) Operational follow-ups (recommended)
- [ ] Rotate API keys and webhook secret quarterly
- [ ] Add ingress/IP allowlist for `/webhook/github` at edge (if platform supports)
- [ ] Add centralized audit log sink and alerting
- [ ] Add periodic restore drill for DB backups

---

## Evidence commands used in this pass
```bash
npm test
npm run build
npm audit --audit-level=moderate
```
