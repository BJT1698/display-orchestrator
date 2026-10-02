#!/usr/bin/env bash
set -e

echo "=== Starting X11 Display Node Container ==="
echo "Display: ${DISPLAY}"
echo "Server URL: ${SERVER_URL}"

# Start agent in background
cd /app/client/agent
node agent.js &

# Wait for local player HTTP
until curl -s http://localhost:${AGENT_PORT:-9090} >/dev/null; do
  sleep 0.2
done

# Launch Chromium
exec chromium \
  --no-sandbox \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --no-first-run \
  --disable-session-crashed-bubble \
  --autoplay-policy=no-user-gesture-required \
  --hide-scrollbars \
  --app="http://localhost:${AGENT_PORT:-9090}"
