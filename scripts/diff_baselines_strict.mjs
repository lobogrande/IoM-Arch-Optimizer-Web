// scripts/diff_baselines_strict.mjs
// Per-sim, per-metric bit-equality check between baseline_results/ (Python)
// and baseline_results_wasm/ (Rust WASM).  Used after Phase 9 of the WASM
// engine port to confirm that every f64 produced by the Rust engine matches
// CPython exactly when both run the same seed against the same player state.
//
// Exits 0 only if EVERY metric of EVERY sim of EVERY save matches.  Any
// drift fails the check with a precise location (save / seed / metric).
//
// Usage:
//   node scripts/diff_baselines_strict.mjs

import { readFileSync, readdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { gunzipSync } from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PY_DIR = join(ROOT, 'baseline_results');
const WASM_DIR = join(ROOT, 'baseline_results_wasm');

function loadGz(path) {
  return JSON.parse(gunzipSync(readFileSync(path)).toString('utf8'));
}

/** Strict comparison: returns null on match, or a string describing the mismatch. */
function strictEq(rPy, rWasm, path) {
  if (rPy === rWasm) return null;

  // Number: bit-compare via Float64Array (handles -0.0 vs 0.0 and NaN edge cases).
  if (typeof rPy === 'number' && typeof rWasm === 'number') {
    if (Number.isNaN(rPy) && Number.isNaN(rWasm)) return null;
    const ba = new Float64Array([rPy]);
    const bb = new Float64Array([rWasm]);
    const da = new BigUint64Array(ba.buffer);
    const db = new BigUint64Array(bb.buffer);
    if (da[0] === db[0]) return null;
    return `${path}: py=${rPy} (${da[0].toString(16)}) vs wasm=${rWasm} (${db[0].toString(16)})`;
  }

  // Array
  if (Array.isArray(rPy) && Array.isArray(rWasm)) {
    if (rPy.length !== rWasm.length) {
      return `${path}.length: py=${rPy.length} vs wasm=${rWasm.length}`;
    }
    for (let i = 0; i < rPy.length; i++) {
      const m = strictEq(rPy[i], rWasm[i], `${path}[${i}]`);
      if (m) return m;
    }
    return null;
  }

  // Object: structural equality on keys (order-insensitive)
  if (rPy && typeof rPy === 'object' && rWasm && typeof rWasm === 'object') {
    const keys = new Set([...Object.keys(rPy), ...Object.keys(rWasm)]);
    for (const k of keys) {
      if (!(k in rPy)) return `${path}.${k}: missing in py, wasm=${JSON.stringify(rWasm[k])}`;
      if (!(k in rWasm)) return `${path}.${k}: missing in wasm, py=${JSON.stringify(rPy[k])}`;
      const m = strictEq(rPy[k], rWasm[k], `${path}.${k}`);
      if (m) return m;
    }
    return null;
  }

  return `${path}: py=${JSON.stringify(rPy)} (${typeof rPy}) vs wasm=${JSON.stringify(rWasm)} (${typeof rWasm})`;
}

function main() {
  if (!existsSync(PY_DIR))   { console.error(`Missing ${PY_DIR}. Run: npm run baseline`); process.exit(2); }
  if (!existsSync(WASM_DIR)) { console.error(`Missing ${WASM_DIR}. Run: WASM_ENGINE=1 npm run baseline`); process.exit(2); }

  const pyFiles = readdirSync(PY_DIR).filter(f => f.endsWith('.json.gz')).sort();
  const wasmFiles = new Set(readdirSync(WASM_DIR).filter(f => f.endsWith('.json.gz')));

  let totalSims = 0;
  let failedSims = 0;
  const firstFailures = [];

  for (const saveFile of pyFiles) {
    if (!wasmFiles.has(saveFile)) {
      console.log(`SKIP ${saveFile} (no WASM counterpart)`);
      continue;
    }
    const py = loadGz(join(PY_DIR, saveFile));
    const wasm = loadGz(join(WASM_DIR, saveFile));

    if (py.sims.length !== wasm.sims.length) {
      console.log(`FAIL ${saveFile}: sim count py=${py.sims.length} vs wasm=${wasm.sims.length}`);
      failedSims++;
      continue;
    }

    let saveFailures = 0;
    for (let i = 0; i < py.sims.length; i++) {
      totalSims++;
      const pSim = py.sims[i];
      const wSim = wasm.sims[i];
      if (pSim.seed !== wSim.seed) {
        const msg = `${saveFile}[${i}]: seed py=${pSim.seed} vs wasm=${wSim.seed}`;
        if (firstFailures.length < 20) firstFailures.push(msg);
        saveFailures++;
        failedSims++;
        continue;
      }
      const m = strictEq(pSim.result, wSim.result, `${saveFile}@seed=${pSim.seed}.result`);
      if (m) {
        if (firstFailures.length < 20) firstFailures.push(m);
        saveFailures++;
        failedSims++;
      }
    }
    const status = saveFailures === 0 ? '✓' : `✗ (${saveFailures} mismatches)`;
    console.log(`${status} ${saveFile}: ${py.sims.length} sims`);
  }

  console.log();
  console.log('─'.repeat(60));
  console.log(`Total sims: ${totalSims}  |  Failed sims: ${failedSims}`);
  if (firstFailures.length > 0) {
    console.log('\nFirst mismatches (up to 20):');
    firstFailures.forEach(l => console.log('  ' + l));
  }
  process.exit(failedSims === 0 ? 0 : 1);
}

main();
