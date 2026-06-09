# WASM Engine Port — Results

Full port of `public/core/*.py` + `public/engine/*.py` (the IoM Archaeology
combat engine, ~1,600 LoC Python) to Rust → WebAssembly.  The Python engine
remains the default; WASM is opt-in via the **⚡ Rust/WASM engine** checkbox
in the Simulations tab or `WASM_ENGINE=1 npm run baseline` for the harness.

## Bottom line

| Metric | Python (Pyodide) | Rust → WASM | Improvement |
|---|---|---|---|
| **4,500-sim wall-clock** | 105.1 s | **2.76 s** | **38× faster** |
| **Average per sim** | 23.4 ms | **0.614 ms** | **38× faster** |
| **Worst-case per sim** (late_asc2 floor 225) | ~50 ms | **1.14 ms** | ~44× |
| **Bundle (raw)** | ~5–10 MB | 95 KB | ~70× smaller |
| **Bundle (gzip, what the browser downloads)** | ~2–3 MB | **41.1 KB** | ~60× smaller |
| **Cold app boot** | ~3 s (Pyodide download + init) | <100 ms (WASM fetch + instantiate) | ~30× faster |
| **Bit-identical to Python** | (the reference) | **✓ Yes — 4,500/4,500 sims** | — |

## Bit-identity validation

The Rust engine produces **exactly the same f64s as CPython** when both run
the same seed against the same player state.  This was verified across:

- **Per-component parity** — every Player @property, every block stat at
  every floor breakpoint (including the floor-150 armor-skip and floor-300
  double-trigger game bugs), every skill auto-cast cascade, every floor
  generation slot.  Each component has its own `cargo test ..._parity`
  suite that diffs against Python-generated golden fixtures.
- **Per-sim full output** — `scripts/diff_baselines_strict.mjs` decodes
  both `baseline_results/` (committed Python @ seeds 1000–1499) and
  `baseline_results_wasm/` (Rust regenerated identically) and bit-compares
  every metric of every sim.  Result: **4,500 sims × ~100 metrics each =
  ~450K f64/counter comparisons, zero mismatches**.

The key enabler was porting CPython's exact MT19937 (`_randommodule.c`) to
Rust, including the `init_by_array` seeding and `_randbelow` rejection
loop.  Once the RNG stream matches, the rest is straightforward arithmetic.

## Test suite

```text
$ cargo test --release
test result: ok. 24 passed; 0 failed   # src/lib.rs unit tests
test result: ok. 9 passed; 0 failed    # tests/block_parity.rs
test result: ok. 9 passed; 0 failed    # tests/combat_parity.rs
test result: ok. 9 passed; 0 failed    # tests/floor_parity.rs
test result: ok. 9 passed; 0 failed    # tests/player_parity.rs
test result: ok. 6 passed; 0 failed    # tests/rng_parity.rs
test result: ok. 9 passed; 0 failed    # tests/skills_parity.rs
test result: ok. 9 passed; 0 failed    # tests/state_roundtrip.rs
```

84/84 in-tree tests + 4,500/4,500 full-baseline diff = comprehensive
coverage.

## Architecture

```text
Browser worker (public/engine_worker.js)
  ├─ Pyodide path (default)             ── loads ~5 MB of Python interpreter
  └─ WASM path (useWasmEngine on)       ── loads 41 KB of engine.wasm
         │
         ▼
  public/wasm_state_codec.js  ── packs engine_state → 484 byte input,
                                  decodes 596+12N byte result → metrics dict
         │
         ▼
  public/engine.wasm
  ├─ engine_alloc / engine_free / engine_last_result_len
  └─ engine_run_simulation(state_ptr, state_len, seed) → result_ptr
         │
         ▼
  engine_wasm/ Rust crate (cdylib, lto=true, opt-level="z")
  ├─ rng.rs            ── MT19937 bit-identical to CPython
  ├─ project_config.rs ── BLOCK_BASE_STATS, ORE_RESTRICTIONS, INTERNAL_UPGRADE_CAPS
  ├─ player.rs         ── ~480 LoC, all @property + infernal cache + setters
  ├─ block.rs          ── HP/armor floor scaling lookup (game bugs preserved)
  ├─ skills.rs         ── SkillManager + auto-cast cascade
  ├─ floor_map.rs      ── spawn rates + ASC_BOSS_DATA + modifier rolling
  ├─ combat_loop.rs    ── CombatSimulator + RunState + run_simulation
  └─ state.rs          ── packed binary in/out
```

No external Rust dependencies in the WASM-shipped code (`serde_json` is a
dev-dependency for parity-test fixture loading, never linked into the .wasm).

## Per-save breakdown (4,500 sims)

```
                                                  WASM     Python
early_asc1_arch74_floor91_ramuh                  228 ms   ~10 s
early_asc2_arch1_floor1_asc2_playerstart          12 ms   ~ 1 s
late_asc2_arch114_floor186_lobo_asc2_mp          398 ms   ~17 s
late_asc2_arch118_floor225_lobo                  570 ms   ~22 s   ← longest sims
mid_asc1_arch100_floor167_example_asc2_player    313 ms   ~12 s
mid_asc1_arch82_floor106_aa                      246 ms   ~10 s
mid_asc1_arch82_floor106_annoyance               243 ms   ~10 s
mid_asc2_arch110_floor160_lobo_new               394 ms   ~16 s
mid_asc2_arch96_floor151_a                       360 ms   ~14 s
```

The longest-running save (deep-late-game, floor 225) runs 500 sims in
**570 ms** in WASM vs ~22 s in Python — 38× faster.  Lighter saves
(early-game, floor 1) finish 500 sims in **12 ms**.

## Migration path

The WASM engine is **opt-in** with the existing two engines living
side-by-side:

1. **`useWasmEngine: false`** (default) — Pyodide.  Behavior unchanged.
2. **`useWasmEngine: true`** — WASM.  Same output, ~38× faster.

The browser-side toggle lives next to the CPU thermal profile in the
Simulations tab.  No persistence — resets to off on reload so users
opting into experimental builds is always intentional.

Once we've shipped WASM-on for a release cycle without regressions, a
follow-up PR can flip the default and (eventually) delete the Pyodide
bootstrap from the worker.

## Phases

The port was built in 10 phases on `feat/wasm-engine`:

| # | Phase | Commit |
|---|---|---|
| 1 | Toolchain + Rust crate scaffold + dummy entry point | `345d1b9` |
| 2 | CPython-compatible MT19937 + project_config constants | `5b3310a` |
| 3 | Port `core/player.py` | `7076d37` |
| 4 | Port `core/block.py` + `core/skills.py` | `00ee30f` |
| 5 | Port `engine/floor_map.py` | `c7c137f` |
| 6 | Port `engine/combat_loop.py` | `3e9b4b1` |
| 7 | Packed binary state serialization | `0c7657c` |
| 8 | Wire WASM ABI into worker + harness | `2f3d892` |
| 9 | Per-seed bit-identity validation @ 4,500 sims | `b0368b7` |
| 10 | UI toggle + perf measurement + this doc | (this commit) |

## Reproducing the results

```bash
# Build the WASM module from Rust sources
npm run build:wasm

# Generate Python baselines (~110 s, gated by Pyodide boot)
npm run baseline

# Generate WASM baselines (~5 s, no Pyodide)
WASM_ENGINE=1 npm run baseline

# Strict per-sim per-metric diff
node scripts/diff_baselines_strict.mjs

# Full test suite from the Rust side
cd engine_wasm && cargo test --release
```
