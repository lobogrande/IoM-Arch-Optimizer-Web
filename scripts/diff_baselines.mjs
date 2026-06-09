// scripts/diff_baselines.mjs
// Distributional comparison between the Python baseline (baseline_results/)
// and the JS-kernel baseline (baseline_results_js/). Computes per-metric
// mean / std / p50 / p95 over 500 sims per save and asserts the JS kernel
// stays within tolerance of the Python source of truth.
//
// Usage:
//   node scripts/diff_baselines.mjs
//
// Exit code: 0 if all metrics within tolerance, 1 if any breach.

import { readFileSync, readdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { gunzipSync } from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PY_DIR = join(ROOT, 'baseline_results');
const JS_DIR = join(ROOT, 'baseline_results_js');

// Metrics to compare. Each is per-sim. Means/stds/percentiles computed across
// the 500 sims per save.
const METRICS = [
  'highest_floor',
  'total_time',
  'gross_swings',
  'crosshair_spawns',
  'flurry_casts',
  'enrage_casts',
  'quake_casts',
  'melee_damage',
  'crosshair_damage',
  'quake_damage',
  'overkill_damage',
  'blocks_per_min',
  'xp_per_min',
];

// Tolerances. Distributional comparison only — per-seed values WILL differ
// because Python uses MT19937 and JS uses mulberry32. Tuned to flag real
// math bugs (typically >>10% deltas) while accepting PRNG-distribution noise
// (typically <5%) and integer-quantization artifacts on count metrics.
const MEAN_REL_TOL = 0.05;  // |js_mean - py_mean| / |py_mean| < 5%
const STD_RATIO_LO = 0.80;  // js_std / py_std must be within [0.80, 1.20]
const STD_RATIO_HI = 1.20;
const P50_REL_TOL  = 0.05;

function loadGz(path) {
  return JSON.parse(gunzipSync(readFileSync(path)).toString('utf8'));
}

function pct(sorted, p) {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[i];
}

function stats(values) {
  const n = values.length;
  if (n === 0) return { n: 0, mean: 0, std: 0, p50: 0, p95: 0 };
  let sum = 0;
  for (const v of values) sum += v;
  const mean = sum / n;
  let sq = 0;
  for (const v of values) { const d = v - mean; sq += d * d; }
  const std = n > 1 ? Math.sqrt(sq / (n - 1)) : 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return { n, mean, std, p50: pct(sorted, 0.5), p95: pct(sorted, 0.95) };
}

function fmt(v) {
  if (!Number.isFinite(v)) return String(v);
  if (Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0)) return v.toExponential(2);
  return v.toFixed(2);
}

function relMean(a, b) {
  if (b === 0) return a === 0 ? 0 : Infinity;
  return Math.abs(a - b) / Math.abs(b);
}

function checkRow(metric, py, js) {
  const meanRel = relMean(js.mean, py.mean);
  const p50Rel  = relMean(js.p50, py.p50);
  const stdRatio = py.std === 0 ? (js.std === 0 ? 1 : Infinity) : js.std / py.std;

  const meanPass = meanRel <= MEAN_REL_TOL;
  const stdPass  = stdRatio >= STD_RATIO_LO && stdRatio <= STD_RATIO_HI;
  const p50Pass  = p50Rel <= P50_REL_TOL;

  return { meanRel, p50Rel, stdRatio, meanPass, stdPass, p50Pass };
}

function main() {
  if (!existsSync(PY_DIR)) { console.error(`Missing ${PY_DIR}. Run: npm run baseline`); process.exit(1); }
  if (!existsSync(JS_DIR)) { console.error(`Missing ${JS_DIR}. Run: JS_KERNEL=1 npm run baseline`); process.exit(1); }

  const pyFiles = readdirSync(PY_DIR).filter(f => f.endsWith('.json.gz')).sort();
  const jsFiles = new Set(readdirSync(JS_DIR).filter(f => f.endsWith('.json.gz')));

  let totalChecks = 0;
  let totalBreaches = 0;
  const breachLines = [];

  for (const saveFile of pyFiles) {
    if (!jsFiles.has(saveFile)) {
      console.log(`SKIP  ${saveFile}  (no JS counterpart)`);
      continue;
    }

    const py = loadGz(join(PY_DIR, saveFile));
    const js = loadGz(join(JS_DIR, saveFile));

    console.log(`\n=== ${saveFile} ===`);
    console.log(
      `  PY: ${py.sims.length} sims  |  JS: ${js.sims.length} sims  ` +
      `(seeds ${py.sims[0].seed}-${py.sims[py.sims.length-1].seed})`
    );

    // Header
    const head = ['metric', 'py_mean', 'js_mean', 'mean Δ', 'p50 Δ', 'std ratio', '   '];
    console.log(head.map(s => String(s).padStart(14)).join(' '));

    for (const m of METRICS) {
      const pyVals = py.sims.map(s => Number(s.result[m] ?? 0));
      const jsVals = js.sims.map(s => Number(s.result[m] ?? 0));
      const pyS = stats(pyVals);
      const jsS = stats(jsVals);
      const c = checkRow(m, pyS, jsS);
      totalChecks += 3;
      const failures = [];
      if (!c.meanPass) failures.push('mean');
      if (!c.stdPass)  failures.push('std');
      if (!c.p50Pass)  failures.push('p50');
      totalBreaches += failures.length;

      const status = failures.length === 0 ? '✓' : '✗ ' + failures.join(',');
      const row = [
        m,
        fmt(pyS.mean),
        fmt(jsS.mean),
        (c.meanRel * 100).toFixed(2) + '%',
        (c.p50Rel * 100).toFixed(2) + '%',
        c.stdRatio.toFixed(3),
        status,
      ];
      console.log(row.map(s => String(s).padStart(14)).join(' '));
      if (failures.length > 0) {
        breachLines.push(`  ${saveFile}::${m}  ${failures.join(', ')}  (mean Δ=${(c.meanRel*100).toFixed(2)}% std=${c.stdRatio.toFixed(3)} p50 Δ=${(c.p50Rel*100).toFixed(2)}%)`);
      }
    }
  }

  console.log();
  console.log('─'.repeat(60));
  console.log(`Total checks: ${totalChecks}  |  Breaches: ${totalBreaches}`);
  if (breachLines.length > 0) {
    console.log('\nBreaches:');
    breachLines.forEach(l => console.log(l));
  }

  // Compare wall-clock from manifests
  const pyManifest = JSON.parse(readFileSync(join(PY_DIR, 'manifest.json'), 'utf8'));
  const jsManifest = JSON.parse(readFileSync(join(JS_DIR, 'manifest.json'), 'utf8'));
  const pyMs = pyManifest.saves.reduce((a, s) => a + s.duration_ms, 0);
  const jsMs = jsManifest.saves.reduce((a, s) => a + s.duration_ms, 0);
  console.log(`\nWall-clock (sim time, excludes Pyodide boot):`);
  console.log(`  Python:  ${(pyMs / 1000).toFixed(1)}s`);
  console.log(`  JS:      ${(jsMs / 1000).toFixed(1)}s`);
  console.log(`  ratio:   ${(jsMs / pyMs).toFixed(2)}x  ${jsMs < pyMs ? '(JS faster)' : '(JS slower)'}`);

  process.exit(totalBreaches > 0 ? 1 : 0);
}

main();
