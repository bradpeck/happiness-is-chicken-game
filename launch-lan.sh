#!/usr/bin/env bash
# Launch Happiness Is Chicken! on the local network (Mac / Linux).
# Serves this folder on 0.0.0.0:8080 so any device on the same Wi-Fi can play.
set -u
cd "$(dirname "$0")"

PORT="${PORT:-8080}"

# Best-effort LAN IP detection (macOS first, then Linux).
IP=""
if command -v ipconfig >/dev/null 2>&1; then
  IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
fi
if [ -z "$IP" ]; then
  IP="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
fi
[ -z "$IP" ] && IP="YOUR-LAN-IP"

echo ""
echo "  🐔 Happiness Is Chicken! is starting on port $PORT"
echo ""
echo "  On this computer:   http://localhost:$PORT/happiness-is-chicken.html"
echo "  On other devices:   http://$IP:$PORT/happiness-is-chicken.html"
echo "                      (or just http://$IP:$PORT )"
echo ""
echo "  Everyone must be on the same Wi-Fi / home network."
echo "  Press Ctrl+C to stop the game server."
echo ""

if command -v python3 >/dev/null 2>&1; then
  exec python3 -m http.server "$PORT" --bind 0.0.0.0
elif command -v python >/dev/null 2>&1; then
  exec python -m http.server "$PORT" --bind 0.0.0.0
elif command -v npx >/dev/null 2>&1; then
  exec npx --yes http-server -a 0.0.0.0 -p "$PORT" -c-1 .
else
  echo "  ❌ Could not find Python 3 or Node.js."
  echo "     Install Python 3 (https://www.python.org) and run this again."
  exit 1
fi
