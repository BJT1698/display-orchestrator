#!/usr/bin/env bash
set -e

# ==============================================================================
# Lightweight Remote Digital Signage - Kiosk Launcher
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLIENT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Configuration from environment or defaults
export AGENT_PORT="${AGENT_PORT:-9090}"
export SERVER_URL="${SERVER_URL:-ws://localhost:8080/ws}"
export DISPLAY="${DISPLAY:-:0}"

echo "========================================================"
echo " Starting Digital Signage Display Node"
echo " Server URL:  ${SERVER_URL}"
echo " Local Player: http://localhost:${AGENT_PORT}"
echo " Display:     ${DISPLAY}"
echo "========================================================"

# Disable screen blanking / power management on X11 if xset is available
if command -v xset >/dev/null 2>&1; then
  echo "Disabling X11 screen savers and DPMS..."
  xset s off || true
  xset s noblank || true
  xset -dpms || true
fi

# Hide mouse cursor if unclutter is installed
if command -v unclutter >/dev/null 2>&1; then
  unclutter -idle 0.5 -root &
fi

# Start Client Agent in background
echo "Starting Client Agent daemon..."
cd "${CLIENT_DIR}/agent"
node agent.js &
AGENT_PID=$!

# Wait for local player HTTP server to be available
echo "Waiting for local player service..."
for i in {1..30}; do
  if curl -s "http://localhost:${AGENT_PORT}" >/dev/null 2>&1; then
    echo "✓ Local player is online!"
    break
  fi
  sleep 0.5
done

# Launch Chromium / Chrome in Kiosk Mode
PLAYER_URL="http://localhost:${AGENT_PORT}"

CHROMIUM_BIN=""
for bin in chromium-browser chromium google-chrome-stable google-chrome brave-browser epiphany; do
  if command -v "$bin" >/dev/null 2>&1; then
    CHROMIUM_BIN="$bin"
    break
  fi
done

if [ -z "$CHROMIUM_BIN" ]; then
  echo "⚠️ No supported browser found for kiosk auto-launch."
  echo "Open a browser manually and navigate to: ${PLAYER_URL}"
  wait $AGENT_PID
  exit 0
fi

echo "Launching ${CHROMIUM_BIN} in full-screen kiosk mode..."

CHROMIUM_FLAGS=(
  --kiosk
  --noerrdialogs
  --disable-infobars
  --no-first-run
  --disable-session-crashed-bubble
  --disable-features=Translate
  --autoplay-policy=no-user-gesture-required
  --check-for-update-interval=31536000
  --disable-pinch
  --overscroll-history-navigation=0
  --disable-suggestions-ui
  --hide-scrollbars
  --app="${PLAYER_URL}"
)

# If GPU acceleration available, add performance flags
if [ -e /dev/dri ]; then
  CHROMIUM_FLAGS+=(
    --enable-gpu-rasterization
    --enable-zero-copy
    --ignore-gpu-blocklist
  )
fi

# Trap termination to kill background agent
cleanup() {
  echo "Stopping Kiosk and Client Agent..."
  kill -TERM "$AGENT_PID" 2>/dev/null || true
  exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# Run browser
"$CHROMIUM_BIN" "${CHROMIUM_FLAGS[@]}"
