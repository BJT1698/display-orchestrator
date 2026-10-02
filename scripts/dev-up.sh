#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Single-Host Local Testing & Development Environment Launcher
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

export DISPLAY="''${DISPLAY:-:0}"
XAUTH_RESTORE=0

echo "=========================================================="
echo " 🛠️  Digital Signage Orchestrator - Local Dev Launcher"
echo " Target Display: ''${DISPLAY}"
echo "=========================================================="

# 1. Enable host X11 display permissions for local Docker containers
if command -v xhost >/dev/null 2>&1; then
  echo "Enabling local container X11 display access..."
  xhost +local:root >/dev/null 2>&1 || true
  xhost +local:docker >/dev/null 2>&1 || true
  XAUTH_RESTORE=1
else
  echo "⚠️ 'xhost' utility not found. If running Wayland/X11, ensure display access is granted."
fi

# 2. Cleanup & permission restore trap
cleanup() {
  echo ""
  echo "Stopping development stack..."
  if command -v docker >/dev/null 2>&1; then
    docker compose -f docker-compose.dev.yml down --remove-orphans 2>/dev/null || true
  fi

  if [ "$XAUTH_RESTORE" -eq 1 ] && command -v xhost >/dev/null 2>&1; then
    echo "Restoring local X11 permissions..."
    xhost -local:root >/dev/null 2>&1 || true
    xhost -local:docker >/dev/null 2>&1 || true
  fi
  echo "✓ Dev environment teardown complete."
}
trap cleanup SIGINT SIGTERM EXIT

# 3. Create required directories
mkdir -p data media client/cache client/cache-sim

echo ""
echo "----------------------------------------------------------"
echo " 🌐 Web Orchestrator:    http://localhost:8080"
echo " 📺 Kiosk Player:        http://localhost:9090 (Windowed 1280x720)"
echo " 🔍 Chrome DevTools:     chrome://inspect (port 9222)"
echo " 🧪 Run Test Suite:      bash scripts/run-tests.sh"
echo "----------------------------------------------------------"
echo "Press Ctrl+C to terminate all services."
echo ""

# 4. Start Docker Compose Dev Stack
if command -v docker >/dev/null 2>&1; then
  docker compose -f docker-compose.dev.yml up --build "$@"
else
  echo "⚠️ Docker is not available. Launching native Node/Python runner..."
  cd server && node src/server.js &
  SERVER_PID=$!
  cd ../client/agent && python3 main.py &
  CLIENT_PID=$!
  wait $SERVER_PID $CLIENT_PID
fi
