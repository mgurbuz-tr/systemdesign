#!/bin/sh
# Single-container init: launch presence WS server and nginx, exit when
# either child dies so the container can be restarted by Docker / Dokploy.
set -e

node /opt/presence/presence-server.mjs &
PRESENCE_PID=$!

nginx -g "daemon off;" &
NGINX_PID=$!

term() {
  echo "[start] signal received, stopping children"
  kill -TERM "$NGINX_PID" "$PRESENCE_PID" 2>/dev/null || true
}
trap term TERM INT

# Exit as soon as either child terminates.
while kill -0 "$NGINX_PID" 2>/dev/null && kill -0 "$PRESENCE_PID" 2>/dev/null; do
  sleep 1
done

echo "[start] a child exited; tearing down"
kill -TERM "$NGINX_PID" "$PRESENCE_PID" 2>/dev/null || true
wait "$NGINX_PID" 2>/dev/null || true
wait "$PRESENCE_PID" 2>/dev/null || true
exit 1
