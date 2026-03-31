// public/engine_worker.js

// 1. Tell the React App this core is booting up
postMessage({ type: 'STATUS', payload: 'Booting Core...' });

importScripts("https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js");

let pyodide;

async function initEngine() {
    pyodide = await loadPyodide();
    
    // Create the virtual folder structure
    pyodide.FS.mkdir("core");
    pyodide.FS.mkdir("engine");

    // Helper to fetch local Python files from the public folder and mount them into Pyodide RAM
    async function fetchAndWrite(filepath) {
        const response = await fetch('/' + filepath);
        const text = await response.text();
        pyodide.FS.writeFile(filepath, text);
    }

    // Mount your exact Python architecture!
    await fetchAndWrite("project_config.py");
    await fetchAndWrite("core/player.py");
    await fetchAndWrite("core/block.py");
    await fetchAndWrite("core/skills.py");
    await fetchAndWrite("engine/floor_map.py");
    await fetchAndWrite("engine/combat_loop.py");

    postMessage({ type: 'READY' });
}

initEngine().catch(err => postMessage({ type: 'ERROR', payload: err.message }));

// Listen for tasks from the React UI
self.onmessage = async function(e) {
    if (e.data.command === 'RUN_TASK') {
        const { taskId, buildStats } = e.data;
        
        try {
            // We dynamically inject the stats React gives us into your Python simulator!
            const pythonScript = `
import sys
from core.player import Player
from engine.combat_loop import CombatSimulator

p = Player()
p.asc1_unlocked = True

# Inject the stats from Javascript
p.base_stats['Str'] = ${buildStats.Str || 0}
p.base_stats['Agi'] = ${buildStats.Agi || 0}
p.base_stats['Per'] = ${buildStats.Per || 0}
p.base_stats['Int'] = ${buildStats.Int || 0}
p.base_stats['Luck'] = ${buildStats.Luck || 0}
p.base_stats['Div'] = ${buildStats.Div || 0}

sim = CombatSimulator(p)
state = sim.run_simulation()

# Return the highest floor reached to Javascript
state.highest_floor
            `;
            
            const highest_floor = await pyodide.runPythonAsync(pythonScript);
            
            // Send the result back to React!
            postMessage({ type: 'RESULT', taskId: taskId, result: highest_floor });
            
        } catch (err) {
            postMessage({ type: 'ERROR', payload: err.message });
        }
    }
};
