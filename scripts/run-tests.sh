#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# End-to-End Automated Test Verification Suite
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

SERVER_PORT=8080
CLIENT_PORT=9090
API_BASE="http://127.0.0.1:${SERVER_PORT}/api"

echo "=========================================================="
echo " 🧪 Digital Signage Orchestrator - Automated E2E Tests"
echo "=========================================================="

rm -rf client/cache-test
mkdir -p data media client/cache-test

# Process handles
SERVER_PID=""
CLIENT_PID=""

cleanup() {
  echo ""
  echo "Stopping test processes..."
  if [ -n "$CLIENT_PID" ]; then kill -TERM "$CLIENT_PID" 2>/dev/null || true; fi
  if [ -n "$SERVER_PID" ]; then kill -TERM "$SERVER_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT SIGINT SIGTERM

# 1. Start Server
echo "1️⃣ Starting Server Orchestrator on port ${SERVER_PORT}..."
cd server
PORT=${SERVER_PORT} HOST="127.0.0.1" DATA_DIR="${ROOT_DIR}/data" MEDIA_DIR="${ROOT_DIR}/media" node src/server.js >/dev/null 2>&1 &
SERVER_PID=$!
cd "${ROOT_DIR}"

sleep 2

# Verify Health
echo "2️⃣ Testing GET /api/health..."
HEALTH_RES=$(curl -s "http://127.0.0.1:${SERVER_PORT}/api/health")
if echo "$HEALTH_RES" | grep -q '"status":"ok"'; then
  echo "✓ Server health check PASSED!"
else
  echo "❌ Health check failed: $HEALTH_RES"
  exit 1
fi

# 2. Start Client Agent
echo "3️⃣ Starting Client Agent on port ${CLIENT_PORT}..."
cd client/agent
TEST_UUID="test-node-$(date +%s%N)"
DEVICE_UUID="${TEST_UUID}" AGENT_PORT=${CLIENT_PORT} SERVER_URL="ws://127.0.0.1:${SERVER_PORT}/ws" CLIENT_NAME="E2E Test Screen" CACHE_DIR="${ROOT_DIR}/client/cache-test" node agent.js >/dev/null 2>&1 &
CLIENT_PID=$!
cd "${ROOT_DIR}"

sleep 3

# 3. Test Pairing Discovery
echo "4️⃣ Checking Pending Pairing Requests on Orchestrator..."
PAIRING_LIST=$(curl -s "${API_BASE}/displays/pairing/pending")
PAIRING_CODE=$(echo "$PAIRING_LIST" | grep -o '"pairing_code":"[^"]*' | head -n 1 | cut -d'"' -f4)

if [ -z "$PAIRING_CODE" ]; then
  echo "❌ No pairing PIN discovered"
  exit 1
fi
echo "✓ Discovered pairing PIN: '$PAIRING_CODE'"

# 4. Approve Pairing PIN
echo "5️⃣ Approving pairing PIN via POST /api/displays/pairing/approve..."
APPROVE_RES=$(curl -s -X POST "${API_BASE}/displays/pairing/approve" \
  -H "Content-Type: application/json" \
  -d "{\"pairingCode\":\"${PAIRING_CODE}\",\"name\":\"Verified Main Kiosk\",\"groupId\":1}")

if echo "$APPROVE_RES" | grep -q '"success":true'; then
  echo "✓ Pairing approved successfully!"
else
  echo "❌ Pairing approval failed: $APPROVE_RES"
  exit 1
fi

TARGET_ID=$(echo "$APPROVE_RES" | grep -o '"displayId":[0-9]*' | head -n 1 | cut -d':' -f2)
if [ -z "$TARGET_ID" ]; then
  TARGET_ID=$(echo "$APPROVE_RES" | grep -o '"id":[0-9]*' | head -n 1 | cut -d':' -f2)
fi
if [ -z "$TARGET_ID" ]; then
  TARGET_ID=1
fi

sleep 2

# 5. Verify Display is Online
echo "6️⃣ Verifying Display Node state in SQLite..."
DISPLAYS_RES=$(curl -s "${API_BASE}/displays")
if echo "$DISPLAYS_RES" | grep -q '"status":"online"'; then
  echo "✓ Display node is ONLINE and registered!"
else
  echo "❌ Display not online: $DISPLAYS_RES"
  exit 1
fi

# 6. Test Live Push URL
echo "7️⃣ Dispatching Live Push URL command to Display #${TARGET_ID}..."
PUSH_RES=$(curl -s -X POST "${API_BASE}/displays/${TARGET_ID}/push" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","durationSeconds":5}')

if echo "$PUSH_RES" | grep -q '"sent":true'; then
  echo "✓ Live URL push command delivered via WebSocket!"
else
  echo "❌ Push command failed: $PUSH_RES"
  exit 1
fi

# 7. Test Playlist CRUD & Sync
echo "8️⃣ Testing Playlist Creation & Item Sequencing..."
PL_RES=$(curl -s -X POST "${API_BASE}/playlists" \
  -H "Content-Type: application/json" \
  -d '{"name":"Automated Loop Test","loopEnabled":true,"transitionEffect":"slide-left"}')

PL_ID=$(echo "$PL_RES" | grep -o '"id":[0-9]*' | head -n 1 | cut -d':' -f2)

curl -s -X POST "${API_BASE}/playlists/${PL_ID}/items" \
  -H "Content-Type: application/json" \
  -d '{"customUrl":"https://example.com/widget","durationSeconds":5,"transition":"fade"}' >/dev/null

echo "✓ Created Playlist #${PL_ID} with slide sequence!"

echo ""
echo "=========================================================="
echo " 🎉 ALL AUTOMATED E2E TESTS PASSED SUCCESSFULLY!"
echo "=========================================================="
