#!/usr/bin/env bash
set -e

echo "=== Starting Cage (Wayland Direct KMS/DRM) Display Node ==="
echo "Server URL: ${SERVER_URL}"

# Start agent in background
cd /app/client/agent
node agent.js &

# Wait for local player HTTP
until curl -s http://localhost:${AGENT_PORT:-9090} >/dev/null; do
  sleep 0.2
done

# Launch Chromium inside Cage compositor
exec cage -s -- chromium \
  --no-sandbox \
  --ozone-platform=wayland \
  --enable-features=UseOzonePlatform \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --no-first-run \
  --autoplay-policy=no-user-gesture-required \
  --hide-scrollbars \
  --app="http://localhost:${AGENT_PORT:-9090}"
