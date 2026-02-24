# Changelog

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
