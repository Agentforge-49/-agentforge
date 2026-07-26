#!/usr/bin/env bash
set -Eeuo pipefail

engine_port="${ENGINE_INTERNAL_PORT:-8000}"
export AGENT_ENGINE_URL="http://127.0.0.1:${engine_port}"

engine_pid=""
api_pid=""

shutdown() {
  trap - EXIT INT TERM
  if [[ -n "${api_pid}" ]] && kill -0 "${api_pid}" 2>/dev/null; then
    kill -TERM "${api_pid}" 2>/dev/null || true
  fi
  if [[ -n "${engine_pid}" ]] && kill -0 "${engine_pid}" 2>/dev/null; then
    kill -TERM "${engine_pid}" 2>/dev/null || true
  fi
  wait 2>/dev/null || true
}

trap shutdown EXIT INT TERM

cd /app/engine
uvicorn main:app --host 127.0.0.1 --port "${engine_port}" &
engine_pid=$!

engine_ready=false
for _ in {1..45}; do
  if ! kill -0 "${engine_pid}" 2>/dev/null; then
    echo "AgentForge engine stopped during startup" >&2
    exit 1
  fi

  if python3 - "${engine_port}" <<'PY'
import sys
import urllib.request

port = sys.argv[1]
with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=1) as response:
    if response.status != 200:
        raise SystemExit(1)
PY
  then
    engine_ready=true
    break
  fi

  sleep 1
done

if [[ "${engine_ready}" != "true" ]]; then
  echo "AgentForge engine did not become healthy in time" >&2
  exit 1
fi

cd /app/backend
node server.js &
api_pid=$!

set +e
wait -n "${engine_pid}" "${api_pid}"
exit_code=$?
set -e
echo "An AgentForge process exited with status ${exit_code}" >&2
exit "${exit_code}"
