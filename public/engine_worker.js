// public/engine_worker.js

postMessage({ type: 'STATUS', payload: 'Booting Core...' });

importScripts("https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js");

let pyodide;
let run_sim; // Persistent reference to the compiled Python function

async function initEngine() {
    pyodide = await loadPyodide();
    
    // Create the virtual folder structure
    pyodide.FS.mkdir("core");
    pyodide.FS.mkdir("engine");

    async function fetchAndWrite(filepath) {
        const response = await fetch('/' + filepath);
        const text = await response.text();
        pyodide.FS.writeFile(filepath, text);
    }

    // Mount the architecture
    await fetchAndWrite("project_config.py");
    await fetchAndWrite("core/player.py");
    await fetchAndWrite("core/block.py");
    await fetchAndWrite("core/skills.py");
    await fetchAndWrite("engine/floor_map.py");
    await fetchAndWrite("engine/combat_loop.py");

    // Pre-compile the simulation function into Pyodide's memory.
    // This entirely eliminates Python compilation overhead during the tight loops.
    const pythonScript = `
import sys
from core.player import Player
from engine.combat_loop import CombatSimulator

def execute_simulation(state_proxy, test_stats_proxy):
    # Convert Pyodide JsProxy objects to native Python dicts
    state_dict = state_proxy.to_py()
    test_stats = test_stats_proxy.to_py()
    
    p = Player()
    
    # 1. Map Global Settings
    p.asc1_unlocked = state_dict.get('asc1_unlocked', False)
    p.asc2_unlocked = state_dict.get('asc2_unlocked', False)
    p.arch_level = int(state_dict.get('arch_level', 1))
    p.current_max_floor = int(state_dict.get('current_max_floor', 1))
    p.hades_idol_level = int(state_dict.get('hades_idol_level', 0))
    p.arch_ability_infernal_bonus = float(state_dict.get('arch_ability_infernal_bonus', 0.0))
    p.total_infernal_cards = int(state_dict.get('total_infernal_cards', 0))
    
    # Base stats mapping
    for k, v in state_dict.get('base_stats', {}).items():
        p.base_stats[str(k)] = int(v)
    
    # 2. Map Upgrades & Cards (Explicitly casting JS string keys back to Python Integers!)
    for k, v in state_dict.get('upgrade_levels', {}).items():
        p.set_upgrade_level(int(k), int(v))
    for k, v in state_dict.get('external_levels', {}).items():
        p.set_external_level(int(k), int(v))
    for k, v in state_dict.get('cards', {}).items():
        p.set_card_level(str(k), int(v))
        
    # 3. Inject the specific stat distribution being tested by the grid search
    for k, v in test_stats.items():
        p.base_stats[str(k)] = int(v)
        
    # 4. Run the Engine
    sim = CombatSimulator(p)
    result = sim.run_simulation()
    
    runtime_mins = result.total_time / 60.0 if result.total_time > 0 else 1.0
    
    metrics = {
        "highest_floor": result.highest_floor,
        "xp_per_min": result.total_xp / runtime_mins,
        "blocks_per_min": result.blocks_mined / runtime_mins,
        "total_time": result.total_time
    }
    
    for frag_tier, amt in result.total_frags.items():
        metrics[f"frag_{frag_tier}_per_min"] = amt / runtime_mins
        
    if hasattr(result, 'specific_blocks_mined'):
        for block_id, count in result.specific_blocks_mined.items():
            metrics[f"block_{block_id}_per_min"] = count / runtime_mins
            
    # Include stamina trace for the dashboard profiling runs
    metrics["stamina_trace_floor"] = result.history['floor']
    metrics["stamina_trace_stamina"] = result.history['stamina']
            
    return metrics
    `;
    
    await pyodide.runPythonAsync(pythonScript);
    run_sim = pyodide.globals.get('execute_simulation');

    postMessage({ type: 'READY' });
}

initEngine().catch(err => postMessage({ type: 'ERROR', payload: err.message }));

self.onmessage = function(e) {
    if (e.data.command === 'RUN_TASK') {
        const { taskId, state_dict, test_stats } = e.data;
        
        try {
            // Call the pre-compiled Python function
            const resultProxy = run_sim(state_dict, test_stats);
            
            // Convert Python dict back to JS Object
            const result = resultProxy.toJs({ dict_converter: Object.fromEntries });
            
            // Destroy proxies to prevent memory leaks in the tight loops!
            resultProxy.destroy(); 
            
            postMessage({ type: 'RESULT', taskId: taskId, payload: result });
            
        } catch (err) {
            postMessage({ type: 'ERROR', payload: err.message });
        }
    }
};