# AI PR Risk Gate — Onboarding Guide

## Purpose
This guide helps engineering teams integrate AI PR Risk Gate into a GitHub repository in under 10 minutes.

---

## Prerequisites
- A deployed AI PR Risk Gate instance (example: `https://ai-pr-risk-gate.onrender.com`)
- A GitHub repository with admin access
- Service environment variables configured:
  - `DATABASE_URL`
  - `GITHUB_TOKEN` (repo read + PR comment permissions)
  - `GITHUB_WEBHOOK_SECRET`
  - Optional: `RISK_POLICIES_JSON`

---

## Integration Path A (Recommended First): CI Workflow

### 1) Add repository secret
In your target repo:
- **Settings → Secrets and variables → Actions → New repository secret**
- Name: `RISK_GATE_URL`
- Value: your deployment URL (e.g., `https://ai-pr-risk-gate.onrender.com`)

### 2) Add workflow file
Create `.github/workflows/pr-risk-check.yml`:

```yaml
name: PR Risk Check

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  risk-check:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Gather changed files
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh api repos/${{ github.repository }}/pulls/${{ github.event.pull_request.number }}/files > files.json
          jq '[.[] | {filename, status, patch}]' files.json > payload-files.json

      - name: Call Risk Gate
        env:
          RISK_GATE_URL: ${{ secrets.RISK_GATE_URL }}
        run: |
          jq -n \
            --arg owner "${{ github.repository_owner }}" \
            --arg repo "${{ github.event.repository.name }}" \
            --argjson pr ${{ github.event.pull_request.number }} \
            --slurpfile files payload-files.json \
            '{owner:$owner, repo:$repo, prNumber:$pr, files:$files[0]}' > request.json

          curl -sS -X POST "$RISK_GATE_URL/api/analyze" \
            -H 'content-type: application/json' \
            --data @request.json > response.json

          cat response.json

      - name: Fail on critical score
        run: |
          SCORE=$(jq -r '.score // 0' response.json)
          if [ "$SCORE" -ge 80 ]; then
            echo "Critical risk score: $SCORE"
            exit 1
          fi
```

### 3) Open a PR to test
Expected behavior:
- Workflow runs automatically
- Risk score appears in Action logs
- PR can be blocked when threshold is exceeded

---

## Integration Path B: GitHub Webhook (Autonomous)

### 1) Add webhook in GitHub
- **Settings → Webhooks → Add webhook**
- Payload URL: `https://<your-service>/webhook/github`
- Content type: `application/json`
- Secret: use `GITHUB_WEBHOOK_SECRET`
- Events: **Pull requests**

### 2) Validate behavior
Open or update a PR.
Expected behavior:
- Service fetches PR files directly via GitHub API
- Service posts PR comment with score + findings + policy gate

---

## Policy Configuration
Default behavior blocks only `critical` severity.

Set custom policy with `RISK_POLICIES_JSON`:

```json
[
  {"repo":"payments-api","blockAtOrAbove":"high"},
  {"repo":"*","blockAtOrAbove":"critical"}
]
```

---

## How Teams Use It Day-to-Day
1. Developer opens a PR.
2. Risk Gate runs automatically (CI or webhook).
3. Team reviews score/findings in PR context.
4. If blocked by policy, author fixes issues before merge.
5. Team tracks trend and recurring findings in `/dashboard`.

---

## Verification Checklist
- [ ] `GET /health` returns `ok: true`
- [ ] CI workflow executes on PR
- [ ] `/api/analyze` returns score + severity
- [ ] Policy gate returns ALLOW/BLOCK as expected
- [ ] Dashboard is accessible at `/dashboard`

---

## Troubleshooting
### CI does not run
- Verify workflow exists in default branch
- Verify Actions are enabled for repo

### 401 from webhook
- Secret mismatch between GitHub webhook and service env

### No PR comments posted
- Check `GITHUB_TOKEN` permissions
- Confirm owner/repo/prNumber are present in request payload

### Service appears healthy but no analytics
- Confirm `DATABASE_URL` is valid
- Verify inserts into `risk_assessments`

---

## Security Notes
- Rotate `GITHUB_TOKEN` and `GITHUB_WEBHOOK_SECRET` regularly
- Keep rate limiting enabled
- Restrict deployment credentials to least privilege
