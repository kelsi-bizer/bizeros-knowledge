#!/bin/sh
# BizerOS Knowledge container entrypoint.
# Runs the file-api sidecar in the background and nginx in the foreground.

set -eu

BRAIN_DIR="${BRAIN_DIR:-/brain}"
mkdir -p "$BRAIN_DIR"

export BRAIN_DIR
export HOST="${HOST:-127.0.0.1}"
export PORT="${PORT:-3000}"
export LOG_LEVEL="${LOG_LEVEL:-info}"

echo "[entrypoint] BRAIN_DIR=$BRAIN_DIR" >&2
echo "[entrypoint] starting file-api on ${HOST}:${PORT}" >&2

node /opt/file-api/src/server.js &
FILE_API_PID=$!

# Forward shutdown signals to the file-api before exiting.
trap 'kill -TERM "$FILE_API_PID" 2>/dev/null || true; wait "$FILE_API_PID" 2>/dev/null || true; exit 0' TERM INT

# Wait briefly for the file-api to be ready so nginx doesn't 502 on first hit.
i=0
while [ "$i" -lt 20 ]; do
    if wget -q --spider "http://${HOST}:${PORT}/api/health" 2>/dev/null; then
        echo "[entrypoint] file-api ready" >&2
        break
    fi
    i=$((i + 1))
    sleep 0.25
done

if [ "$i" -ge 20 ]; then
    echo "[entrypoint] WARNING: file-api did not respond within 5s — nginx will start anyway" >&2
fi

echo "[entrypoint] starting nginx" >&2
exec nginx -g 'daemon off;'
