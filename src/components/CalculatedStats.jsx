// src/components/CalculatedStats.jsx
import { useState } from 'react';
import useStore from '../store';
import { UPGRADE_NAMES, EXTERNAL_UI_GROUPS } from '../game_data';

export default function CalculatedStats() {
  const { asc1_unlocked, asc2_unlocked, current_max_floor, base_stats, upgrade_levels, external_levels, cards, calculated_stats } = useStore();
  const[troubleshootStat, setTroubleshootStat] = useState("");
  const [showTroubleshooter, setShowTroubleshooter] = useState(false);

  // Helper to safely format numbers and prevent NaN errors while Pyodide is booting
  const fmt = (val, decimals = 0) => {
    if (val === undefined || isNaN(val)) return "...";
    return Number(val).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">📋 Calculated Player Stats</h2>
      <p className="text-st-text-light mb-4">This is the exact mathematical output derived from your Base Stats, Upgrades, and Cards being fed into the Engine.</p>
      
      <div className="p-4 bg-blue-50 border-l-4 border-blue-400 text-blue-800 rounded mb-6 text-sm shadow-sm">
        💡 <strong>Verification Step:</strong> The best way to ensure the AI gives you perfect results is to verify your inputs! Compare these numbers directly against the stats shown on your in-game Archaeology screen. If they match perfectly, your imported data is correct.
      </div>

      {/* --- STAT TROUBLESHOOTER EXPANDER --- */}
      <div className="st-container mb-6">
        <button 
          onClick={() => setShowTroubleshooter(!showTroubleshooter)}
          className="w-full flex justify-between items-center font-bold text-lg hover:text-st-orange transition-colors"
        >
          <span>🛠️ Stat Troubleshooter (Click here if your UI numbers don't match the game!)</span>
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
              <option value="Abilities">Abilities (Instacharge / Cooldowns)</option>
            </select>

            {troubleshootStat && (() => {
              // Enhanced map to support settings tracking and block bonker inclusion
              const TROUBLESHOOT_MAP = {
                "Max Stamina": { settings:["current_max_floor"], stats: ["Agi", "Corr"], upgs:[3, 14, 23, 26, 28, 39, 54], exts:["Block Bonker Skill"], infs:["epic3"] },
                "Damage": { settings: [], stats:["Str", "Corr", "Div"], upgs:[9, 15, 20, 25, 32, 34, 36, 47, 49, 51, 52], exts: ["Dino Skin", "Hestia Idol"], infs:["rare2", "div1"] },
                "Armor Pen": { settings: [], stats:["Per", "Int"], upgs:[10, 17, 29, 33, 36], exts:[], infs: ["leg3", "rare3"] },
                "Crit Chances & Multipliers": { settings: [], stats: ["Luck", "Div"], upgs:[13, 18, 20, 30, 37, 40, 47, 49, 53], exts: [], infs:["com1", "com2", "com3", "epic2"] },
                "EXP & Fragment Gain": { settings: [], stats:["Int", "Per", "Div"], upgs:[4, 11, 21, 28, 35, 42, 45, 51], exts:["Axolotl Skin", "Geoduck Tribute"], infs: ["dirt2", "dirt3", "leg1"] },
                "Mod Chances & Multipliers": { settings: [], stats: ["Luck", "Div", "Corr"], upgs:[5, 14, 16, 23, 24, 26, 33, 35, 38, 40, 43, 44, 48, 50, 52, 53, 54, 55], exts:["Archaeology Bundle"], infs:["dirt1", "rare1", "epic1", "leg2", "myth2", "myth3", "div3"] },
                "Abilities": { settings: [], stats:["Int", "Div"], upgs:[18, 22, 29, 31, 32, 39, 50], exts:["Arch Ability Card", "Avada Keda- Skill", "Block Bonker Skill"], infs:[] }
              };
              
              const data = TROUBLESHOOT_MAP[troubleshootStat];
              if (!data) return null;

              // Helper function to calculate the visual contribution string!
              const getEffectStr = (type, key, val) => {
                if (val === 0) return "";
                if (type === 'stat' && key === 'Agi' && troubleshootStat === "Max Stamina") return `(+${val} Flat)`;
                if (type === 'stat' && key === 'Corr' && troubleshootStat === "Max Stamina") return `(-${val}% Multi)`;
                
                if (type === 'upg' && troubleshootStat === "Max Stamina") {
                  const mults = { 3: 5, 14: 5, 23: 5, 26: 10, 28: 20, 39: 20, 54: 50 };
                  if (mults[key]) return `(+${val * mults[key]} Flat)`;
                }

                if (type === 'ext' && key === "Block Bonker Skill" && troubleshootStat === "Max Stamina") {
                  return `(+${Math.min(current_max_floor, 100)}% Multi)`;
                }

                return ""; // Fallback if no specific string is mapped yet
              };

              return (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-st-secondary p-4 rounded-lg">
                  <div>
                    <h5 className="font-bold border-b border-gray-300 pb-1 mb-2">📊 Base Stats</h5>
                    {data.settings.map(s => {
                      if (s === 'current_max_floor') return <div key={s} className="text-sm mb-1 text-st-orange"><strong>Max Floor:</strong> <code className="bg-gray-200 px-1 rounded text-st-text">{current_max_floor}</code></div>;
                      return null;
                    })}
                    {data.stats.map(s => {
                      if (s === 'Corr' && !asc2_unlocked) return null;
                      if (s === 'Div' && !asc1_unlocked) return null;
                      const val = base_stats[s] || 0;
                      return <div key={s} className="text-sm mb-1"><strong>{s}:</strong> <code className="bg-gray-200 px-1 rounded">{val}</code> <span className="text-xs text-st-text-light">{getEffectStr('stat', s, val)}</span></div>;
                    })}
                  </div>
                  <div>
                    <h5 className="font-bold border-b border-gray-300 pb-1 mb-2">⬆️ Internal Upgrades</h5>
                    {data.upgs.map(u => {
                      const asc2_locked =[19, 27, 34, 46, 52, 55];
                      if (!asc2_unlocked && asc2_locked.includes(u)) return null;
                      const val = upgrade_levels[u] || 0;
                      const name = UPGRADE_NAMES[u] || `Upg ${u}`;
                      return <div key={u} className="text-sm mb-1"><strong>{name}:</strong> <code className="bg-gray-200 px-1 rounded">{val}</code> <span className="text-xs text-st-text-light">{getEffectStr('upg', u, val)}</span></div>;
                    })}
                  </div>
                  <div>
                    <h5 className="font-bold border-b border-gray-300 pb-1 mb-2">🌟 External Upgrades</h5>
                    {data.exts.length === 0 ? <div className="text-sm italic text-gray-500">(None apply)</div> : data.exts.map(e => {
                      const group = EXTERNAL_UI_GROUPS.find(g => g.name === e);
                      const val = group ? (external_levels[group.rows[0]] || 0) : 0;
                      return <div key={e} className="text-sm mb-1"><strong>{e}:</strong> <code className="bg-gray-200 px-1 rounded">{val}</code> <span className="text-xs text-st-text-light">{getEffectStr('ext', e, val)}</span></div>;
                    })}
                  </div>
                  <div>
                    <h5 className="font-bold border-b border-gray-300 pb-1 mb-2">🎴 Infernal Cards</h5>
                    {data.infs.length === 0 ? <div className="text-sm italic text-gray-500">(None apply)</div> : data.infs.map(c => {
                      return <div key={c} className="text-sm mb-1 capitalize"><strong>{c}:</strong> <code className="bg-gray-200 px-1 rounded">Tier {cards[c] || 0}</code></div>;
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
          <div><strong>Super Crit:</strong> {fmt(calculated_stats.super_crit_chance * 100, 2)}% Chance | {fmt(calculated_stats.super_crit_dmg_mult, 2)}x</div>
          <div><strong>Ultra Crit:</strong> {fmt(calculated_stats.ultra_crit_chance * 100, 2)}% Chance | {fmt(calculated_stats.ultra_crit_dmg_mult, 2)}x</div>
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
