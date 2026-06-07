// Seeded Pyodide baseline harness for the IoM combat engine.
//
// Runs N seeded Monte Carlo simulations on each normalized save and writes the
// (seed, result) tuples to baseline_results/. The future JS-ported combat
// kernel will run the same saves with the same seeds and diff its outputs
// against these baselines.
//
// Mirrors public/engine_worker.js exactly: same Pyodide version, same Python
// engine files, same execute_simulation logic. Differences (if any) between
// this harness's results and the browser's would indicate environment drift
// and should be investigated before trusting the baselines.
//
// Usage:
//   npm run baseline            # 500 sims per save, seeds 1000..1499
//   SIMS=100 npm run baseline   # quick smoke test
//   BASE_SEED=2000 npm run baseline

import { loadPyodide } from 'pyodide';
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { createHash } from 'crypto';
import { gzipSync } from 'zlib';

import { defaultState, loadStateFromJson } from './save_import.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SAVES_DIR = join(ROOT, 'normalized_saves');
const OUT_DIR = join(ROOT, 'baseline_results');
const PY_DIR = join(ROOT, 'public');

const BASE_SEED = parseInt(process.env.BASE_SEED) || 1000;
const SIMS_PER_SAVE = parseInt(process.env.SIMS) || 500;
const PROGRESS_EVERY = 25;
const PYODIDE_VERSION = '0.29.4';

// ---------------------------------------------------------------------------
// Python heredoc — mirrors public/engine_worker.js inline script verbatim so
// the harness exercises the exact same code path the browser worker uses.
// ---------------------------------------------------------------------------
const PYTHON_SCRIPT = `
import sys
import random
from core.player import Player
from engine.combat_loop import CombatSimulator

base_player = None

def sync_base_player(state_proxy):
    global base_player
    state_dict = state_proxy.to_py() if hasattr(state_proxy, 'to_py') else state_proxy
    p = Player()

    p.asc1_unlocked = state_dict.get('asc1_unlocked', False)
    p.asc2_unlocked = state_dict.get('asc2_unlocked', False)
    p.arch_level = int(state_dict.get('arch_level', 1))
    p.current_max_floor = int(state_dict.get('current_max_floor', 1))
    p.hades_idol_level = int(state_dict.get('hades_idol_level', 0))
    p.arch_ability_infernal_bonus = float(state_dict.get('arch_ability_infernal_bonus', 0.0))
    p.total_infernal_cards = int(state_dict.get('total_infernal_cards', 0))
    p.starting_speed_pool = int(state_dict.get('starting_speed_pool', 0))

    for k, v in state_dict.get('base_stats', {}).items():
        p.base_stats[str(k)] = int(v)
    for k, v in state_dict.get('upgrade_levels', {}).items():
        p.set_upgrade_level(int(k), int(v))
    for k, v in state_dict.get('external_levels', {}).items():
        p.set_external_level(int(k), int(v))
    for k, v in state_dict.get('cards', {}).items():
        p.set_card_level(str(k), int(v))

    base_player = p

def execute_simulation(test_stats_proxy, test_upgrades_proxy, test_external_proxy, test_cards_proxy, rng_seed=None):
    global base_player

    if rng_seed is None:
        random.seed()
    else:
        random.seed(int(rng_seed))

    p = base_player.fast_clone()

    test_stats = test_stats_proxy.to_py() if hasattr(test_stats_proxy, 'to_py') else test_stats_proxy
    for k, v in test_stats.items():
        p.base_stats[str(k)] = int(v)

    test_upgrades = test_upgrades_proxy.to_py() if hasattr(test_upgrades_proxy, 'to_py') else test_upgrades_proxy
    if test_upgrades:
        for k, v in test_upgrades.items():
            p.set_upgrade_level(int(k), int(v))

    test_external = test_external_proxy.to_py() if hasattr(test_external_proxy, 'to_py') else test_external_proxy
    if test_external:
        for k, v in test_external.items():
            if int(k) == 21:
                p.hades_idol_level = int(v)
            else:
                p.set_external_level(int(k), int(v))

    test_cards = test_cards_proxy.to_py() if hasattr(test_cards_proxy, 'to_py') else test_cards_proxy
    if test_cards:
        for k, v in test_cards.items():
            p.set_card_level(str(k), int(v))

    sim = CombatSimulator(p)
    result = sim.run_simulation()

    arch_mins = result.total_time / 60.0 if result.total_time > 0 else 1.0

    metrics = {
        "highest_floor": result.highest_floor,
        "xp_per_min": result.total_xp / arch_mins,
        "blocks_per_min": result.blocks_mined / arch_mins,
        "total_time": result.total_time,
        "stamina_trace_floor": result.history['floor'],
        "stamina_trace_stamina": result.history['stamina'],
        "gross_swings": result.total_stamina_spent,
        "in_game_time": result.total_time,
        "crosshair_spawns": result.crosshair_spawns,
        "crosshair_damage": result.crosshair_damage,
        "melee_damage": result.melee_damage,
        "quake_damage": result.quake_damage,
        "overkill_damage": result.overkill_damage,
        "flurry_casts": result.skills_tracker.total_flurry_casts,
        "enrage_casts": result.skills_tracker.total_enrage_casts,
        "quake_casts": result.skills_tracker.total_quake_casts,
        "stamina_refunded_flurry": result.stamina_refunded_flurry,
        "stamina_refunded_mods": result.stamina_refunded_mods,
        "stamina_wasted_overcap": result.stamina_wasted_overcap,
        "speed_pool_delta_per_min": (result.speed_pool - p.starting_speed_pool) / arch_mins,
    }

    for frag_tier, amt in result.total_frags.items():
        metrics[f"frag_{frag_tier}_per_min"] = amt / arch_mins

    if hasattr(result, 'specific_blocks_mined'):
        for block_id, count in result.specific_blocks_mined.items():
            b_pm = count / arch_mins
            metrics[f"block_{block_id}_per_min"] = b_pm
            metrics[f"raw_block_{block_id}"] = count

            is_t4 = block_id.endswith('4')
            base_odds = 15000 if is_t4 else 1500
            poly_odds = 75000 if is_t4 else 7500
            inf_odds  = 200000

            metrics[f"card_base_{block_id}_per_min"] = b_pm / base_odds
            metrics[f"card_poly_{block_id}_per_min"] = b_pm / poly_odds
            metrics[f"card_inf_{block_id}_per_min"] = b_pm / inf_odds

    if hasattr(result, 'specific_blocks_frags'):
        for block_id, frags in result.specific_blocks_frags.items():
            metrics[f"raw_frag_{block_id}"] = frags

    return metrics
`;

// ---------------------------------------------------------------------------
// Adapt imported (store-shaped) state to what sync_base_player expects.
// Mirrors App.jsx's CALC_STATS/SYNC_STATE payload construction.
// ---------------------------------------------------------------------------
function toEngineState(imported) {
  const ext = { ...(imported.external_levels || {}) };
  // App.jsx Geoduck gate (App.jsx line 139): zero level 8 if geoduck not unlocked.
  ext[8] = imported.geoduck_unlocked ? (ext[8] || 0) : 0;
  return {
    asc1_unlocked: !!imported.asc1_unlocked,
    asc2_unlocked: !!imported.asc2_unlocked,
    arch_level: parseInt(imported.arch_level) || 1,
    current_max_floor: parseInt(imported.current_max_floor) || 1,
    hades_idol_level: parseInt(ext[21]) || 0,
    // Stored as percent string ("40.74"); engine wants decimal (0.4074).
    arch_ability_infernal_bonus: parseFloat(imported.arch_ability_infernal_bonus || 0) / 100.0,
    total_infernal_cards: parseInt(imported.total_infernal_cards) || 0,
    starting_speed_pool: parseInt(imported.starting_speed_pool) || 0,
    base_stats: { ...imported.base_stats },
    upgrade_levels: { ...imported.upgrade_levels },
    external_levels: ext,
    cards: { ...imported.cards },
  };
}

// ---------------------------------------------------------------------------
async function main() {
  console.log(`Booting Pyodide ${PYODIDE_VERSION}...`);
  const pyodide = await loadPyodide();

  pyodide.FS.mkdir('core');
  pyodide.FS.mkdir('engine');
  const pyFiles = [
    'project_config.py',
    'core/player.py',
    'core/block.py',
    'core/skills.py',
    'engine/floor_map.py',
    'engine/combat_loop.py',
  ];
  for (const f of pyFiles) {
    pyodide.FS.writeFile(f, readFileSync(join(PY_DIR, f), 'utf8'));
  }

  await pyodide.runPythonAsync(PYTHON_SCRIPT);
  const sync_base_player = pyodide.globals.get('sync_base_player');
  const execute_simulation = pyodide.globals.get('execute_simulation');

  mkdirSync(OUT_DIR, { recursive: true });

  let gitSha;
  try {
    gitSha = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim();
  } catch {
    gitSha = 'unknown';
  }

  const manifest = {
    schema_version: 1,
    timestamp_utc: new Date().toISOString(),
    git_sha: gitSha,
    pyodide_version: PYODIDE_VERSION,
    node_version: process.version,
    base_seed: BASE_SEED,
    sims_per_save: SIMS_PER_SAVE,
    saves: [],
  };

  const saveFiles = readdirSync(SAVES_DIR).filter(f => f.endsWith('.json')).sort();
  console.log(`Found ${saveFiles.length} saves. Running ${SIMS_PER_SAVE} sims each (seeds ${BASE_SEED}..${BASE_SEED + SIMS_PER_SAVE - 1}).`);
  console.log();

  const overallStart = Date.now();

  for (const saveFile of saveFiles) {
    const raw = readFileSync(join(SAVES_DIR, saveFile), 'utf8');
    const saveJson = JSON.parse(raw);
    const imported = loadStateFromJson(defaultState(), saveJson);
    const engineState = toEngineState(imported);

    const enginePy = pyodide.toPy(engineState);
    sync_base_player(enginePy);
    enginePy.destroy();

    const sims = [];
    const t0 = Date.now();

    for (let i = 0; i < SIMS_PER_SAVE; i++) {
      const seed = BASE_SEED + i;
      const proxy = execute_simulation({}, {}, {}, {}, seed);
      const result = proxy.toJs({ dict_converter: Object.fromEntries });
      proxy.destroy();
      sims.push({ seed, result });

      if ((i + 1) % PROGRESS_EVERY === 0 || i + 1 === SIMS_PER_SAVE) {
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        process.stdout.write(`\r  ${saveFile}: ${i + 1}/${SIMS_PER_SAVE} sims (${elapsed}s)`);
      }
    }

    const durationMs = Date.now() - t0;
    process.stdout.write('\n');

    const out = {
      schema_version: 1,
      save_file: saveFile,
      save_sha256: createHash('sha256').update(raw).digest('hex'),
      save_state: engineState,
      sims,
    };
    // Gzip the per-save baselines — stamina traces dominate size and JSON
    // compresses ~5-7x. Consumers (the future JS-port comparison harness)
    // decompress with a single zlib.gunzipSync() call.
    writeFileSync(join(OUT_DIR, saveFile + '.gz'), gzipSync(JSON.stringify(out), { level: 9 }));

    manifest.saves.push({
      save_file: saveFile,
      output_file: saveFile + '.gz',
      duration_ms: durationMs,
      sim_count: SIMS_PER_SAVE,
    });
  }

  writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

  const totalSec = ((Date.now() - overallStart) / 1000).toFixed(1);
  console.log(`\n✓ ${saveFiles.length} saves × ${SIMS_PER_SAVE} sims complete in ${totalSec}s`);
  console.log(`  Output: ${OUT_DIR}`);
}

main().catch(err => {
  console.error('Harness failed:', err);
  process.exit(1);
});
