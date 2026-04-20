// src/components/CalculatedStats.jsx
import { useState } from 'react';
import useStore from '../store';
import { UPGRADE_NAMES, EXTERNAL_UI_GROUPS, INFERNAL_CARD_BONUSES } from '../game_data';

export default function CalculatedStats() {
  const { asc1_unlocked, asc2_unlocked, current_max_floor, base_stats, upgrade_levels, external_levels, cards, calculated_stats, arch_ability_infernal_bonus, total_infernal_cards } = useStore();
  const[ troubleshootStat, setTroubleshootStat ] = useState("");
  const[ showTroubleshooter, setShowTroubleshooter ] = useState(false);

  // Helper to safely format numbers and prevent NaN errors while Pyodide is booting
  const fmt = (val, decimals = 0) => {
    if (val === undefined || isNaN(val)) return "...";
    return Number(val).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">📋 Calculated Player Stats</h2>
      <p className="text-st-text-light mb-4">This is the exact mathematical output derived from your Base Stats, Upgrades, and Cards being fed into the Engine.</p>
      
      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-400 dark:border-blue-500 text-blue-800 dark:text-blue-200 rounded mb-6 text-sm shadow-sm">
        💡 <strong>Verification Step:</strong> The best way to ensure the AI gives you perfect results is to verify your inputs! Compare these numbers directly against the stats shown on your in-game Archaeology screen. If they match perfectly, your imported data is correct.
      </div>

      {/* --- STAT TROUBLESHOOTER EXPANDER --- */}
      <div className="st-container mb-6">
        <button 
          onClick={() => setShowTroubleshooter(!showTroubleshooter)}
          className="w-full flex justify-between items-center font-bold text-lg hover:text-st-orange transition-colors"
        >
          <span>
            🛠️ Stat Troubleshooter <span className="text-blue-600 dark:text-blue-400 text-sm md:text-base">(Click here if your UI numbers don't match the game!)</span>
          </span>
          <span>{showTroubleshooter ? '▼' : '▶'}</span>
        </button>
        
        {showTroubleshooter && (
          <div className="mt-4 pt-4 border-t border-st-border">
            <p className="text-sm mb-4">If a stat in the UI is <strong>higher</strong> than your game, you likely entered an upgrade level too high, allocated too many base stats, or forgot to account for an unequipped pet/skin. Select a mismatched stat below to pull up your <strong>exact current inputs</strong> for that formula:</p>
            
            <select 
              className="st-input w-full md:w-1/2 mb-6 text-left pl-4"
              value={troubleshootStat}
              onChange={(e) => setTroubleshootStat(e.target.value)}
            >
              <option value="">(Select a Stat...)</option>
              <option value="Max Stamina">Max Stamina</option>
              <option value="Damage">Damage</option>
              <option value="Armor Pen">Armor Pen</option>
              <option value="Crit Chances & Multipliers">Crit Chances & Multipliers</option>
              <option value="EXP & Fragment Gain">EXP & Fragment Gain</option>
              <option value="Mod Chances & Multipliers">Mod Chances & Multipliers</option>
              <option value="Crosshairs & Auto-Tap">Crosshairs & Auto-Tap</option>
              <option value="Abilities">Abilities (Instacharge / Cooldowns)</option>
              <option value="Ascension 2">Ascension 2 (Gleaming / Infernal)</option>
            </select>

            {troubleshootStat && (() => {
              // Enhanced map perfectly aligned to player.py
              const TROUBLESHOOT_MAP = {
                "Max Stamina": { settings:[ "current_max_floor" ], stats: [ "Agi", "Corr" ], upgs:[ 3, 14, 23, 26, 28, 39, 54 ], exts:[ "Block Bonker Skill" ], infs: [ "epic3", "leg4" ] },
                "Damage": { settings: [ "current_max_floor" ], stats:[ "Str", "Corr", "Div" ], upgs:[ 9, 15, 20, 25, 32, 34, 36, 47, 49, 51, 52 ], exts: [ "Block Bonker Skill" ], infs:[ "rare2", "div1" ] },
                "Armor Pen": { settings: [], stats: [ "Per", "Int" ], upgs:[ 10, 17, 29, 33, 36 ], exts:[], infs: [ "leg3", "rare3" ] },
                "Crit Chances & Multipliers": { settings: [], stats:[ "Luck", "Div", "Agi", "Str" ], upgs:[ 13, 18, 20, 30, 37, 40, 47, 49, 53 ], exts: [], infs:[ "com1", "com2", "com3", "epic2", "com4", "epic4" ] },
                "EXP & Fragment Gain": { settings:[], stats:[ "Int", "Per" ], upgs:[ 4, 11, 21, 28, 35, 42, 45, 51 ], exts:[ "Hestia Idol", "Axolotl Pet Quest Rank", "Geoduck Tribute", "Archaeology Bundle", "Ascension Bundle" ], infs:[ "dirt2", "dirt3", "leg1" ] },
                "Mod Chances & Multipliers": { settings: [], stats:[ "Luck", "Int", "Per", "Agi", "Corr" ], upgs:[ 5, 14, 16, 23, 24, 26, 33, 35, 38, 40, 43, 44, 50, 52, 53, 55 ], exts:[ "Ascension Bundle", "Block Bonker Skill" ], infs:[ "dirt1", "myth2", "myth3", "div3", "rare4", "div4" ] },
                "Crosshairs & Auto-Tap": { settings: [], stats:[ "Luck", "Div" ], upgs:[ 48, 54 ], exts: [ "Ascension Bundle" ], infs:[ "rare1", "epic1", "leg2" ] },
                "Abilities": { settings: [], stats:[], upgs:[ 18, 22, 29, 31, 32, 39, 50 ], exts:[ "Arch Ability Card", "Avada Keda- Skill" ], infs: [ "myth4" ] },
                "Ascension 2": { settings:[ "total_infernal_cards" ], stats: [], upgs:[ 19, 46 ], exts:[ "Hades Idol" ], infs:[ "myth1", "div2", "dirt4" ] }
              };
              
              const data = TROUBLESHOOT_MAP[troubleshootStat];
              if (!data) return null;

              // Helper function to calculate the visual contribution string!
              const getEffectStr = (type, key, val) => {
                if (val === 0) return "";

                // --- BASE STATS ---
                if (type === 'stat') {
                  if (troubleshootStat === "Max Stamina") {
                    if (key === 'Agi') {
                      const f26 = (upgrade_levels[26] || 0) * 1.0;
                      return `(+${val * (5 + f26)} Flat Max Sta)`;
                    }
                    if (key === 'Corr') return `(-${val * 3}% Max Sta Multi)`;
                  }
                  if (troubleshootStat === "Damage") {
                    if (key === 'Str') {
                      const f25 = (upgrade_levels[25] || 0) * 0.2;
                      const h25 = (upgrade_levels[25] || 0) * 0.001;
                      const f47 = (upgrade_levels[47] || 0) * 0.01;
                      return `(+${val * (1 + f25)} Flat & +${((0.01 + f47 + h25) * val * 100).toFixed(1)}% Multi)`;
                    }
                    if (key === 'Div') {
                      const f34 = (upgrade_levels[34] || 0) * 0.2;
                      return `(+${val * (2 + f34)} Flat)`;
                    }
                    if (key === 'Corr') {
                      const f52 = (upgrade_levels[52] || 0) * 0.002;
                      return `(+${((0.06 + f52) * val * 100).toFixed(1)}% Multi)`;
                    }
                  }
                  if (troubleshootStat === "Armor Pen") {
                    if (key === 'Per') {
                      const h33 = (upgrade_levels[33] || 0) * 1.0;
                      return `(+${val * (2 + h33)} Flat Armor Pen)`;
                    }
                    if (key === 'Int') return `(+${val * 3}% Armor Pen Multi)`;
                  }
                  if (troubleshootStat === "EXP & Fragment Gain") {
                    if (key === 'Int') {
                      const f35 = (upgrade_levels[35] || 0) * 0.01;
                      return `(+${(val * (5 + f35 * 100)).toFixed(1)}% EXP Gain)`;
                    }
                    if (key === 'Per') return `(+${val * 4}% Frag Gain)`;
                  }
                  if (troubleshootStat === "Crit Chances & Multipliers") {
                    if (key === 'Luck') return `(+${(val * 2).toFixed(1)}% Crit Chance)`;
                    if (key === 'Div') {
                      const f34 = (upgrade_levels[34] || 0) * 0.2;
                      return `(+${(val * (2 + f34)).toFixed(1)}% sCrit Chance)`;
                    }
                    if (key === 'Agi') return `(+${val}% Crit Chance)`;
                    if (key === 'Str') {
                      const h47 = (upgrade_levels[47] || 0) * 0.01;
                      return `(+${(val * (3 + h47 * 100)).toFixed(1)}% Crit & sCrit Dmg)`;
                    }
                  }
                  if (troubleshootStat === "Mod Chances & Multipliers") {
                    if (key === 'Luck') return `(+${(val * 0.2).toFixed(1)}% All Mod Chances)`;
                    if (key === 'Int') {
                      const h35 = (upgrade_levels[35] || 0) * 0.0001;
                      return `(+${(val * (0.35 + h35 * 100)).toFixed(2)}% Exp Mod Chance)`;
                    }
                    if (key === 'Per') {
                      const f33 = (upgrade_levels[33] || 0) * 0.0001;
                      return `(+${(val * (0.35 + f33 * 100)).toFixed(2)}% Loot Mod Chance)`;
                    }
                    if (key === 'Agi') {
                      const h26 = (upgrade_levels[26] || 0) * 0.0002;
                      return `(+${(val * (0.30 + h26 * 100)).toFixed(2)}% Speed Mod Chance)`;
                    }
                    if (key === 'Corr') {
                      const h52 = (upgrade_levels[52] || 0) * 0.0002;
                      return `(+${((0.01 + h52) * val * 100).toFixed(1)}% All Mod Gains)`;
                    }
                  }
                  if (troubleshootStat === "Crosshairs & Auto-Tap") {
                    if (key === 'Luck') return `(+${(val * 0.5).toFixed(1)}% Gold Crosshair Chance)`;
                    if (key === 'Div') {
                      const f34 = (upgrade_levels[34] || 0) * 0.2;
                      return `(+${(val * (2 + f34)).toFixed(1)}% Auto-Tap Chance)`;
                    }
                  }
                }

                // --- INTERNAL UPGRADES ---
                if (type === 'upg') {
                  if (troubleshootStat === "Max Stamina") {
                    const mults = { 3: 5, 14: 5, 23: 5, 26: 10, 28: 20, 39: 20, 54: 50 };
                    if (mults[key]) return `(+${val * mults[key]} Flat Max Sta)`;
                  }
                  if (troubleshootStat === "Damage") {
                    const flat = { 9: 1, 15: 2, 20: 5, 25: 25, 32: 50, 49: 500 };
                    const multi = { 25: 2.5, 36: 1, 47: 1, 51: 5, 52: 1 };
                    let res = [];
                    if (flat[key]) res.push(`+${val * flat[key]} Flat`);
                    if (multi[key]) res.push(`+${val * multi[key]}% Multi`);
                    if (res.length > 0) return `(${res.join(' & ')})`;
                  }
                  if (troubleshootStat === "Armor Pen") {
                    const flat = { 10: 1, 17: 2, 29: 10, 33: 25, 36: 100 };
                    if (flat[key]) return `(+${val * flat[key]} Flat Armor Pen)`;
                  }
                  if (troubleshootStat === "EXP & Fragment Gain") {
                    const exp = { 4: 1, 11: 2, 21: 5, 28: 10, 35: 25, 45: 50, 51: 50 };
                    const frag = { 21: 1, 42: 10 };
                    let res = [];
                    if (exp[key]) res.push(`+${val * exp[key]}% EXP`);
                    if (frag[key]) res.push(`+${val * frag[key]}% Frag`);
                    if (res.length > 0) return `(${res.join(' & ')})`;
                  }
                  if (troubleshootStat === "Crit Chances & Multipliers") {
                    const flat = { 13: 1, 18: 1, 20: 1, 30: 1, 37: 1, 40: 1, 47: 1, 49: 1, 53: 1 };
                    if (flat[key]) return `(+${val * flat[key]}% / x)`;
                  }
                  if (troubleshootStat === "Mod Chances & Multipliers") {
                    const modMap = {
                      5: "Loot Mod Chance", 14: "Sta Mod Chance", 16: "Loot Mod Gain",
                      23: "Sta Mod Gain", 24: "All Mod Chances", 
                      26: "Speed Mod Chance per Agi Point",
                      33: "Loot Mod Chance per Per Point", 
                      35: "Exp Mod Chance per Int Point", 
                      38: "Exp Mod Gain & Chance",
                      40: "Sta Mod Chance", 43: "Sta Mod Gain", 44: "All Mod Chances",
                      50: "Sta Mod Chance", 52: "All Mod Gains", 53: "Exp Mod Gain",
                      55: "All Mod Gains"
                    };
                    if (modMap[key]) return `(+Buffs ${modMap[key]})`;
                  }
                  if (troubleshootStat === "Crosshairs & Auto-Tap") {
                    if (key === 48) return `(+${val}% Gold Chance / +${val}% Auto-Tap)`;
                    if (key === 54) return `(+${(val * 0.2).toFixed(1)}% Auto-Tap Chance)`;
                  }
                  if (troubleshootStat === "Abilities") {
                    const abMap = {
                      18: "-Enrage CD", 22: "-Flurry CD", 29: "-Ability CDs",
                      31: "-Quake CD", 32: "-Enrage CD", 39: "+Instacharge Chance",
                      50: "+Instacharge Chance"
                    };
                    if (abMap[key]) return `(${abMap[key]})`;
                  }
                  if (troubleshootStat === "Ascension 2") {
                    if (key === 19) return `(+${(val * 0.1).toFixed(2)}% Gleaming Chance)`;
                    if (key === 46) return `(+${(val * 0.03).toFixed(2)}x Gleaming Multi)`;
                  }
                }

                // --- EXTERNAL UPGRADES ---
                if (type === 'ext') {
                  if (troubleshootStat === "Max Stamina" && key === "Block Bonker Skill") return `(+${val * Math.min(current_max_floor, 100)}% Multi)`;
                  if (troubleshootStat === "Damage" && key === "Block Bonker Skill") return `(+${val * Math.min(current_max_floor, 100)}% Multi)`;
                  
                  if (troubleshootStat === "EXP & Fragment Gain") {
                    if (key === "Hestia Idol") return `(+${(val * 0.01).toFixed(2)}% Frag Multi)`;
                    if (key === "Axolotl Pet Quest Rank") return `(+${(val + 1) * 3}% Frag Multi)`;
                    if (key === "Geoduck Tribute") {
                      const cap = asc2_unlocked ? 75 : 50;
                      return `(+${Math.min(val * 0.25, cap).toFixed(2)}% Frag Multi)`;
                    }
                    if (key === "Archaeology Bundle" && val === 1) return `(+25% Frag Multi)`;
                    if (key === "Ascension Bundle" && val === 1) return `(+15% EXP Multi)`;
                  }
                  
                  if (troubleshootStat === "Mod Chances & Multipliers") {
                    if (key === "Ascension Bundle" && val === 1) return `(+2% Loot Mod Chance)`;
                    if (key === "Block Bonker Skill") return `(+${val * 15} Flat Speed Mod Gain)`;
                  }
                  
                  if (troubleshootStat === "Abilities") {
                    if (key === "Arch Ability Card") {
                      if (val === 1) return `(-3% CD)`;
                      if (val === 2) return `(-6% CD)`;
                      if (val === 3) return `(-10% CD)`;
                      // Infernal Bonus is stored as a string percentage (e.g. "-15.09")
                      if (val === 4) return `(${arch_ability_infernal_bonus}% CD)`; 
                    }
                    if (key === "Avada Keda- Skill" && val === 1) return `(+5 Charges, -10s CD, +3% Insta)`;
                  }
                  if (troubleshootStat === "Ascension 2") {
                    if (key === "Hades Idol") return `(+${(val * 0.0045).toFixed(4)}% Infernal Base)`;
                  }
                }

                return ""; 
              };

              return (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-st-secondary p-4 rounded-lg">
                  <div>
                    <h5 className="font-bold border-b border-gray-300 pb-1 mb-2">📊 Base Stats</h5>
                    {data.settings.map(s => {
                      if (s === 'current_max_floor') return <div key={s} className="text-sm mb-1 text-st-orange"><strong>Max Floor:</strong> <code className="bg-black/10 dark:bg-white/10 text-st-text px-1 rounded text-st-text">{current_max_floor}</code></div>;
                      if (s === 'total_infernal_cards') return <div key={s} className="text-sm mb-1 text-st-orange"><strong>Total Infernals:</strong> <code className="bg-black/10 dark:bg-white/10 text-st-text px-1 rounded text-st-text">{total_infernal_cards}</code> <span className="text-xs text-st-text-light">(+0.002x Multi per card)</span></div>;
                      return null;
                    })}
                    {data.stats.map(s => {
                      if (s === 'Corr' && !asc2_unlocked) return null;
                      if (s === 'Div' && !asc1_unlocked) return null;
                      const val = base_stats[s] || 0;
                      return <div key={s} className="text-sm mb-1"><strong>{s}:</strong> <code className="bg-black/10 dark:bg-white/10 text-st-text px-1 rounded">{val}</code> <span className="text-xs text-st-text-light">{getEffectStr('stat', s, val)}</span></div>;
                    })}
                  </div>
                  <div>
                    <h5 className="font-bold border-b border-gray-300 pb-1 mb-2">⬆️ Internal Upgrades</h5>
                    {data.upgs.map(u => {
                      const asc2_locked =[19, 27, 34, 46, 52, 55];
                      if (!asc2_unlocked && asc2_locked.includes(u)) return null;
                      const val = upgrade_levels[u] || 0;
                      const name = UPGRADE_NAMES[u] || `Upg ${u}`;
                      return <div key={u} className="text-sm mb-1"><strong>{name}:</strong> <code className="bg-black/10 dark:bg-white/10 text-st-text px-1 rounded">{val}</code> <span className="text-xs text-st-text-light">{getEffectStr('upg', u, val)}</span></div>;
                    })}
                  </div>
                  <div>
                    <h5 className="font-bold border-b border-gray-300 pb-1 mb-2">🌟 External Upgrades</h5>
                    {data.exts.length === 0 ? <div className="text-sm italic text-gray-500">(None apply)</div> : data.exts.map(e => {
                      const group = EXTERNAL_UI_GROUPS.find(g => g.name === e);
                      const val = group ? (external_levels[group.rows[0]] || 0) : 0;
                      return <div key={e} className="text-sm mb-1"><strong>{e}:</strong> <code className="bg-black/10 dark:bg-white/10 text-st-text px-1 rounded">{val}</code> <span className="text-xs text-st-text-light">{getEffectStr('ext', e, val)}</span></div>;
                    })}
                  </div>
                  <div>
                    <h5 className="font-bold border-b border-gray-300 pb-1 mb-2">🎴 Infernal Cards</h5>
                    {data.infs.length === 0 ? <div className="text-sm italic text-gray-500">(None apply)</div> : data.infs.map(c => {
                      const tier = cards[c] || 0;
                      const val = calculated_stats?.inf_bonuses?.[c] || 0;
                      
                      let effStr = "";
                      if (val !== 0) {
                        const cardText = INFERNAL_CARD_BONUSES[c]?.text || "";
                        if ([ 'rare2', 'leg3', 'div3', 'leg4' ].includes(c)) {
                          effStr = `(+${val.toFixed(1)} ${cardText})`;
                        } else {
                          effStr = `(+${(val * 100).toFixed(2)}% ${cardText})`;
                        }
                      } else {
                        effStr = "(Infernal not yet obtained)";
                      }
                      
                      const cardLevelNames =["Not Obtained", "Regular", "Gilded", "Poly", "Infernal"];
                      const tierName = cardLevelNames[tier] || "Not Obtained";

                      return (
                        <div key={c} className="text-sm mb-1">
                          <strong className="capitalize">{c}:</strong> <code className="bg-black/10 dark:bg-white/10 text-st-text px-1 rounded">{tierName}</code> 
                          <span className={`text-xs ml-1 ${val !== 0 ? 'text-st-text-light' : 'text-st-text-light italic opacity-60'}`}>
                            {effStr}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Column 1: Combat & Crits */}
        <div className="st-container flex flex-col gap-2">
          <h4 className="text-lg font-bold border-b border-st-border pb-2 mb-2">⚔️ Combat & Crits</h4>
          <div><strong>Max Stamina:</strong> {fmt(calculated_stats.max_sta)}</div>
          <div><strong>Damage:</strong> {fmt(calculated_stats.damage)}</div>
          <div><strong>Armor Pen:</strong> {fmt(calculated_stats.armor_pen)}</div>
          
          <hr className="my-2 border-st-border" />
          
          <h4 className="text-md font-bold text-st-text-light">📊 Raw In-Game Stats</h4>
          <div className="text-xs text-st-text-light italic mb-2">These are the exact numbers shown on your in-game UI screen.</div>
          
          <div><strong>Base Crit:</strong> {fmt(calculated_stats.crit_chance * 100, 2)}% Chance | {fmt(calculated_stats.crit_dmg_mult, 2)}x</div>
          <div><strong>sCrit:</strong> {fmt(calculated_stats.super_crit_chance * 100, 2)}% Chance | {fmt(calculated_stats.super_crit_dmg_mult, 2)}x</div>
          <div><strong>uCrit:</strong> {fmt(calculated_stats.ultra_crit_chance * 100, 2)}% Chance | {fmt(calculated_stats.ultra_crit_dmg_mult, 2)}x</div>
        </div>

        {/* Column 2: Economy & Modifiers */}
        <div className="st-container flex flex-col gap-2">
          <h4 className="text-lg font-bold border-b border-st-border pb-2 mb-2">💰 Economy & Modifiers</h4>
          <div><strong>EXP Gain Multiplier:</strong> {fmt(calculated_stats.exp_gain_mult, 2)}x</div>
          <div><strong>Frag/Loot Multiplier:</strong> {fmt(calculated_stats.frag_loot_gain_mult, 2)}x</div>
          
          <hr className="my-2 border-st-border" />
          
          <div><strong>EXP Mod Chance:</strong> {fmt(calculated_stats.exp_mod_chance * 100, 2)}% <span className="text-sm text-st-text-light">(Multi: {fmt(calculated_stats.exp_mod_gain, 2)}x)</span></div>
          <div><strong>Loot Mod Chance:</strong> {fmt(calculated_stats.loot_mod_chance * 100, 2)}% <span className="text-sm text-st-text-light">(Multi: {fmt(calculated_stats.loot_mod_gain, 2)}x)</span></div>
          <div><strong>Speed Mod Chance:</strong> {fmt(calculated_stats.speed_mod_chance * 100, 2)}% <span className="text-sm text-st-text-light">(Gain: +{fmt(calculated_stats.speed_mod_gain, 0)} atks)</span></div>
          <div><strong>Stamina Mod Chance:</strong> {fmt(calculated_stats.stamina_mod_chance * 100, 2)}% <span className="text-sm text-st-text-light">(Gain: +{fmt(calculated_stats.stamina_mod_gain, 0)} Sta)</span></div>
          
          <hr className="my-2 border-st-border" />
          
          <div><strong>Crosshair Auto-Tap:</strong> {fmt(calculated_stats.crosshair_auto_tap * 100, 2)}%</div>
          <div><strong>Gold Crosshair:</strong> {fmt(calculated_stats.gold_crosshair_chance * 100, 2)}% <span className="text-sm text-st-text-light">(Mult: {fmt(calculated_stats.gold_crosshair_mult, 2)}x)</span></div>
        </div>

        {/* Column 3: Abilities & Asc2 */}
        <div className="flex flex-col gap-6">
          <div className="st-container flex flex-col gap-2">
            <h4 className="text-lg font-bold border-b border-st-border pb-2 mb-2">⚡ Abilities</h4>
            <div><strong>Instacharge Chance:</strong> {fmt(calculated_stats.ability_insta_charge * 100, 2)}%</div>
            <hr className="my-1 border-st-border" />
            <div><strong>Enrage:</strong> {fmt(calculated_stats.enrage_charges)} charges <span className="text-sm text-st-text-light">(CD: {fmt(calculated_stats.enrage_cooldown)}s)</span></div>
            <ul className="list-disc pl-5 text-sm text-st-text-light">
              <li>Dmg Bonus: +{fmt(calculated_stats.enrage_bonus_dmg * 100)}%</li>
              <li>Enraged Dmg: {fmt(calculated_stats.enraged_damage)}</li>
              <li>Crit Bonus: +{fmt(calculated_stats.enrage_bonus_crit_dmg * 100)}%</li>
              <li>Enraged Crit Dmg: {fmt(calculated_stats.enraged_crit_dmg_mult, 2)}x</li>
            </ul>
            <hr className="my-1 border-st-border" />
            <div><strong>Flurry:</strong> {fmt(calculated_stats.flurry_duration)}s <span className="text-sm text-st-text-light">(CD: {fmt(calculated_stats.flurry_cooldown)}s)</span></div>
            <ul className="list-disc pl-5 text-sm text-st-text-light">
              <li>Stamina Gain: {fmt(calculated_stats.flurry_sta_on_cast)}</li>
              <li>+100% Atk Speed</li>
            </ul>
            <hr className="my-1 border-st-border" />
            <div><strong>Quake:</strong> {fmt(calculated_stats.quake_attacks)} atks <span className="text-sm text-st-text-light">(CD: {fmt(calculated_stats.quake_cooldown)}s)</span></div>
            <ul className="list-disc pl-5 text-sm text-st-text-light">
              <li>Splash Dmg: {fmt(calculated_stats.quake_dmg_to_all * 100)}%</li>
            </ul>
          </div>

          {asc2_unlocked && (
            <div className="st-container flex flex-col gap-2">
              <h4 className="text-lg font-bold border-b border-st-border pb-2 mb-2">🌌 Ascension 2</h4>
              <div><strong>Gleaming Chance:</strong> {fmt(calculated_stats.gleaming_floor_chance * 100, 2)}%</div>
              <div><strong>Gleaming Multiplier:</strong> {fmt(calculated_stats.gleaming_floor_multi, 2)}x</div>
              <div><strong>Infernal Multiplier:</strong> {fmt(calculated_stats.infernal_multiplier, 4)}x</div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
