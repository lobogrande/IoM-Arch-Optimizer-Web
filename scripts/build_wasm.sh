#!/usr/bin/env bash
# scripts/build_wasm.sh — compile engine_wasm crate to WebAssembly and copy
# the artifact into public/.  Idempotent; safe to re-run.
#
# Usage:
#   bash scripts/build_wasm.sh           # release build (default)
#   bash scripts/build_wasm.sh --dev     # dev profile (faster compile, larger output)

set -euo pipefail

echo "🦀 Building WASM engine from Rust source..."

# Check Rust is installed
if ! command -v cargo &> /dev/null; then
    echo "❌ Error: Cargo not found. Install Rust from https://rustup.rs/"
    exit 1
fi

# Source ~/.cargo/env so this works from any shell (cron, non-login, etc.)
if [ -f "$HOME/.cargo/env" ]; then
  # shellcheck disable=SC1091
  source "$HOME/.cargo/env"
fi

# Check wasm32 target is installed
if ! rustup target list | grep -q "wasm32-unknown-unknown (installed)"; then
    echo "📦 Installing wasm32-unknown-unknown target..."
    rustup target add wasm32-unknown-unknown
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

echo "🔨 Running cargo build ($PROFILE)..."
cd "$CRATE_DIR"

if [ "$PROFILE" = "release" ]; then
  cargo build --release --target wasm32-unknown-unknown
else
  cargo build --target wasm32-unknown-unknown
fi

SRC="$CRATE_DIR/target/wasm32-unknown-unknown/$PROFILE_DIR/engine_wasm.wasm"
if [ ! -f "$SRC" ]; then
  echo "❌ Error: expected wasm artifact not found at $SRC" >&2
  exit 1
fi

echo "📦 Copying WASM binary to public/..."
cp "$SRC" "$OUT"

# Report size
WASM_SIZE=$(wc -c < "$OUT" | tr -d ' ')
WASM_SIZE_KB=$((WASM_SIZE / 1024))

echo "✅ WASM engine built successfully!"
echo "   Size: ${WASM_SIZE_KB}KB (${WASM_SIZE} bytes)"
echo "   Location: public/engine.wasm"

# Optional: gzip size (for comparison to committed version)
if command -v gzip &> /dev/null; then
    GZIP_SIZE=$(gzip -c "$OUT" | wc -c | tr -d ' ')
    GZIP_SIZE_KB=$((GZIP_SIZE / 1024))
    echo "   Gzipped: ${GZIP_SIZE_KB}KB (${GZIP_SIZE} bytes)"
fi

echo ""
echo "🎯 To test locally:"
echo "   1. Run: npm run dev"
echo "   2. Enable 'Use WASM Engine' checkbox in Simulations tab"
echo "   3. Run Optimizer or Pathfinder"
