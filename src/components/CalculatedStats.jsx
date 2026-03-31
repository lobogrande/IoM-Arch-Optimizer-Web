// src/components/CalculatedStats.jsx
import useStore from '../store';

export default function CalculatedStats() {
  const { asc2_unlocked, calculated_stats } = useStore();

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
