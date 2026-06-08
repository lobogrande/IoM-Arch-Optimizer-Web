# WASM Engine Build & Deployment Guide

## Overview

The WASM engine is a Rust-based implementation of the Python simulation core, compiled to WebAssembly for 30-40× performance improvements. This document covers building, testing, and deploying the WASM engine.

---

## Prerequisites

### Required Tools

1. **Rust Toolchain** (1.70+)
   ```bash
   # Install via rustup
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   
   # Add wasm32 target
   rustup target add wasm32-unknown-unknown
   ```

2. **Node.js** (20+)
   ```bash
   # Already required for the main project
   node --version  # should be v20+
   ```

### Optional Tools

- `wasm-opt` (from Binaryen) - for further size optimization
- `wasm-strip` - for removing debug symbols

---

## Building the WASM Engine

### Quick Build (Recommended)

```bash
# From project root
bash scripts/build_wasm.sh
```

This script:
1. Checks Rust installation
2. Installs wasm32 target if needed
3. Builds the WASM with release optimizations
4. Copies to `public/engine.wasm`
5. Reports size metrics

**Build time:** ~30-60 seconds on first build, ~10 seconds on incremental builds

### Manual Build

```bash
cd engine_wasm
cargo build --release --target wasm32-unknown-unknown
cp target/wasm32-unknown-unknown/release/engine_wasm.wasm ../public/engine.wasm
```

### Build Output

```
📦 WASM binary location: public/engine.wasm
📊 Expected size: ~95KB raw, ~41KB gzipped
```

---

## Testing the WASM Engine

### 1. Run Rust Unit Tests (84 tests)

```bash
cd engine_wasm
cargo test --release
```

**What this tests:**
- ✅ RNG parity with CPython's MT19937
- ✅ Player stat calculation formulas
- ✅ Block stat generation at all floors
- ✅ Skill cooldown mechanics
- ✅ Floor generation (spawns, boss floors)
- ✅ Full combat simulations
- ✅ State serialization round-trips

**Expected output:** `test result: ok. 84 passed`

### 2. Manual Browser Testing

```bash
# Start dev server
npm run dev
```

Then in browser:
1. Navigate to **Simulations** tab
2. **First run WITHOUT** "Use WASM Engine" (Python baseline)
3. **Second run WITH** "Use WASM Engine" enabled
4. Compare results across tools:
   - **Optimizer**: Should be significantly faster (typically 6-40× depending on candidate count)
   - **Pathfinder**: Check final level/floor are similar
   - **Forecaster**: Verify ROI recommendations are comparable
   - **Synthesis**: Check stat allocations are reasonable
   - **Sandbox**: Compare yield metrics
   - **Duel Build**: Verify duel win/loss outcomes

**Expected:** WASM results should be statistically similar to Python (within 1-5% variance due to Monte Carlo randomness). Final levels, floors, and strategies should match. Absolute timings will vary based on your player state, locked stats, and simulation parameters.

### 3. Baseline Validation (Optional)

The project includes a comprehensive validation suite that runs 4,500 simulations comparing WASM vs Python:

```bash
# Install pyodide package (if not already)
npm install pyodide

# Run validation
WASM_ENGINE=1 npm run baseline
```

**What this does:**
- Runs 9 player saves × 500 RNG seeds each
- Compares every output value (floors, time, blocks, fragments)
- Reports bit-for-bit identity or variance

**Expected:** 4,500/4,500 sims match (within Monte Carlo variance ~2%)

---

## CI/CD Integration

### GitHub Actions Workflow

The `.github/workflows/ci.yml` automatically:

1. **Detects WASM presence**: Checks if `engine_wasm/` exists
2. **Sets up Rust**: Installs stable Rust + wasm32 target
3. **Builds from source**: Compiles WASM fresh (not from committed binary)
4. **Runs tests**: Executes all 84 Rust unit tests
5. **Validates**: Optionally runs baseline comparison

**CI Build Time:**
- Python-only PRs: ~30 seconds
- WASM PRs: ~2-3 minutes (includes Rust install + build + tests)

### Branch Protection

**Enabled on:** `main`, `dev`

**Requirements:**
- ✅ CI build must pass
- ✅ All checks must succeed
- ⚠️ Admins can override (for emergency hotfixes)

---

## Deployment

### Production Build

```bash
# 1. Build the WASM
bash scripts/build_wasm.sh

# 2. Build the main app
npm run build

# 3. Preview production build
npm run preview
```

### Cloudflare Pages

The WASM binary (`public/engine.wasm`) is automatically deployed alongside the rest of the static assets.

**CDN Caching:**
- WASM is versioned via query string: `engine.wasm?v=2.3.0`
- Cache busting happens automatically via `APP_VERSION`

**Size Impact:**
- Raw WASM: +95KB
- Gzipped WASM: +41KB
- vs Pyodide: Saves ~5MB download when WASM is used

---

## Should engine.wasm Be Committed?

### Current Approach: ✅ Committed

**Pros:**
- Zero setup for contributors (npm install just works)
- Faster dev server startup
- No Rust toolchain required for frontend work

**Cons:**
- Binary in git (bad practice)
- Can't verify it matches source
- Manual rebuild required when Rust changes

### Alternative: Build in CI Only

**Pros:**
- Source of truth is Rust code
- Always up-to-date
- Smaller repo size

**Cons:**
- Contributors need Rust installed
- Slower dev setup

### Recommendation

For now, **keep the binary committed** but:
1. CI builds fresh from source (proves reproducibility)
2. Document rebuild instructions clearly
3. Consider `.gitignore`ing it once team has Rust installed

---

## Troubleshooting

### "cargo: command not found"

Install Rust:
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env
```

### "target 'wasm32-unknown-unknown' not installed"

Add the target:
```bash
rustup target add wasm32-unknown-unknown
```

### "engine.wasm schema mismatch"

The compiled WASM doesn't match the codec version. Rebuild:
```bash
bash scripts/build_wasm.sh
```

### "Cannot find package 'pyodide'"

The baseline validation requires additional setup:
```bash
npm install pyodide
```

Or skip baseline validation - manual testing is sufficient.

### WASM Checkbox Doesn't Work

Check browser console for errors. Common issues:
- WASM binary not found (check `public/engine.wasm` exists)
- Schema version mismatch (rebuild WASM)
- Browser doesn't support WebAssembly (very old browser)

---

## Performance Benchmarks

### Optimizer (4,500 candidate builds)

| Engine | Time | Speedup |
|--------|------|---------|
| Python (Pyodide) | 16.8s | 1× |
| WASM | 0.5s | **34×** |

### Pathfinder (Levels 1-20)

| Engine | Time | Speedup |
|--------|------|---------|
| Python (Pyodide) | 16.2s | 1× |
| WASM | 2.8s | **6×** |

### Bundle Size

| Engine | Download | Gzipped |
|--------|----------|---------|
| Python (Pyodide) | 5MB | ~2-3MB |
| WASM | 95KB | 41KB |

**Total savings:** ~98% smaller download, skip ~3s interpreter boot time

---

## Maintaining the WASM Engine

### When to Rebuild

Rebuild the WASM engine whenever:
1. **Game mechanics change**: Formula updates in Python need porting
2. **New features**: Additional stats, upgrades, or mechanics
3. **Bug fixes**: Fixes to combat logic, RNG, or stat calculations

### Porting Process

1. **Update Rust code** in `engine_wasm/src/`
2. **Add tests** in `engine_wasm/tests/`
3. **Run tests**: `cargo test`
4. **Rebuild**: `bash scripts/build_wasm.sh`
5. **Validate**: Compare WASM vs Python results
6. **Commit**: Both Rust source and WASM binary

### Staying in Sync

The WASM engine must match Python behavior exactly. Use:
- Unit tests for formulas
- Baseline validation for end-to-end correctness
- Manual testing for UI integration

---

## Future Improvements

### Size Optimization

Current WASM is optimized for size (`opt-level = "z"`), but further reduction possible:

```bash
# Install wasm-opt
npm install -g wasm-opt

# Optimize further
wasm-opt -Oz public/engine.wasm -o public/engine.wasm
```

Could save ~5-10KB more.

### Full Replacement

Once WASM is battle-tested (6+ months), consider:
1. Removing Python engine entirely
2. Removing Pyodide dependency
3. WASM becomes default (not opt-in)

This would:
- Save 5MB bundle size
- Eliminate 2-engine maintenance burden
- Improve performance for all users

### Schema Versioning

#### What is the Schema?

The WASM engine uses a **binary protocol** to exchange data with JavaScript. Player state is packed into a fixed-size byte array (484 bytes for input, 596+ bytes for output) with a specific layout:

- `public/wasm_state_codec.js` - JavaScript side (encodes JS objects → bytes)
- `engine_wasm/src/state_codec.rs` - Rust side (decodes bytes → structs)

Both sides must agree on the exact layout, tracked by `SCHEMA_VERSION`.

#### When Does Schema Version Need to Change?

**Schema changes REQUIRED for:**
- ✅ Adding new player stats (e.g., adding Ascension 3 stats)
- ✅ Adding new upgrade types (beyond current 56)
- ✅ Changing data types (u32 → u64, adding new fields to structs)
- ✅ Reordering fields in the binary layout
- ✅ Adding new card types or block properties

**Schema changes NOT required for:**
- ❌ Formula changes (same inputs, different calculations)
- ❌ Combat logic tweaks
- ❌ Bug fixes that don't alter data structures
- ❌ Performance optimizations

**Rule of thumb:** If you modify struct definitions in either `wasm_state_codec.js` or Rust's state structs, you likely need a schema bump.

#### How to Detect Schema Changes

**Manual Detection:**
1. Did you modify `public/wasm_state_codec.js`?
2. Did you change any structs in `engine_wasm/src/` that relate to input/output?
3. Did the byte counts change (check `INPUT_SIZE` or output buffer sizes)?

If YES to any → bump schema version.

**Automated Detection:**

Add this test to `engine_wasm/tests/state_roundtrip.rs`:

```rust
#[test]
fn schema_size_guard() {
    // This test FAILS if you change the schema without bumping version
    const EXPECTED_INPUT_SIZE: usize = 484;
    const EXPECTED_OUTPUT_BASE_SIZE: usize = 596;
    
    assert_eq!(
        INPUT_SIZE, EXPECTED_INPUT_SIZE,
        "Input size changed! If intentional, bump SCHEMA_VERSION and update this test."
    );
    assert_eq!(
        OUTPUT_BASE_SIZE, EXPECTED_OUTPUT_BASE_SIZE,
        "Output size changed! If intentional, bump SCHEMA_VERSION and update this test."
    );
    
    // Also verify version is set
    assert!(SCHEMA_VERSION > 0, "Schema version must be set");
}
```

This test will **fail** if you change struct sizes, forcing you to consciously decide whether to bump the version.

#### Workflow for Schema Changes

When you need to change the schema:

1. **Update the code** (add fields, change structs)
2. **Bump version constants:**
   ```rust
   // engine_wasm/src/lib.rs
   pub const SCHEMA_VERSION: u8 = 2;  // Was 1
   ```
   ```javascript
   // public/wasm_state_codec.js
   const SCHEMA_VERSION = 2;  // Was 1
   ```
3. **Update size guard test** (if you added one)
4. **Rebuild WASM:** `bash scripts/build_wasm.sh`
5. **Test thoroughly** - old saves should fail gracefully with clear error
6. **Bump APP_VERSION** in the code to bust caches

#### Current Behavior (No Migration)

Right now, version mismatches cause a hard error:

```javascript
// engine_worker.js lines 205-208
if (instance.exports.engine_schema_version() !== self.IoMWasmStateCodec.SCHEMA_VERSION) {
    throw new Error('engine.wasm schema mismatch: wasm=X codec=Y');
}
```

Users see an error and must refresh their browser to get the new WASM binary.

This is **acceptable** for now because:
- Cache busting usually prevents mismatches (`engine.wasm?v=2.3.0`)
- Schema changes are rare (maybe once per year)
- Clear error message tells users what to do

#### Future: Schema Migration (Optional)

For a better UX, you could implement automatic migration:

```rust
fn decode_input(bytes: &[u8], version: u8) -> EngineInput {
    match version {
        1 => {
            // Read v1 format
            let old_state = decode_v1(bytes);
            // Convert to current format
            migrate_v1_to_current(old_state)
        },
        2 => decode_v2(bytes),  // Current version
        _ => panic!("Unsupported schema version: {}", version),
    }
}
```

**When to implement:** After your first real schema change, when the pain of "please refresh" becomes annoying. Not worth the complexity right now.

#### Testing Schema Changes

Before deploying a schema change:

1. **Keep old WASM cached:**
   ```bash
   # Don't rebuild, use committed binary
   npm run dev
   # Enable WASM, run a sim - works fine
   ```

2. **Deploy new JavaScript (without new WASM):**
   ```bash
   # Simulate the bad state: new JS, old WASM binary
   # You should see "schema mismatch" error
   ```

3. **Verify error is clear:**
   - Check console shows version numbers
   - User-facing error message is helpful

4. **Deploy new WASM:**
   ```bash
   bash scripts/build_wasm.sh
   # Now everything works again
   ```

This simulates the brief window where a user has old WASM cached but new JS loaded.

---

## Questions?

- **Technical Issues**: Check GitHub Issues
- **Build Problems**: See Troubleshooting section above
- **Performance**: See benchmarks in `engine_wasm/RESULTS.md`
- **Formulas**: See `engine_wasm/src/*.rs` for implementations

