#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://localhost:8787}"
READ_KEY="${READ_KEY:-read-key}"
WRITE_KEY="${WRITE_KEY:-write-key}"

check() {
  local name="$1"
  local code="$2"
  if [[ "$code" != "200" ]]; then
    echo "[smoke] ${name} failed with status ${code}"
    exit 1
  fi
}

echo "[smoke] health/live"
code=$(curl -sS -o /tmp/live.json -w '%{http_code}' "${BASE_URL}/health/live")
check "health/live" "$code"

echo "[smoke] health/ready"
code=$(curl -sS -o /tmp/ready.json -w '%{http_code}' "${BASE_URL}/health/ready")
check "health/ready" "$code"

echo "[smoke] unauthorized analyze should fail"
code=$(curl -sS -o /tmp/analyze-unauth.json -w '%{http_code}' -X POST "${BASE_URL}/api/analyze" \
  -H 'content-type: application/json' \
  --data '{"repo":"ai-pr-risk-gate","prNumber":1,"files":[{"filename":"src/a.ts","patch":"+x"}]}' )
if [[ "$code" == "200" || "$code" == "409" ]]; then
  echo "[smoke] analyze without API key unexpectedly succeeded"
  exit 1
fi

echo "[smoke] authorized analyze"
code=$(curl -sS -o /tmp/analyze-auth.json -w '%{http_code}' -X POST "${BASE_URL}/api/analyze" \
  -H "x-api-key: ${WRITE_KEY}" \
  -H 'content-type: application/json' \
  --data '{"repo":"ai-pr-risk-gate","prNumber":1,"files":[{"filename":"src/a.ts","patch":"+x"}]}' )
if [[ "$code" != "200" && "$code" != "409" ]]; then
  echo "[smoke] authorized analyze failed with ${code}"
  cat /tmp/analyze-auth.json
  exit 1
fi

echo "[smoke] read endpoint with read key"
code=$(curl -sS -o /tmp/recent.json -w '%{http_code}' "${BASE_URL}/api/recent" -H "x-api-key: ${READ_KEY}")
check "api/recent" "$code"

echo "[smoke] OK"
