#!/usr/bin/env bash
set -e

# ==============================================================================
# Developer Test Harness & Event Simulator CLI
# ==============================================================================

SERVER_HOST="${SERVER_HOST:-localhost:8080}"
API_BASE="http://${SERVER_HOST}/api"

print_usage() {
  echo "=========================================================="
  echo " 🛠️  Display Orchestrator Developer Test Harness"
  echo "=========================================================="
  echo "Usage: ./scripts/dev-tools.sh [COMMAND] [ARGS...]"
  echo ""
  echo "Commands:"
  echo "  status                  Show orchestrator health, displays & pairings"
  echo "  pair [CODE] [NAME]      Approve a pending pairing request"
  echo "  push-url <URL> [SEC]    Push a live web URL to Display #1 (or ID)"
  echo "  reload [ID]             Force reload client display (default: all)"
  echo "  blank [on|off] [ID]     Toggle screen blanking"
  echo "  emergency <MSG>         Broadcast emergency evacuation alert"
  echo "  inspect                 Inspect Chrome remote debugging targets (port 9222)"
  echo "  sim-disconnect          Simulate network cable pull (disconnect client)"
  echo "  sim-reconnect           Simulate network reconnection"
  echo "  list-media              List all media library items"
  echo "  seed-demo               Trigger default demo playlist assign"
  echo "=========================================================="
}

cmd_status() {
  echo "🔍 Querying Server Status..."
  curl -s "${API_BASE}/system/status" | grep -q '"success":true' && {
    echo "--- System Telemetry ---"
    curl -s "${API_BASE}/system/status"
    echo ""
    echo "--- Registered Displays ---"
    curl -s "${API_BASE}/displays"
    echo ""
    echo "--- Pending Pairing PINs ---"
    curl -s "${API_BASE}/displays/pairing/pending"
    echo ""
  } || {
    echo "❌ Server not responding at ${API_BASE}. Make sure dev-up.sh is running."
  }
}

cmd_pair() {
  local code="$1"
  local name="$2"

  if [ -z "$code" ]; then
    echo "Checking pending pairings..."
    local pending=$(curl -s "${API_BASE}/displays/pairing/pending")
    echo "$pending"
    code=$(echo "$pending" | grep -o '"pairing_code":"[^"]*' | head -n 1 | cut -d'"' -f4)
    if [ -z "$code" ]; then
      echo "⚠️ No pending displays waiting for pairing."
      return 0
    fi
    echo "Discovered pending PIN: $code"
  fi

  name="${name:-Dev Screen 1}"
  echo "Approving pairing code: $code for '${name}'..."
  curl -s -X POST "${API_BASE}/displays/pairing/approve" \
    -H "Content-Type: application/json" \
    -d "{\"pairingCode\":\"${code}\",\"name\":\"${name}\",\"groupId\":1}"
  echo ""
}

cmd_push_url() {
  local url="$1"
  local dur="${2:-30}"
  local display_id="${3:-1}"

  if [ -z "$url" ]; then
    echo "Error: URL is required. Example: ./scripts/dev-tools.sh push-url https://example.com 15"
    exit 1
  fi

  echo "🌐 Pushing URL '${url}' (${dur}s) to Display #${display_id}..."
  curl -s -X POST "${API_BASE}/displays/${display_id}/command" \
    -H "Content-Type: application/json" \
    -d "{\"action\":\"push_url\",\"payload\":{\"url\":\"${url}\",\"durationSeconds\":${dur}}}"
  echo ""
}

cmd_reload() {
  local display_id="${1:-1}"
  echo "🔄 Forcing reload on Display #${display_id}..."
  curl -s -X POST "${API_BASE}/displays/${display_id}/command" \
    -H "Content-Type: application/json" \
    -d '{"action":"reload"}'
  echo ""
}

cmd_blank() {
  local state="${1:-on}"
  local display_id="${2:-1}"
  local bool_val=true
  if [ "$state" = "off" ] || [ "$state" = "false" ]; then
    bool_val=false
  fi

  echo "🖥️ Setting Blank Screen=${bool_val} on Display #${display_id}..."
  curl -s -X POST "${API_BASE}/displays/${display_id}/command" \
    -H "Content-Type: application/json" \
    -d "{\"action\":\"blank\",\"payload\":{\"state\":${bool_val}}}"
  echo ""
}

cmd_emergency() {
  local msg="$1"
  local title="${2:-⚠️ EMERGENCY ALERT}"
  if [ -z "$msg" ]; then
    msg="TEST EVACUATION: Please proceed to the nearest emergency exit."
  fi

  echo "🚨 Broadcasting Emergency Alert to ALL screens..."
  curl -s -X POST "${API_BASE}/displays/broadcast/emergency" \
    -H "Content-Type: application/json" \
    -d "{\"title\":\"${title}\",\"message\":\"${msg}\",\"durationSeconds\":60}"
  echo ""
}

cmd_inspect() {
  echo "=========================================================="
  echo " 🔍 Chromium Remote Debugging"
  echo "=========================================================="
  echo "1. Open Google Chrome or Brave on your host machine."
  echo "2. Navigate to: chrome://inspect"
  echo "3. Ensure 'Discover network targets' includes 'localhost:9222'."
  echo "4. Click 'inspect' next to 'Display Kiosk Player'."
  echo ""
  echo "Active Debug Targets on http://localhost:9222/json/list:"
  curl -s http://localhost:9222/json/list || echo "⚠️ Could not connect to port 9222. Is client-dev container running?"
  echo ""
}

cmd_sim_disconnect() {
  echo "⚡ Simulating Network Disconnection on 'signage-client-dev'..."
  if command -v docker >/dev/null 2>&1; then
    docker network disconnect signage-dev-net signage-client-dev 2>/dev/null && {
      echo "✓ Network disconnected! Observe player continuing in OFFLINE CACHE mode without errors."
    } || echo "⚠️ Container 'signage-client-dev' not found on 'signage-dev-net'."
  else
    echo "Docker command not available."
  fi
}

cmd_sim_reconnect() {
  echo "🔌 Simulating Network Reconnection on 'signage-client-dev'..."
  if command -v docker >/dev/null 2>&1; then
    docker network connect signage-dev-net signage-client-dev 2>/dev/null && {
      echo "✓ Network reconnected! Client will automatically re-handshake and sync with server."
    } || echo "⚠️ Container 'signage-client-dev' not found."
  else
    echo "Docker command not available."
  fi
}

# Main Dispatcher
case "$1" in
  status)
    cmd_status
    ;;
  pair)
    cmd_pair "$2" "$3"
    ;;
  push-url)
    cmd_push_url "$2" "$3" "$4"
    ;;
  reload)
    cmd_reload "$2"
    ;;
  blank)
    cmd_blank "$2" "$3"
    ;;
  emergency)
    cmd_emergency "$2" "$3"
    ;;
  inspect)
    cmd_inspect
    ;;
  sim-disconnect)
    cmd_sim_disconnect
    ;;
  sim-reconnect)
    cmd_sim_reconnect
    ;;
  list-media)
    curl -s "${API_BASE}/media"
    echo ""
    ;;
  *)
    print_usage
    ;;
esac
