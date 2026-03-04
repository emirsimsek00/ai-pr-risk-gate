#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-https://ai-pr-risk-gate.onrender.com}"
API_KEY="${API_KEY:-}"
HC_MAX_ATTEMPTS="${HC_MAX_ATTEMPTS:-3}"
HC_TIMEOUT_SEC="${HC_TIMEOUT_SEC:-25}"
HC_BACKOFF_BASE_SEC="${HC_BACKOFF_BASE_SEC:-2}"


check_ok_json() {
  local json="$1"
  if command -v jq >/dev/null 2>&1; then
    echo "$json" | jq -e '.ok == true' >/dev/null
  else
    echo "$json" | grep -Eq '"ok"\s*:\s*true'
  fi
}

request_with_retry() {
  local mode="$1"; shift
  local url="$1"; shift

  local out=""
  local attempt
  for ((attempt=1; attempt<=HC_MAX_ATTEMPTS; attempt++)); do
    if [[ "$mode" == "json" ]]; then
      if out="$(curl -fsS --max-time "$HC_TIMEOUT_SEC" "$url")"; then
        printf '%s' "$out"
        return 0
      fi
    else
      if out="$(curl -fsS --max-time "$HC_TIMEOUT_SEC" "$url")"; then
        printf '%s' "$out"
        return 0
      fi
    fi

    if (( attempt < HC_MAX_ATTEMPTS )); then
      local sleep_s=$(( HC_BACKOFF_BASE_SEC * (2 ** (attempt - 1)) ))
      echo "[healthcheck] attempt ${attempt}/${HC_MAX_ATTEMPTS} failed for ${url}; retrying in ${sleep_s}s" >&2
      sleep "$sleep_s"
    fi
  done

  echo "[healthcheck] request failed after ${HC_MAX_ATTEMPTS} attempts: ${url}" >&2
  return 1
}

echo "[healthcheck] Checking ${BASE_URL}/health/live"
LIVE_JSON="$(request_with_retry json "${BASE_URL}/health/live")"
check_ok_json "$LIVE_JSON" || {
  echo "[healthcheck] Live endpoint is not healthy"
  exit 1
}

echo "[healthcheck] Checking ${BASE_URL}/health/ready"
READY_JSON="$(request_with_retry json "${BASE_URL}/health/ready")"
check_ok_json "$READY_JSON" || {
  echo "[healthcheck] Ready endpoint is not healthy"
  exit 1
}

echo "[healthcheck] Checking root page"
ROOT_PAYLOAD="$(request_with_retry text "${BASE_URL}/")"
echo "$ROOT_PAYLOAD" | grep -Eq "<title>AI PR Risk Gate</title>|AI PR Risk Gate|\"service\":\"ai-pr-risk-gate\"|\"service\": \"ai-pr-risk-gate\"|<div id=\"root\"></div>" || {
  echo "[healthcheck] Root endpoint does not look correct"
  exit 1
}

echo "[healthcheck] Running analyze smoke test"
ANALYZE_PAYLOAD='{"repo":"ai-pr-risk-gate","prNumber":1,"files":[{"filename":"src/auth/jwt.ts","patch":"+ const token = sign(payload, secret)"}]}'
ANALYZE_TMP="$(mktemp)"
trap 'rm -f "$ANALYZE_TMP"' EXIT

ANALYZE_HTTP_CODE=""
if [[ -n "$API_KEY" ]]; then
  ANALYZE_HTTP_CODE="$(curl -sS --max-time "$HC_TIMEOUT_SEC" -o "$ANALYZE_TMP" -w '%{http_code}' -X POST "${BASE_URL}/api/analyze" \
    -H "x-api-key: ${API_KEY}" \
    -H 'content-type: application/json' \
    --data "$ANALYZE_PAYLOAD")"
else
  ANALYZE_HTTP_CODE="$(curl -sS --max-time "$HC_TIMEOUT_SEC" -o "$ANALYZE_TMP" -w '%{http_code}' -X POST "${BASE_URL}/api/analyze" \
    -H 'content-type: application/json' \
    --data "$ANALYZE_PAYLOAD")"
fi

ANALYZE_RESP="$(cat "$ANALYZE_TMP")"

if [[ "$ANALYZE_HTTP_CODE" == "401" && -z "$API_KEY" ]]; then
  echo "[healthcheck] Analyze endpoint requires API key (expected in production)."
  echo "[healthcheck] Set API_KEY=<write-key> for full authenticated smoke test."
  echo "[healthcheck] OK (public endpoints healthy; analyze auth enforced)"
  exit 0
fi

if [[ "$ANALYZE_HTTP_CODE" != "200" ]]; then
  echo "[healthcheck] Analyze smoke test failed (HTTP ${ANALYZE_HTTP_CODE})"
  echo "$ANALYZE_RESP"
  exit 1
fi

echo "$ANALYZE_RESP" | grep -q '"score"' || {
  echo "[healthcheck] Analyze smoke test failed (missing score in response)"
  echo "$ANALYZE_RESP"
  exit 1
}

echo "[healthcheck] OK"
