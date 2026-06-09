#!/bin/bash
# Build WASM engine from Rust source
# This script is used both locally and in CI

set -e  # Exit on error

echo "🦀 Building WASM engine from Rust source..."

# Check Rust is installed
if ! command -v cargo &> /dev/null; then
    echo "❌ Error: Cargo not found. Install Rust from https://rustup.rs/"
    exit 1
fi

# Check wasm32 target is installed
if ! rustup target list | grep -q "wasm32-unknown-unknown (installed)"; then
    echo "📦 Installing wasm32-unknown-unknown target..."
    rustup target add wasm32-unknown-unknown
fi

# Build the WASM
cd "$(dirname "$0")/../engine_wasm" || exit 1

echo "🔨 Running cargo build..."
cargo build --release --target wasm32-unknown-unknown

# Copy to public/
WASM_SOURCE="target/wasm32-unknown-unknown/release/engine_wasm.wasm"
WASM_DEST="../public/engine.wasm"

if [ ! -f "$WASM_SOURCE" ]; then
    echo "❌ Error: Build failed, $WASM_SOURCE not found"
    exit 1
fi

echo "📦 Copying WASM binary to public/..."
cp "$WASM_SOURCE" "$WASM_DEST"

# Report size
WASM_SIZE=$(wc -c < "$WASM_DEST" | tr -d ' ')
WASM_SIZE_KB=$((WASM_SIZE / 1024))

echo "✅ WASM engine built successfully!"
echo "   Size: ${WASM_SIZE_KB}KB (${WASM_SIZE} bytes)"
echo "   Location: public/engine.wasm"

# Optional: gzip size (for comparison to committed version)
if command -v gzip &> /dev/null; then
    GZIP_SIZE=$(gzip -c "$WASM_DEST" | wc -c | tr -d ' ')
    GZIP_SIZE_KB=$((GZIP_SIZE / 1024))
    echo "   Gzipped: ${GZIP_SIZE_KB}KB (${GZIP_SIZE} bytes)"
fi

echo ""
echo "🎯 To test locally:"
echo "   1. Run: npm run dev"
echo "   2. Enable 'Use WASM Engine' checkbox in Simulations tab"
echo "   3. Run Optimizer or Pathfinder"
