#!/usr/bin/env bash
set -euo pipefail

echo "[recover] Checking OpenClaw gateway status"
if ! openclaw gateway status >/tmp/openclaw-gateway-status.txt 2>&1; then
  echo "[recover] Gateway status command failed; restarting gateway"
  openclaw gateway restart
  sleep 20
fi

if ! openclaw status >/tmp/openclaw-status.txt 2>&1; then
  echo "[recover] openclaw status failed after restart"
  exit 1
fi

echo "[recover] OpenClaw appears healthy"
