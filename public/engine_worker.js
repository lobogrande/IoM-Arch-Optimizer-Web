// public/engine_worker.js

// Parse params before any importScripts so we can decide whether to pay the
// (large, ~5 MB) cost of fetching the Pyodide runtime.
const urlParams = new URLSearchParams(self.location.search);
const APP_VERSION = urlParams.get('v') || Date.now();
const wasmOnlyMode = urlParams.get('engine') === 'wasm';

postMessage({ type: 'STATUS', payload: wasmOnlyMode ? 'Booting WASM...' : 'Booting Core...' });

// Pyodide is only loaded for the Python engine path.  When the pool spawns
// us with engine=wasm we skip it entirely — saves ~5 MB of CDN download +
// ~3 s of interpreter warm-up per worker.
if (!wasmOnlyMode) {
    importScripts("https://cdn.jsdelivr.net/pyodide/v0.29.4/full/pyodide.js");
}

// Small JS deps — always loaded.  Combined ~10 KB; their cost is negligible.
importScripts('/combat_kernel.js?v=' + APP_VERSION);
importScripts('/wasm_state_codec.js?v=' + APP_VERSION);

let pyodide;
let run_sim;
let sync_player;

async function initEngine() {
    pyodide = await loadPyodide();

    pyodide.FS.mkdir("core");
    pyodide.FS.mkdir("engine");

    async function fetchAndWrite(filepath) {
        const response = await fetch('/' + filepath + '?v=' + APP_VERSION);
        const text = await response.text();
        pyodide.FS.writeFile(filepath, text);
    }

    await fetchAndWrite("project_config.py");
    await fetchAndWrite("core/player.py");
    await fetchAndWrite("core/block.py");
    await fetchAndWrite("core/skills.py");
    await fetchAndWrite("engine/floor_map.py");
    await fetchAndWrite("engine/combat_loop.py");

    const pythonScript = `
import sys
from core.player import Player
from engine.combat_loop import CombatSimulator

base_player = None

def sync_base_player(state_proxy):
    global base_player
    state_dict = state_proxy.to_py()
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

import random

def execute_simulation(test_stats_proxy, test_upgrades_proxy, test_external_proxy, test_cards_proxy, rng_seed=None, js_kernel=None, js_rng=None):
    global base_player

    # rng_seed=None: entropy seed (default — preserves Monte Carlo variance).
    # rng_seed=int : seeded Mersenne Twister for reproducible runs. Used to compare
    #                current Python output against a future JS-ported kernel.
    #
    # Try/except handles both Python None AND Pyodide 0.29+ JsNull (which is
    # what JS null becomes on the Python side). 'is None' returns False for
    # JsNull, but int(JsNull) raises TypeError, so we can branch on that.
    try:
        random.seed(int(rng_seed))
    except (TypeError, ValueError):
        random.seed()

    # js_kernel / js_rng: when both provided, the inner combat micro-tick is
    # routed through public/combat_kernel.js. Off by default; the Python loop
    # remains the source of truth.

    # fast_clone is ~10x faster than copy.deepcopy and produces an
    # equivalent independent Player for applying the test overrides below.
    p = base_player.fast_clone()
    
    test_stats = test_stats_proxy.to_py()
    for k, v in test_stats.items():
        p.base_stats[str(k)] = int(v)
        
    test_upgrades = test_upgrades_proxy.to_py()
    if test_upgrades:
        for k, v in test_upgrades.items():
            p.set_upgrade_level(int(k), int(v))
            
    test_external = test_external_proxy.to_py()
    if test_external:
        for k, v in test_external.items():
            if int(k) == 21:
                p.hades_idol_level = int(v)
            else:
                p.set_external_level(int(k), int(v))
                
    test_cards = test_cards_proxy.to_py()
    if test_cards:
        for k, v in test_cards.items():
            p.set_card_level(str(k), int(v))
            
    sim = CombatSimulator(p, js_kernel=js_kernel, js_rng=js_rng)
    result = sim.run_simulation()
    
    # Calculate Arch Minutes based on True In-Game Time for accurate real-time yield projection
    arch_mins = result.total_time / 60.0 if result.total_time > 0 else 1.0
    
    metrics = {
        "highest_floor": result.highest_floor,
        "xp_per_min": result.total_xp / arch_mins,
        "blocks_per_min": result.blocks_mined / arch_mins,
        "total_time": result.total_time,
        "stamina_trace_floor": result.history['floor'],
        "stamina_trace_stamina": result.history['stamina'],
        
        # Telemetry Dumps
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
        "speed_pool_delta_per_min": (result.speed_pool - p.starting_speed_pool) / arch_mins
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
    
    await pyodide.runPythonAsync(pythonScript);
    run_sim = pyodide.globals.get('execute_simulation');
    sync_player = pyodide.globals.get('sync_base_player');

    postMessage({ type: 'READY' });
}

if (wasmOnlyMode) {
    // No Pyodide path — signal ready as soon as the small JS deps loaded.
    // Tasks that hit the Pyodide branch in this mode will throw.
    postMessage({ type: 'READY' });
} else {
    initEngine().catch(err => postMessage({ type: 'ERROR', payload: err.message }));
}

// --- WASM engine (lazy-loaded on first use_wasm_engine task) ---------------
let wasmExports = null;
let wasmLoadPromise = null;
function loadWasmEngine() {
    if (wasmExports) return Promise.resolve(wasmExports);
    if (wasmLoadPromise) return wasmLoadPromise;
    wasmLoadPromise = (async () => {
        const res = await fetch('/engine.wasm?v=' + APP_VERSION);
        const buf = await res.arrayBuffer();
        const { instance } = await WebAssembly.instantiate(buf, {});
        if (instance.exports.engine_schema_version() !== self.IoMWasmStateCodec.SCHEMA_VERSION) {
            throw new Error('engine.wasm schema mismatch: '
                + 'wasm=' + instance.exports.engine_schema_version()
                + ' codec=' + self.IoMWasmStateCodec.SCHEMA_VERSION);
        }
        wasmExports = instance.exports;
        return wasmExports;
    })();
    return wasmLoadPromise;
}

// Last engine_state seen via SYNC_STATE.  WASM sims clone it + apply per-task
// overrides; Pyodide path uses base_player (synced on the Python side).
let lastSyncedState = null;

/** Apply test_* overrides to a shallow-cloned engine_state. */
function applyOverrides(base, test_stats, test_upgrades, test_external, test_cards) {
    const out = {
        ...base,
        base_stats: { ...base.base_stats },
        upgrade_levels: { ...base.upgrade_levels },
        external_levels: { ...base.external_levels },
        cards: { ...base.cards },
    };
    if (test_stats) {
        for (const k in test_stats) out.base_stats[k] = test_stats[k];
    }
    if (test_upgrades) {
        for (const k in test_upgrades) out.upgrade_levels[k] = test_upgrades[k];
    }
    if (test_external) {
        // External row 21 is special — Player.set_external_level(21, lvl) also
        // sets player.hades_idol_level, so we mirror that here.
        for (const k in test_external) {
            if (parseInt(k, 10) === 21) {
                out.hades_idol_level = test_external[k];
            }
            out.external_levels[k] = test_external[k];
        }
    }
    if (test_cards) {
        for (const k in test_cards) out.cards[k] = test_cards[k];
    }
    return out;
}

async function runWasmSim({ test_stats, test_upgrades, test_external, test_cards, rng_seed }) {
    const exports = await loadWasmEngine();
    const codec = self.IoMWasmStateCodec;
    if (!lastSyncedState) {
        throw new Error('WASM sim called before SYNC_STATE');
    }

    const state = applyOverrides(lastSyncedState, test_stats, test_upgrades, test_external, test_cards);

    const inputBytes = codec.packPlayerState(state);
    const inputPtr = exports.engine_alloc(codec.INPUT_SIZE);
    new Uint8Array(exports.memory.buffer, inputPtr, codec.INPUT_SIZE).set(inputBytes);

    const seed = rng_seed != null
        ? (rng_seed >>> 0)
        : (Math.floor(Math.random() * 0xFFFFFFFF) >>> 0);

    const resultPtr = exports.engine_run_simulation(inputPtr, codec.INPUT_SIZE, seed);
    if (resultPtr === 0) {
        exports.engine_free(inputPtr, codec.INPUT_SIZE);
        throw new Error('engine_run_simulation returned null (deserialize failed)');
    }
    const resultLen = exports.engine_last_result_len();
    const result = codec.decodeResult(exports.memory, resultPtr, resultLen, state.starting_speed_pool | 0);

    exports.engine_free(inputPtr, codec.INPUT_SIZE);
    return result;
}

self.onmessage = function(e) {
    if (e.data.command === 'SYNC_STATE') {
        try {
            // Always stash for the WASM path (lazy-cloned per RUN_TASK).
            lastSyncedState = e.data.state_dict;
            // In wasmOnlyMode there's no Pyodide to sync into — the JS-side
            // stash above is the entire state of the world.
            if (!wasmOnlyMode) {
                sync_player(e.data.state_dict);
            }
            postMessage({ type: 'SYNC_COMPLETE', syncId: e.data.syncId });
        } catch (err) {
            postMessage({ type: 'ERROR', payload: err.message });
        }
    } else if (e.data.command === 'RUN_TASK') {
        const { taskId, test_stats, test_upgrades, test_external, test_cards, rng_seed, use_js_kernel, use_wasm_engine } = e.data;
        try {
            // Priority: WASM engine > Pyodide+JS kernel > Pyodide-only
            if (use_wasm_engine) {
                runWasmSim({ test_stats, test_upgrades, test_external, test_cards, rng_seed })
                    .then(result => postMessage({ type: 'RESULT', taskId: taskId, payload: result }))
                    .catch(err => postMessage({ type: 'ERROR', taskId: taskId, payload: err.message }));
                return;
            }
            if (wasmOnlyMode) {
                // Pool was spawned with engine=wasm but the task didn't ask for
                // WASM.  Pyodide isn't loaded — surface this as a clear error
                // rather than a TypeError on `run_sim`.
                postMessage({ type: 'ERROR', taskId, payload: 'Worker spawned in WASM-only mode, but task did not set use_wasm_engine. Toggle the WASM checkbox before running, or reload to spawn a Pyodide-capable pool.' });
                return;
            }
            // rng_seed: null/undefined = entropy; integer = deterministic Mersenne Twister
            // use_js_kernel: when true AND a seed is set, route the inner micro-tick through
            // self.IoMCombatKernel (public/combat_kernel.js). When seed is null we still allow
            // it — kernel uses Date.now() as fallback so the run is still self-deterministic.
            let js_kernel = null, js_rng = null;
            if (use_js_kernel && self.IoMCombatKernel) {
                js_kernel = self.IoMCombatKernel;
                js_rng = self.IoMCombatKernel.createRng(
                    rng_seed != null ? rng_seed : (Date.now() & 0xFFFFFFFF)
                );
            }
            const resultProxy = run_sim(test_stats, test_upgrades || {}, test_external || {}, test_cards || {}, rng_seed ?? null, js_kernel, js_rng);
            const result = resultProxy.toJs({ dict_converter: Object.fromEntries });
            resultProxy.destroy();
            postMessage({ type: 'RESULT', taskId: taskId, payload: result });
        } catch (err) {
            postMessage({ type: 'ERROR', taskId: taskId, payload: err.message });
        }
    }
};