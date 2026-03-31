// Import Pyodide from the global CDN
importScripts("https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js");

let pyodide;

async function initEngine() {
    postMessage({ type: 'LOG', payload: 'Downloading Pyodide (Python for WebAssembly)...' });
    pyodide = await loadPyodide();
    
    postMessage({ type: 'LOG', payload: 'Creating Virtual File System...' });
    pyodide.FS.mkdir("core");
    pyodide.FS.mkdir("engine");

    // Helper function to fetch your local .py files and save them into Pyodide's RAM
    async function fetchAndWrite(filepath) {
        postMessage({ type: 'LOG', payload: `Mounting ${filepath}...` });
        const response = await fetch(filepath);
        if (!response.ok) throw new Error(`Failed to load ${filepath}`);
        const text = await response.text();
        pyodide.FS.writeFile(filepath, text);
    }

    // Mount our architecture
    await fetchAndWrite("project_config.py");
    await fetchAndWrite("core/player.py");
    await fetchAndWrite("core/block.py");
    await fetchAndWrite("core/skills.py");
    await fetchAndWrite("engine/floor_map.py");
    await fetchAndWrite("engine/combat_loop.py");

    postMessage({ type: 'READY' });
}

initEngine().catch(err => postMessage({ type: 'ERROR', payload: err.message }));

// Listen for the "Run" command from the UI
self.onmessage = async function(e) {
    if (e.data.command === 'RUN_SIM') {
        try {
            // Write a tiny Python script on the fly to execute your engine
            const pythonScript = `
import sys
from core.player import Player
from engine.combat_loop import CombatSimulator

# Initialize Player with some baseline stats
p = Player()
p.base_stats['Str'] = 25
p.base_stats['Luck'] = 15
p.asc1_unlocked = True

# Run the engine!
sim = CombatSimulator(p)
state = sim.run_simulation()

# Return the result as a simple dictionary
{"highest_floor": state.highest_floor, "total_time": state.total_time}
            `;
            
            postMessage({ type: 'LOG', payload: 'Executing Python Monte Carlo Loop...' });
            
            // Run the Python code and convert the result back to Javascript!
            const resultProxy = await pyodide.runPythonAsync(pythonScript);
            const result = resultProxy.toJs();
            resultProxy.destroy(); // Free up memory
            
            postMessage({ type: 'RESULT', payload: { highest_floor: result.get('highest_floor') } });
            
        } catch (err) {
            postMessage({ type: 'ERROR', payload: err.message });
        }
    }
};
