#!/usr/bin/env bash
set -e

echo "=========================================================="
echo " Starting Display Client in LOCAL DEVELOPMENT / DEBUG Mode"
echo " Display Socket:       ${DISPLAY:-:0}"
echo " Server WebSocket URL: ${SERVER_URL:-ws://server:8080/ws}"
echo " Local Agent Port:     ${AGENT_PORT:-9090}"
echo " Remote Debugging:     0.0.0.0:9222 (chrome://inspect)"
echo " Window Size:          ${WINDOW_WIDTH:-1280}x${WINDOW_HEIGHT:-720}"
echo "=========================================================="

# Create cache directory if needed
mkdir -p /cache /cache/media /tmp/chrome-dev-profile

# Start Agent daemon in background
cd /app/client/agent
node agent.js &
AGENT_PID=$!

# Wait for local agent HTTP service to be online
echo "Waiting for local player service on port ${AGENT_PORT:-9090}..."
for i in {1..30}; do
  if curl -s "http://localhost:${AGENT_PORT:-9090}" >/dev/null 2>&1; then
    echo "✓ Local player is online!"
    break
  fi
  sleep 0.5
done

# If HEADLESS mode requested, start virtual framebuffer
if [ "${HEADLESS:-0}" = "1" ] || [ "${HEADLESS:-0}" = "true" ]; then
  echo "Starting in Virtual Framebuffer (Headless) mode via Xvfb..."
  if command -v Xvfb >/dev/null 2>&1; then
    Xvfb :99 -screen 0 1280x720x24 &
    export DISPLAY=:99
  fi
fi

# Locate Chromium binary
CHROMIUM_BIN=""
for bin in chromium chromium-browser google-chrome-stable google-chrome brave-browser; do
  if command -v "$bin" >/dev/null 2>&1; then
    CHROMIUM_BIN="$bin"
    break
  fi
done

if [ -z "$CHROMIUM_BIN" ]; then
  echo "⚠️ Chromium not found. Client Agent running standalone."
  wait $AGENT_PID
  exit 0
fi

PLAYER_URL="http://localhost:${AGENT_PORT:-9090}"

# Base Chromium Flags for Local Debugging
CHROMIUM_FLAGS=(
  --no-sandbox
  --disable-setuid-sandbox
  --disable-dev-shm-usage
  --disable-gpu-sandbox
  --remote-debugging-port=9222
  --remote-debugging-address=0.0.0.0
  --user-data-dir=/tmp/chrome-dev-profile
  --no-first-run
  --no-default-browser-check
  --disable-session-crashed-bubble
  --disable-infobars
  --autoplay-policy=no-user-gesture-required
  --enable-logging=stderr
  --v=1
)

# If WINDOWED mode (default in dev), use fixed window size instead of locking fullscreen kiosk
if [ "${WINDOWED:-1}" = "1" ] || [ "${WINDOWED:-1}" = "true" ]; then
  echo "Launching in Windowed Dev Mode (${WINDOW_WIDTH:-1280}x${WINDOW_HEIGHT:-720})..."
  CHROMIUM_FLAGS+=(
    "--window-size=${WINDOW_WIDTH:-1280},${WINDOW_HEIGHT:-720}"
    "--window-position=${WINDOW_X:-100},${WINDOW_Y:-100}"
    "--app=${PLAYER_URL}"
  )
else
  echo "Launching in Fullscreen Kiosk Mode..."
  CHROMIUM_FLAGS+=(
    --kiosk
    --hide-scrollbars
    "--app=${PLAYER_URL}"
  )
fi

# GPU acceleration flags if DRI exists
if [ -e /dev/dri ]; then
  CHROMIUM_FLAGS+=(
    --enable-gpu-rasterization
    --enable-zero-copy
    --ignore-gpu-blocklist
  )
fi

cleanup() {
  echo "Shutting down dev client..."
  kill -TERM "$AGENT_PID" 2>/dev/null || true
  exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# Execute Chromium with debugging enabled
exec "$CHROMIUM_BIN" "${CHROMIUM_FLAGS[@]}"
