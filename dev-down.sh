#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Stopping all dev containers..."
docker compose -f docker-compose.dev.yml down --remove-orphans

if command -v xhost >/dev/null 2>&1; then
  xhost -local:root >/dev/null 2>&1 || true
  xhost -local:docker >/dev/null 2>&1 || true
fi

echo "✓ Development containers stopped and cleaned up."
