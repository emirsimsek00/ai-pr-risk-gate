#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-https://ai-pr-risk-gate.onrender.com}"

echo "[healthcheck] Checking ${BASE_URL}/health"
HEALTH_JSON="$(curl -fsS "${BASE_URL}/health")"
echo "$HEALTH_JSON" | grep -q '"ok":true\|"ok": true' || {
  echo "[healthcheck] Health endpoint is not healthy"
  exit 1
}

echo "[healthcheck] Checking root page"
ROOT_PAYLOAD="$(curl -fsS "${BASE_URL}/")"
echo "$ROOT_PAYLOAD" | grep -q "AI PR Risk Gate\|\"service\":\"ai-pr-risk-gate\"\|\"service\": \"ai-pr-risk-gate\"" || {
  echo "[healthcheck] Root endpoint does not look correct"
  exit 1
}

echo "[healthcheck] Running analyze smoke test"
curl -fsS -X POST "${BASE_URL}/api/analyze" \
  -H 'content-type: application/json' \
  --data '{"repo":"ai-pr-risk-gate","prNumber":1,"files":[{"filename":"src/auth/jwt.ts","patch":"+ const token = sign(payload, secret)"}]}' \
  | grep -q '"score"' || {
    echo "[healthcheck] Analyze smoke test failed"
    exit 1
  }

echo "[healthcheck] OK"
