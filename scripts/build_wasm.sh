#!/usr/bin/env bash
# scripts/build_wasm.sh — compile engine_wasm crate to WebAssembly and copy
# the artifact into public/.  Idempotent; safe to re-run.
#
# Usage:
#   bash scripts/build_wasm.sh           # release build (default)
#   bash scripts/build_wasm.sh --dev     # dev profile (faster compile, larger output)

set -euo pipefail

# Source ~/.cargo/env so this works from any shell (cron, non-login, etc.)
if [ -f "$HOME/.cargo/env" ]; then
  # shellcheck disable=SC1091
  source "$HOME/.cargo/env"
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CRATE_DIR="$ROOT/engine_wasm"
OUT="$ROOT/public/engine.wasm"

PROFILE="release"
PROFILE_DIR="release"
if [ "${1:-}" = "--dev" ]; then
  PROFILE="dev"
  PROFILE_DIR="debug"
fi

echo "Building engine_wasm ($PROFILE)..."
cd "$CRATE_DIR"

if [ "$PROFILE" = "release" ]; then
  cargo build --release --target wasm32-unknown-unknown
else
  cargo build --target wasm32-unknown-unknown
fi

SRC="$CRATE_DIR/target/wasm32-unknown-unknown/$PROFILE_DIR/engine_wasm.wasm"
if [ ! -f "$SRC" ]; then
  echo "ERROR: expected wasm artifact not found at $SRC" >&2
  exit 1
fi

cp "$SRC" "$OUT"
SIZE=$(du -h "$OUT" | cut -f1)
echo "✓ $OUT  ($SIZE)"
