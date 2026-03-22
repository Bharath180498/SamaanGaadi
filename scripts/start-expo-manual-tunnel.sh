#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${1:-apps/driver}"
PORT="${2:-8082}"
CLEAR_CACHE="${3:-false}"
NGROK_LOG_FILE="/tmp/ngrok-expo-${PORT}.log"
NGROK_PID_FILE="/tmp/ngrok-expo-${PORT}.pid"
NGROK_CONFIG_FILE="${NGROK_CONFIG:-}"

if ! command -v ngrok >/dev/null 2>&1; then
  echo "ngrok is required but not found. Install it first (brew install ngrok/ngrok/ngrok)." >&2
  exit 1
fi

NGROK_CMD=(ngrok)
if [[ -n "$NGROK_CONFIG_FILE" ]]; then
  if [[ ! -f "$NGROK_CONFIG_FILE" ]]; then
    echo "NGROK_CONFIG file not found: $NGROK_CONFIG_FILE" >&2
    exit 1
  fi
  NGROK_CMD=(ngrok --config "$NGROK_CONFIG_FILE")
fi

if [[ -f "$NGROK_PID_FILE" ]]; then
  OLD_NGROK_PID="$(cat "$NGROK_PID_FILE" 2>/dev/null || true)"
  if [[ -n "${OLD_NGROK_PID:-}" ]] && kill -0 "$OLD_NGROK_PID" 2>/dev/null; then
    kill "$OLD_NGROK_PID" 2>/dev/null || true
    sleep 1
  fi
  rm -f "$NGROK_PID_FILE"
fi

EXISTING_PORT_PID="$(lsof -ti:"$PORT" 2>/dev/null || true)"
if [[ -n "$EXISTING_PORT_PID" ]]; then
  kill $EXISTING_PORT_PID 2>/dev/null || true
  sleep 1
fi

EXPO_FLAGS=(--lan --port "$PORT")
if [[ "$CLEAR_CACHE" == "true" ]]; then
  EXPO_FLAGS+=(--clear)
fi

cleanup() {
  if [[ -n "${NGROK_PID:-}" ]]; then
    kill "$NGROK_PID" 2>/dev/null || true
  fi
  rm -f "$NGROK_PID_FILE"
  if [[ -n "${EXPO_PID:-}" ]]; then
    kill "$EXPO_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

: > "$NGROK_LOG_FILE"
"${NGROK_CMD[@]}" http "$PORT" --log=stdout --log-level=info > "$NGROK_LOG_FILE" 2>&1 &
NGROK_PID=$!
echo "$NGROK_PID" > "$NGROK_PID_FILE"

PUBLIC_URL=""
for _ in {1..30}; do
  PUBLIC_URL="$(grep -Eo 'url=https://[^ ]+' "$NGROK_LOG_FILE" | sed 's/^url=//' | tail -n 1 || true)"
  if [[ -n "$PUBLIC_URL" ]]; then
    break
  fi
  if grep -q "ERR_NGROK_108" "$NGROK_LOG_FILE" 2>/dev/null; then
    echo
    echo "ngrok rejected a second agent session (ERR_NGROK_108)." >&2
    echo "You likely need a paid ngrok plan or a second ngrok account/token for parallel tunnels." >&2
    echo
    exit 1
  fi
  if grep -q "ERR_NGROK_334" "$NGROK_LOG_FILE" 2>/dev/null; then
    echo
    echo "ngrok endpoint is already online (ERR_NGROK_334)." >&2
    echo "Your account is reusing the same ngrok URL, so a second tunnel cannot start in parallel." >&2
    echo "Stop the other tunnel first, or use a separate ngrok account/token (or paid multi-endpoint plan)." >&2
    echo
    exit 1
  fi
  sleep 1
done

if [[ -n "$PUBLIC_URL" ]]; then
  HOST="${PUBLIC_URL#https://}"
  echo
  echo "Manual tunnel ready for $APP_DIR"
  echo "Open this URL in Expo Go (or paste in 'Enter URL manually'):"
  echo "  exps://$HOST"
  echo
else
  echo
  echo "Could not read ngrok public URL. Check $NGROK_LOG_FILE for details." >&2
  echo
  exit 1
fi

(
  cd "$APP_DIR"
  EXPO_NO_METRO_WORKSPACE_ROOT=1 EXPO_PACKAGER_PROXY_URL="$PUBLIC_URL" npx expo start "${EXPO_FLAGS[@]}"
) &
EXPO_PID=$!

sleep 2
echo "Expo dev server booting with proxy URL:"
echo "  $PUBLIC_URL"
echo

wait "$EXPO_PID"
