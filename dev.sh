#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if [[ ! -f ".env" ]]; then
  echo "Missing .env. Create it from .env.example first:"
  echo "  cp .env.example .env"
  exit 1
fi

if [[ ! -x ".venv/bin/uvicorn" ]]; then
  echo "Missing backend dependencies. Run:"
  echo "  .venv/bin/pip install -r requirements-dev.txt"
  exit 1
fi

if [[ ! -d "node_modules" || ! -d "frontend/node_modules" ]]; then
  echo "Missing frontend dependencies. Run:"
  echo "  npm install"
  echo "  npm --prefix frontend install"
  exit 1
fi

cleanup() {
  if [[ -n "${BACKEND_PID:-}" ]]; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
  if [[ -n "${FRONTEND_PID:-}" ]]; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "Starting GlobalSim backend on http://127.0.0.1:8000"
npm run backend:dev &
BACKEND_PID=$!

echo "Starting GlobalSim frontend on http://127.0.0.1:5173"
npm run frontend:dev &
FRONTEND_PID=$!

echo
echo "GlobalSim is starting. Open:"
echo "  http://127.0.0.1:5173"
echo
echo "Press Ctrl+C to stop both services."

while true; do
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo "Backend process exited."
    exit 1
  fi
  if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
    echo "Frontend process exited."
    exit 1
  fi
  sleep 1
done
