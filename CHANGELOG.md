# Changelog

## [1.1.0] - 2026-02-24
### Added
- Sprint 3 production-positioning assets:
  - E2E smoke workflow (`.github/workflows/e2e-smoke.yml`)
  - Local/CI smoke script (`ops/smoke-e2e.sh`)
  - Configuration reference (`docs/CONFIGURATION.md`)
  - Threat model (`docs/THREAT-MODEL.md`)
- README workflow badges and documentation index updates.

### Changed
- Project ops baseline now includes automated smoke validation in CI.

## [1.0.0] - 2026-02-24
### Added
- End-to-end PR risk scoring service with policy gating.
- GitHub webhook ingestion with signature verification and PR file fetch.
- Dashboard UI with trend, severity, findings, and recent assessments.
- Analytics APIs: `/api/trends`, `/api/recent`, `/api/severity`, `/api/findings`.
- Structured request logging and API rate limiting.
- Unit + integration tests and CI coverage gate.
- OpenAPI spec, Postman collection, architecture and runbook docs.

### Operational
- Autonomous health-check/recovery workflow integrated with OpenClaw cron.

### Notes
- Initial stable release for portfolio and production-style demonstration.
