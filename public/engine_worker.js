// public/engine_worker.js

postMessage({ type: 'STATUS', payload: 'Booting Core...' });

importScripts("https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js");

let pyodide;
let run_sim; 
let sync_player;

async function initEngine() {
    pyodide = await loadPyodide();
    
    pyodide.FS.mkdir("core");
    pyodide.FS.mkdir("engine");

    async function fetchAndWrite(filepath) {
        const response = await fetch('/' + filepath);
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
import copy
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

def execute_simulation(test_stats_proxy, test_upgrades_proxy):
    global base_player
    
    # Ensure true RNG variance across persistent Pyodide worker tasks
    random.seed()
    
    # Blazing fast memory clone prevents re-parsing the giant JS dictionary!
    p = copy.deepcopy(base_player)
    
    test_stats = test_stats_proxy.to_py()
    for k, v in test_stats.items():
        p.base_stats[str(k)] = int(v)
        
    test_upgrades = test_upgrades_proxy.to_py()
    if test_upgrades:
        for k, v in test_upgrades.items():
            p.set_upgrade_level(int(k), int(v))
            
    sim = CombatSimulator(p)
    result = sim.run_simulation()
    
    runtime_mins = result.total_time / 60.0 if result.total_time > 0 else 1.0
    
    metrics = {
        "highest_floor": result.highest_floor,
        "xp_per_min": result.total_xp / runtime_mins,
        "blocks_per_min": result.blocks_mined / runtime_mins,
        "total_time": result.total_time,
        "stamina_trace_floor": result.history['floor'],
        "stamina_trace_stamina": result.history['stamina']
    }
    
    for frag_tier, amt in result.total_frags.items():
        metrics[f"frag_{frag_tier}_per_min"] = amt / runtime_mins
        
    if hasattr(result, 'specific_blocks_mined'):
        for block_id, count in result.specific_blocks_mined.items():
            metrics[f"block_{block_id}_per_min"] = count / runtime_mins
            
    return metrics
    `;
    
    await pyodide.runPythonAsync(pythonScript);
    run_sim = pyodide.globals.get('execute_simulation');
    sync_player = pyodide.globals.get('sync_base_player');

    postMessage({ type: 'READY' });
}

initEngine().catch(err => postMessage({ type: 'ERROR', payload: err.message }));

self.onmessage = function(e) {
    if (e.data.command === 'SYNC_STATE') {
        try {
            sync_player(e.data.state_dict);
            postMessage({ type: 'SYNC_COMPLETE', syncId: e.data.syncId });
        } catch (err) {
            postMessage({ type: 'ERROR', payload: err.message });
        }
    } else if (e.data.command === 'RUN_TASK') {
        const { taskId, test_stats, test_upgrades } = e.data;
        try {
            const resultProxy = run_sim(test_stats, test_upgrades || {});
            const result = resultProxy.toJs({ dict_converter: Object.fromEntries });
            resultProxy.destroy(); 
            postMessage({ type: 'RESULT', taskId: taskId, payload: result });
        } catch (err) {
            postMessage({ type: 'ERROR', payload: err.message });
        }
    }
};