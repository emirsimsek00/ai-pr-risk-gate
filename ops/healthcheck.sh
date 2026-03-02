#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-https://ai-pr-risk-gate.onrender.com}"
API_KEY="${API_KEY:-}"
AUTH_HEADER=()
if [[ -n "$API_KEY" ]]; then
  AUTH_HEADER=(-H "x-api-key: ${API_KEY}")
fi

check_ok_json() {
  local json="$1"
  if command -v jq >/dev/null 2>&1; then
    echo "$json" | jq -e '.ok == true' >/dev/null
  else
    echo "$json" | grep -Eq '"ok"\s*:\s*true'
  fi
}

echo "[healthcheck] Checking ${BASE_URL}/health/live"
LIVE_JSON="$(curl -fsS "${BASE_URL}/health/live")"
check_ok_json "$LIVE_JSON" || {
  echo "[healthcheck] Live endpoint is not healthy"
  exit 1
}

echo "[healthcheck] Checking ${BASE_URL}/health/ready"
READY_JSON="$(curl -fsS "${BASE_URL}/health/ready")"
check_ok_json "$READY_JSON" || {
  echo "[healthcheck] Ready endpoint is not healthy"
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
  "${AUTH_HEADER[@]}" \
  -H 'content-type: application/json' \
  --data '{"repo":"ai-pr-risk-gate","prNumber":1,"files":[{"filename":"src/auth/jwt.ts","patch":"+ const token = sign(payload, secret)"}]}' \
  | grep -q '"score"' || {
    echo "[healthcheck] Analyze smoke test failed"
    exit 1
  }

echo "[healthcheck] OK"
