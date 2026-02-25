# Configuration Reference

## Core
- `PORT` (default: `8787`) — HTTP listen port.
- `DATABASE_URL` — Postgres connection string.
- `RISK_POLICIES_JSON` — repo policy thresholds.

## GitHub integration
- `GITHUB_TOKEN` — token for fetching PR files/posting comments.
- `GITHUB_WEBHOOK_SECRET` — webhook signature secret (`x-hub-signature-256`).

## API auth and access control
- `API_KEYS_JSON` — JSON array of API keys.
  - Example:
    ```json
    [
      {"key":"read-key","role":"read"},
      {"key":"write-key","role":"write"},
      {"key":"team-a-key","role":"write","repos":["repo-a"]}
    ]
    ```
- `CORS_ORIGINS` — comma-separated allowlist for browser origins.

## Request safety limits
- `MAX_FILES_PER_REQUEST` (default: `500`)
- `MAX_FILENAME_LENGTH` (default: `300`)
- `MAX_PATCH_LENGTH` (default: `200000`)
- `RATE_LIMIT_MAX_PER_MIN` (default: `120`)

## DB resilience
- `DB_QUERY_TIMEOUT_MS` (default: `3000`)
- `DB_QUERY_RETRY_ATTEMPTS` (default: `2`)
- `DB_QUERY_RETRY_BASE_MS` (default: `120`)

## HTTP resilience (GitHub calls)
- `HTTP_RETRY_ATTEMPTS` (default: `3`)
- `HTTP_RETRY_BASE_MS` (default: `150`)

## Recommended production baseline (cost-free)
- Enable API keys with separate read/write keys.
- Set `GITHUB_WEBHOOK_SECRET` for webhook mode.
- Restrict `CORS_ORIGINS` to known dashboard domains.
- Keep rate limits and payload limits enabled.
