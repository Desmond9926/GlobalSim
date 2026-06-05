#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:8000}"
FRONTEND_URL="${FRONTEND_URL:-http://127.0.0.1:5173}"
FAILED=0
OFFLINE=0

if [[ "${1:-}" == "--offline" ]]; then
  OFFLINE=1
fi

pass() {
  printf '[ok] %s\n' "$1"
}

fail() {
  printf '[fail] %s\n' "$1"
  FAILED=1
}

check_file() {
  if [[ -e "$1" ]]; then
    pass "$2"
  else
    fail "$2"
  fi
}

echo "GlobalSim local runtime doctor"
echo

check_file ".env" ".env exists"
check_file ".venv/bin/python" "backend virtualenv exists"
check_file "node_modules" "root npm dependencies installed"
check_file "frontend/node_modules" "frontend npm dependencies installed"

if [[ -x ".venv/bin/python" ]]; then
  if .venv/bin/python -c "import fastapi, pydantic_settings, uvicorn" >/dev/null 2>&1; then
    pass "backend Python packages import"
  else
    fail "backend Python packages import"
  fi
fi

if [[ -d "node_modules" && -d "frontend/node_modules" ]]; then
  if npm --prefix frontend run test >/dev/null 2>&1; then
    pass "frontend unit tests pass"
  else
    fail "frontend unit tests pass"
  fi
fi

if [[ "$OFFLINE" -eq 1 ]]; then
  pass "offline mode skips HTTP service checks"
elif command -v curl >/dev/null 2>&1; then
  if curl -fsS "$BACKEND_URL/api/health" >/dev/null 2>&1; then
    pass "backend health endpoint responds at $BACKEND_URL"
  else
    fail "backend health endpoint responds at $BACKEND_URL"
  fi

  if curl -fsS "$BACKEND_URL/api/runtime/status" >/dev/null 2>&1; then
    pass "backend runtime status responds"
  else
    fail "backend runtime status responds"
  fi

  if curl -fsS "$FRONTEND_URL" >/dev/null 2>&1; then
    pass "frontend responds at $FRONTEND_URL"
  else
    fail "frontend responds at $FRONTEND_URL"
  fi
else
  fail "curl is available for HTTP checks"
fi

echo
if [[ "$FAILED" -eq 0 ]]; then
  echo "GlobalSim local runtime checks passed."
else
  echo "Some checks failed. Start the app with ./dev.sh, then rerun ./doctor.sh."
  echo "For dependency-only checks, run ./doctor.sh --offline."
fi

exit "$FAILED"
