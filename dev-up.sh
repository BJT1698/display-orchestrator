#!/usr/bin/env bash
set -e

# ==============================================================================
# Local Development & Debugging Environment Launcher
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

export DISPLAY="${DISPLAY:-:0}"
XAUTH_RESTORE=0

echo "=========================================================="
echo " 🛠️  Digital Signage Orchestrator - Dev Environment"
echo "=========================================================="
echo "Host Display: ${DISPLAY}"

# 1. Configure X11 permissions for Docker container
if command -v xhost >/dev/null 2>&1; then
  echo "Granting local container permissions to access X11 display (${DISPLAY})..."
  xhost +local:root >/dev/null 2>&1 || true
  xhost +local:docker >/dev/null 2>&1 || true
  xhost +SI:localuser:root >/dev/null 2>&1 || true
  XAUTH_RESTORE=1
else
  echo "⚠️ 'xhost' command not found. If running Wayland/X11, ensure display permissions are open."
fi

# 2. Cleanup & Restore Trap on Exit
cleanup() {
  echo ""
  echo "Shutting down local development environment..."
  docker compose -f docker-compose.dev.yml down --remove-orphans 2>/dev/null || true

  if [ "$XAUTH_RESTORE" -eq 1 ] && command -v xhost >/dev/null 2>&1; then
    echo "Restoring local X11 permissions..."
    xhost -local:root >/dev/null 2>&1 || true
    xhost -local:docker >/dev/null 2>&1 || true
  fi
  echo "✓ Dev environment stopped."
}
trap cleanup SIGINT SIGTERM EXIT

# 3. Build frontend static bundle first if not present
if [ ! -f "server/public/index.html" ]; then
  echo "Compiling frontend web dashboard..."
  (cd frontend && npm run build)
fi

# 4. Parse Arguments
SERVICES=()
case "$1" in
  --server-only)
    echo "Mode: Server & Web Dashboard only"
    SERVICES=(server)
    ;;
  --single-client)
    echo "Mode: Server + Primary Windowed Client"
    SERVICES=(server client-dev)
    ;;
  --headless)
    echo "Mode: Headless Multi-client (Xvfb)"
    export WINDOWED=false
    export HEADLESS=true
    SERVICES=(server client-dev client-simulated)
    ;;
  *)
    echo "Mode: Full Development Stack (Server + Windowed Client + Simulated Node)"
    SERVICES=(server client-dev client-simulated)
    ;;
esac

echo ""
echo "----------------------------------------------------------"
echo " 🌐 Dashboard URL:         http://localhost:8080"
echo " 📺 Client 1 (Windowed):   http://localhost:9090"
echo " 📺 Client 2 (Simulated):  http://localhost:9091"
echo " 🔍 Chrome DevTools:       chrome://inspect  (target: localhost:9222)"
echo " 🧪 Test Harness CLI:      bash scripts/dev-tools.sh"
echo "----------------------------------------------------------"
echo "Press Ctrl+C at any time to stop all services."
echo ""

# 5. Launch Docker Compose in foreground with live logs
docker compose -f docker-compose.dev.yml up --build "${SERVICES[@]}"
