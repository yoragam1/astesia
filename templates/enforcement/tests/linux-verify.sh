#!/bin/sh
# templates/enforcement/tests/linux-verify.sh
# POSIX-compliant verification script for Linux container / WSL2 environments.
# Enforces isolated environment and zero-leak execution.

set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

echo "=== Astesia Linux Verification Suite ==="
echo "Host platform: $(uname -s) $(uname -m)"
echo "Bun version:   $(bun --version)"

# 1. Verify exact Bun version 1.3.9
BUN_VER=$(bun --version)
if [ "$BUN_VER" != "1.3.9" ]; then
  echo "WARNING: Expected Bun version 1.3.9, got $BUN_VER. Proceeding with caution."
fi

# 2. Setup hermetic isolated environment in /tmp
WORK_DIR="/tmp/astesia-linux-verify-$$"
mkdir -p "$WORK_DIR"
EMPTY_HOME="$WORK_DIR/empty-home"
mkdir -p "$EMPTY_HOME"

export HOME="$EMPTY_HOME"
export USERPROFILE="$EMPTY_HOME"
export XDG_CONFIG_HOME="$EMPTY_HOME"
export GIT_CONFIG_GLOBAL=/dev/null
export GIT_CONFIG_SYSTEM=/dev/null
export GIT_CONFIG_NOSYSTEM=1
export LC_ALL=C

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT INT TERM

cd "$REPO_ROOT"

# 3. Run full consolidated harness
echo "\n[Step 1/2] Running consolidated harness (all.ts --json)..."
bun templates/enforcement/tests/all.ts --json > "$WORK_DIR/all-output.json"
ALL_STATUS=$?

if [ $ALL_STATUS -ne 0 ]; then
  echo "[FAILURE] all.ts exited with code $ALL_STATUS"
  cat "$WORK_DIR/all-output.json"
  exit $ALL_STATUS
fi

echo "[SUCCESS] all.ts passed with exit 0."

# 4. Run meta-test golden comparison if golden.ts exists
if [ -f "templates/enforcement/tests/golden.ts" ]; then
  echo "\n[Step 2/2] Running golden comparison (golden.ts --compare)..."
  bun templates/enforcement/tests/golden.ts --compare
  GOLDEN_STATUS=$?
  if [ $GOLDEN_STATUS -ne 0 ]; then
    echo "[FAILURE] golden.ts --compare exited with code $GOLDEN_STATUS"
    exit $GOLDEN_STATUS
  fi
  echo "[SUCCESS] golden.ts passed."
else
  echo "\n[Step 2/2] golden.ts not present; skipping golden comparison."
fi

echo "\n=== All Linux verification steps completed successfully (exit 0) ==="
exit 0
