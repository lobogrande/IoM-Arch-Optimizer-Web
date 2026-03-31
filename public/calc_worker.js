// public/calc_worker.js
importScripts("https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js");

let pyodide;

async function initCalcEngine() {
    pyodide = await loadPyodide();
    pyodide.FS.mkdir("core");

    async function fetchAndWrite(filepath) {
        const response = await fetch('/' + filepath);
        const text = await response.text();
        pyodide.FS.writeFile(filepath, text);
    }

    await fetchAndWrite("project_config.py");
    await fetchAndWrite("core/player.py");
    await fetchAndWrite("core/block.py");

    // Pre-compile the Python function that maps our JS data into the Player object
    await pyodide.runPythonAsync(`
import sys
from core.player import Player

def calculate_all_stats(js_data):
    p = Player()
    data = js_data.to_py() # Convert Javascript object to Python dictionary
    
    # Inject Settings
    p.asc1_unlocked = data.get('asc1_unlocked', True)
    p.asc2_unlocked = data.get('asc2_unlocked', False)
    p.arch_level = data.get('arch_level', 1)
    p.hades_idol_level = data.get('hades_idol_level', 0)
    p.arch_ability_infernal_bonus = data.get('arch_ability_infernal_bonus', 0.0)
    p.total_infernal_cards = data.get('total_infernal_cards', 0)
    
    # Inject Dictionaries
    p.base_stats = data.get('base_stats', {})
    p.external_levels = data.get('external_levels', {})
    p.cards = data.get('cards', {})
    
    # Set Internal Upgrades natively
    upgrades = data.get('upgrade_levels', {})
    for k, v in upgrades.items():
        p.set_upgrade_level(int(k), v)
    
    # Extract all calculated @property values
    return {
        "max_sta": p.max_sta,
        "damage": p.damage,
        "armor_pen": p.armor_pen,
        "crit_chance": p.crit_chance,
        "crit_dmg_mult": p.crit_dmg_mult,
        "super_crit_chance": p.super_crit_chance,
        "super_crit_dmg_mult": p.super_crit_dmg_mult,
        "ultra_crit_chance": p.ultra_crit_chance,
        "ultra_crit_dmg_mult": p.ultra_crit_dmg_mult,
        "exp_gain_mult": p.exp_gain_mult,
        "frag_loot_gain_mult": p.frag_loot_gain_mult,
        "exp_mod_chance": p.exp_mod_chance,
        "exp_mod_gain": p.exp_mod_gain,
        "loot_mod_chance": p.loot_mod_chance,
        "loot_mod_gain": p.loot_mod_gain,
        "speed_mod_chance": p.speed_mod_chance,
        "speed_mod_gain": p.speed_mod_gain,
        "stamina_mod_chance": p.stamina_mod_chance,
        "stamina_mod_gain": p.stamina_mod_gain,
        "crosshair_auto_tap": p.crosshair_auto_tap,
        "gold_crosshair_chance": p.gold_crosshair_chance,
        "gold_crosshair_mult": p.gold_crosshair_mult,
        "ability_insta_charge": p.ability_insta_charge,
        "enrage_charges": p.enrage_charges,
        "enrage_cooldown": p.enrage_cooldown,
        "enrage_bonus_dmg": p.enrage_bonus_dmg,
        "enraged_damage": p.enraged_damage,
        "enrage_bonus_crit_dmg": p.enrage_bonus_crit_dmg,
        "enraged_crit_dmg_mult": p.enraged_crit_dmg_mult,
        "flurry_duration": p.flurry_duration,
        "flurry_cooldown": p.flurry_cooldown,
        "flurry_sta_on_cast": p.flurry_sta_on_cast,
        "quake_attacks": p.quake_attacks,
        "quake_cooldown": p.quake_cooldown,
        "quake_dmg_to_all": p.quake_dmg_to_all,
        "gleaming_floor_chance": p.gleaming_floor_chance,
        "gleaming_floor_multi": p.gleaming_floor_multi,
        "infernal_multiplier": p.infernal_multiplier
    }
    `);

    postMessage({ type: 'READY' });
}

initCalcEngine().catch(err => postMessage({ type: 'ERROR', payload: err.message }));

self.onmessage = async function(e) {
    if (e.data.command === 'CALC_STATS') {
        try {
            // Pass the data to Python and execute the calculation
            pyodide.globals.set("js_data", e.data.payload);
            const resultProxy = await pyodide.runPythonAsync("calculate_all_stats(js_data)");
            
            // Convert the Python dictionary back to a standard Javascript object
            const result = resultProxy.toJs({ dict_converter: Object.fromEntries });
            resultProxy.destroy(); // Free memory
            
            postMessage({ type: 'CALC_RESULT', payload: result });
        } catch (err) {
            postMessage({ type: 'ERROR', payload: err.message });
        }
    }
};
