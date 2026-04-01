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
    p.arch_level = int(data.get('arch_level', 1))
    p.current_max_floor = int(data.get('current_max_floor', 1))
    p.hades_idol_level = int(data.get('hades_idol_level', 0))
    p.arch_ability_infernal_bonus = float(data.get('arch_ability_infernal_bonus', 0.0))
    p.total_infernal_cards = int(data.get('total_infernal_cards', 0))
    
    # Inject Dictionaries
    p.base_stats = data.get('base_stats', {})
    
    # Set External Upgrades natively (JS object keys are strings, must cast to int)
    ext_levels = data.get('external_levels', {})
    for k, v in ext_levels.items():
        p.set_external_level(int(k), v)
        
    # Set Cards natively
    cards_in = data.get('cards', {})
    for k, v in cards_in.items():
        p.set_card_level(k, v)
    
    # Set Internal Upgrades natively
    upgrades = data.get('upgrade_levels', {})
    for k, v in upgrades.items():
        p.set_upgrade_level(int(k), v)
        
    target_floor = int(data.get('compendium_target_floor', p.current_max_floor))
    
    from core.block import Block
    import project_config as cfg
    
    blocks_data =[]
    FRAG_NAMES = {0: "Dirt", 1: "Common", 2: "Rare", 3: "Epic", 4: "Legendary", 5: "Mythic", 6: "Divine"}
    
    # Calculate True Nested Crit Probabilities & Compound Multipliers for EDPS
    import math
    t_reg = 1.0 - p.crit_chance
    t_crit = p.crit_chance * (1.0 - p.super_crit_chance)
    t_scrit = p.crit_chance * p.super_crit_chance * (1.0 - p.ultra_crit_chance)
    t_ucrit = p.crit_chance * p.super_crit_chance * p.ultra_crit_chance

    c_crit = p.crit_dmg_mult
    c_scrit = c_crit * p.super_crit_dmg_mult
    c_ucrit = c_scrit * p.ultra_crit_dmg_mult

    c_enr_crit = p.enraged_crit_dmg_mult
    c_enr_scrit = c_enr_crit * p.super_crit_dmg_mult
    c_enr_ucrit = c_enr_scrit * p.ultra_crit_dmg_mult

    avg_mult = t_reg*1.0 + t_crit*c_crit + t_scrit*c_scrit + t_ucrit*c_ucrit
    avg_enr_mult = t_reg*1.0 + t_crit*c_enr_crit + t_scrit*c_enr_scrit + t_ucrit*c_enr_ucrit

    for block_id, base in cfg.BLOCK_BASE_STATS.items():
        if block_id.startswith('div') and not p.asc1_unlocked: continue
        if block_id.endswith('4') and not p.asc2_unlocked: continue
        
        b = Block(block_id, target_floor, p)
        eff_armor = max(0, b.armor - p.armor_pen)

        # Hit Math
        reg_hit = max(1.0, p.damage - eff_armor)
        enr_hit = max(1.0, p.enraged_damage - eff_armor)

        edps = reg_hit * avg_mult
        enr_edps = enr_hit * avg_enr_mult

        max_sta = math.ceil(b.hp / reg_hit)
        avg_sta = math.ceil(b.hp / edps)
        max_enr_sta = math.ceil(b.hp / enr_hit)
        avg_enr_sta = math.ceil(b.hp / enr_edps)
        
        blocks_data.append({
            "id": block_id,
            "name": block_id.capitalize(),
            "tier": int(block_id[-1]) if block_id[-1].isdigit() else 1,
            "frag_name": FRAG_NAMES.get(base.get('ft', 0), "Unknown"),
            "base_hp": base['hp'],
            "base_armor": base['a'],
            "base_xp": base['xp'],
            "base_frag": base['fa'],
            "mod_hp": b.hp,
            "mod_eff_armor": eff_armor,
            "mod_armor": b.armor,
            "mod_xp": b.xp,
            "mod_frag": b.frag_amt,
            "edps": edps,
            "enr_edps": enr_edps,
            "reg_hit": reg_hit,
            "crit": reg_hit * c_crit,
            "scrit": reg_hit * c_scrit,
            "ucrit": reg_hit * c_ucrit,
            "max_hits": max_sta,
            "avg_hits": avg_sta,
            "enr_hit": enr_hit,
            "enr_crit": enr_hit * c_enr_crit,
            "enr_scrit": enr_hit * c_enr_scrit,
            "enr_ucrit": enr_hit * c_enr_ucrit,
            "enr_max_hits": max_enr_sta,
            "enr_avg_hits": avg_enr_sta
        })
        
    inf_keys =["rare2", "div1", "leg3", "rare3", "epic3", "com1", "com2", "com3", "epic2", "dirt2", "dirt3", "leg1", "dirt1", "rare1", "epic1", "leg2", "myth2", "myth3", "div3"]
    inf_bonuses = {k: p.inf(k) for k in inf_keys}

    # Extract all calculated @property values
    return {
        "blocks_data": blocks_data,
        "inf_bonuses": inf_bonuses,
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

// Save the initialization to a Promise so the message listener can wait for it!
const initPromise = initCalcEngine().catch(err => postMessage({ type: 'ERROR', payload: err.message }));

self.onmessage = async function(e) {
    if (e.data.command === 'CALC_STATS' || e.data.command === 'CALC_SANDBOX') {
        try {
            await initPromise;
            
            pyodide.globals.set("js_data", e.data.payload);
            const resultProxy = await pyodide.runPythonAsync("calculate_all_stats(js_data)");
            
            const result = resultProxy.toJs({ dict_converter: Object.fromEntries });
            resultProxy.destroy(); 
            
            // Pass back a flag so React knows if this was a Global or Sandbox calculation
            postMessage({ 
                type: e.data.command === 'CALC_STATS' ? 'CALC_RESULT' : 'SANDBOX_RESULT', 
                payload: result 
            });
        } catch (err) {
            postMessage({ type: 'ERROR', payload: err.message });
        }
    }
};