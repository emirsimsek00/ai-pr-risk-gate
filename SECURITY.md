# Security Policy

## Supported Versions

Current hardening targets the `main` branch.

## Reporting a Vulnerability

Please open a private security advisory on GitHub for this repository.
If unavailable, open an issue titled `SECURITY: private report requested` without sensitive details.

## Security Controls

- Webhook signature verification (`GITHUB_WEBHOOK_SECRET`)
- API key role-based access control (`API_KEYS_JSON`)
- Input validation + filename safety checks
- Security response headers
- Optional CORS allowlist (`CORS_ORIGINS`)
