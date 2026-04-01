import React from 'react';
import useStore from '../store';

const EARLY_GAME = { "settings": { "asc2_unlocked": false, "arch_level": 45, "current_max_floor": 40, "base_damage_const": 10, "total_infernal_cards": 0 }, "base_stats": { "Str": 15, "Agi": 0, "Per": 0, "Int": 0, "Luck": 20, "Div": 10 }, "internal_upgrades": { "3 - Gem Stamina": 25, "4 - Gem Exp": 12, "5 - Gem Loot": 12, "9 - Flat Damage": 15, "10 - Armor Pen.": 15, "11 - Exp. Gain": 15, "12 - Stat Points": 3, "13 - Crit Chance/Damage": 12, "14 - Max Sta/Sta Mod Chance": 12, "15 - Flat Damage": 8, "16 - Loot Mod Gain": 6, "17 - Unlock Fairy/Armor Pen": 6, "18 - Enrage&Crit Dmg/Enrage Cooldown": 5, "20 - Flat Dmg/Super Crit Chance": 5, "21 - Exp Gain/Fragment Gain": 4, "22 - Flurry Sta Gain/Flurr Cooldown": 4, "23 - Max Sta/Sta Mod Gain": 4, "24 - All Mod Chances": 3, "25 - Flat Dmg/Damage Up": 0, "26 - Max Sta/Mod Chance": 0, "28 - Exp Gain/Max Sta": 3, "29 - Armor Pen/Ability Cooldowns": 3, "30 - Crit Dmg/Super Crit Dmg": 3, "31 - Quake Atks/Cooldown": 3, "32 - Flat Dmg/Enrage Cooldown": 0, "33 - Mod Chance/Armor Pen": 0, "35 - Exp Gain/Mod Ch.": 0, "36 - Damage Up/Armor Pen": 0, "37 - Super Crit/Ultra Crit Chance": 0, "38 - Exp Mod Gain/Chance": 0, "39 - Ability Insta Chance/Max Sta": 0, "40 - Ultra Crit Dmg/Sta Mod Chance": 0, "41 - Poly Card Bonus": 0, "42 - Frag Gain Mult": 0, "43 - Sta Mod Gain": 0, "44 - All Mod Chances": 0, "45 - Exp Gain/All Stat Cap Inc.": 0, "47 - Damage Up/Crit Dmg Up": 0, "48 - Gold Crosshair Chance/Auto-Tap Chance": 0, "49 - Flat Dmg/Ultra Crit Chance": 0, "50 - Ability Insta Chance/Sta Mod Chance": 0, "51 - Dmg Up/Exp Gain": 0, "53 - Super Crit Dmg/Exp Mod Gain": 0, "54 - Max Sta/Crosshair Auto-Tap Chance": 0 }, "external_upgrades": { "Hestia Idol": 0, "Axolotl Skin": 9, "Dino Skin": 9, "Geoduck Tribute": 750, "Avada Keda- Skill": 1, "Block Bonker Skill": 1, "Archaeology Bundle": 0, "Ascension Bundle": 0, "Arch Ability Card": 3, "Arch Ability Infernal Bonus": 0.0 }, "cards": { "dirt1": 3, "dirt2": 2, "dirt3": 2, "com1": 3, "com2": 2, "com3": 2, "rare1": 3, "rare2": 2, "rare3": 2, "epic1": 2, "epic2": 2, "epic3": 2, "leg1": 2, "leg2": 2, "leg3": 2, "myth1": 2, "myth2": 2, "myth3": 2, "div1": 2, "div2": 0, "div3": 0 } };

const LATE_GAME = { "settings": { "asc2_unlocked": true, "arch_level": 99, "current_max_floor": 158, "base_damage_const": 10, "hades_idol_level": 129, "total_infernal_cards": 303 }, "base_stats": { "Str": 15, "Agi": 0, "Per": 0, "Int": 29, "Luck": 30, "Div": 15, "Corr": 15 }, "internal_upgrades": { "3 - Gem Stamina": 50, "4 - Gem Exp": 25, "5 - Gem Loot": 25, "9 - Flat Damage": 25, "10 - Armor Pen.": 25, "11 - Exp. Gain": 25, "12 - Stat Points": 5, "13 - Crit Chance/Damage": 25, "14 - Max Sta/Sta Mod Chance": 20, "15 - Flat Damage": 20, "16 - Loot Mod Gain": 10, "17 - Unlock Fairy/Armor Pen": 15, "18 - Enrage&Crit Dmg/Enrage Cooldown": 15, "19 - Gleaming Floor Chance": 30, "20 - Flat Dmg/Super Crit Chance": 25, "21 - Exp Gain/Fragment Gain": 20, "22 - Flurry Sta Gain/Flurr Cooldown": 10, "23 - Max Sta/Sta Mod Gain": 5, "24 - All Mod Chances": 30, "25 - Flat Dmg/Damage Up": 5, "26 - Max Sta/Mod Chance": 5, "27 - Unlock Ability Fairy/Loot Mod Gain": 20, "28 - Exp Gain/Max Sta": 15, "29 - Armor Pen/Ability Cooldowns": 10, "30 - Crit Dmg/Super Crit Dmg": 20, "31 - Quake Atks/Cooldown": 10, "32 - Flat Dmg/Enrage Cooldown": 5, "33 - Mod Chance/Armor Pen": 5, "34 - Buff Divinity[Div Stats Up]": 5, "35 - Exp Gain/Mod Ch.": 5, "36 - Damage Up/Armor Pen": 20, "37 - Super Crit/Ultra Crit Chance": 20, "38 - Exp Mod Gain/Chance": 20, "39 - Ability Insta Chance/Max Sta": 20, "40 - Ultra Crit Dmg/Sta Mod Chance": 20, "41 - Poly Card Bonus": 1, "42 - Frag Gain Mult": 1, "43 - Sta Mod Gain": 1, "44 - All Mod Chances": 1, "45 - Exp Gain/All Stat Cap Inc.": 1, "46 - Gleaming Floor Multi": 24, "47 - Damage Up/Crit Dmg Up": 1, "48 - Gold Crosshair Chance/Auto-Tap Chance": 5, "49 - Flat Dmg/Ultra Crit Chance": 5, "50 - Ability Insta Chance/Sta Mod Chance": 25, "51 - Dmg Up/Exp Gain": 5, "52 - [Corruption Buff] Dmg Up / Mod Multi Up": 10, "53 - Super Crit Dmg/Exp Mod Gain": 30, "54 - Max Sta/Crosshair Auto-Tap Chance": 28, "55 - All Mod Multipliers": 10 }, "external_upgrades": { "Hestia Idol": 1929, "Axolotl Skin": 11, "Dino Skin": 11, "Geoduck Tribute": 1047, "Avada Keda- Skill": 1, "Block Bonker Skill": 1, "Archaeology Bundle": 1, "Ascension Bundle": 1, "Arch Ability Card": 4, "Arch Ability Infernal Bonus": -0.1509 }, "cards": { "dirt1": 4, "dirt2": 4, "dirt3": 4, "dirt4": 3, "com1": 3, "com2": 3, "com3": 4, "com4": 2, "rare1": 3, "rare2": 3, "rare3": 3, "rare4": 2, "epic1": 3, "epic2": 3, "epic3": 4, "epic4": 2, "leg1": 3, "leg2": 3, "leg3": 4, "leg4": 2, "myth1": 3, "myth2": 3, "myth3": 3, "myth4": 2, "div1": 3, "div2": 3, "div3": 3, "div4": 0 } };

export default function Welcome() {
  const loadStateFromJson = useStore(state => state.loadStateFromJson);
  const resetState = useStore(state => state.resetState);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Dev Note */}
      <div className="bg-blue-900/30 border-l-4 border-blue-500 p-4 rounded text-blue-100">
        <h3 className="text-xl font-bold mb-2">📝 A note from the developer...</h3>
        <p className="mb-2">
          Welcome! I built this Monte Carlo simulator because Idle Obelisk Miner's mechanics and the sheer variety of combinations a user can have for upgrades and play styles make it incredibly difficult to 'guess' the perfect stat distribution.
        </p>
        <p>
          My goal is to give you a tool that completely eliminates the guesswork. Whether you want to push for a new Max Floor or farm Block Cards with maximum efficiency, this AI engine will simulate hundreds of thousands of hits to find the exact mathematical peak for your specific character. I hope it helps you crush those progression walls!
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        {/* Guide */}
        <div className="md:col-span-3 border border-st-border bg-gray-800/50 p-6 rounded-lg">
          <h3 className="text-2xl font-bold mb-4 text-white">👋 How to use this app</h3>
          <p className="mb-4 text-gray-300">If you are new here, follow these 3 steps to get started:</p>
          <ol className="list-decimal list-inside space-y-2 text-gray-300">
            <li><strong>Input your Stats:</strong> Go to the <strong>Player Setup</strong> tab to manually enter your info, <strong>Import</strong> your json data, or click a <strong>Preset Build</strong> below.</li>
            <li><strong>Select your Goal:</strong> Go to the <strong>Simulations ➔ Optimizer</strong> tab and choose your target.</li>
            <li><strong>Run the Engine:</strong> Let the AI find your perfect mathematical build.</li>
          </ol>
        </div>

        {/* Tips Expander */}
        <div className="md:col-span-2">
          <details className="group border border-st-border bg-gray-800/50 rounded-lg open:bg-gray-800">
            <summary className="cursor-pointer p-4 font-bold text-white flex justify-between items-center list-none">
              <span>💡 Quick Tips & Tricks</span>
              <span className="transition group-open:rotate-180">▼</span>
            </summary>
            <div className="p-4 border-t border-st-border text-gray-300 space-y-3 text-sm">
              <p><strong>The "Suicide Farming" Paradox:</strong> Buying survival stats (Agility/Stamina) when farming early-game blocks pushes you to deeper floors where blocks have exponentially more HP, mathematically lowering your kills/min!</p>
              <p><strong>Stat Plateaus:</strong> Because blocks only take whole hits, 50 Strength and 54 Strength might both result in a '3-hit kill'. Use the <strong>Sandbox Tab</strong> to find these exact breakpoints.</p>
              <p><strong>Use Stat Locks:</strong> When running the Optimizer, locking obvious stats (like setting Agility to 0 for early farming) makes the AI run exponentially faster and more accurately!</p>
            </div>
          </details>
        </div>
      </div>

      <hr className="border-st-border my-8" />

      {/* Preset Builds */}
      <div>
        <h4 className="text-xl font-bold mb-4 text-white">🚀 Quick Start: Load a Preset Build</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button 
            onClick={() => loadStateFromJson(EARLY_GAME)}
            className="p-4 border border-st-border rounded-lg bg-gray-800 hover:bg-gray-700 hover:border-st-orange transition-colors text-center text-white font-medium"
          >
            🌱 Load Early-Game Build<br/>
            <span className="text-sm font-normal text-gray-400">(Asc 1, Floor 40)</span>
          </button>

          <button 
            onClick={() => loadStateFromJson(LATE_GAME)}
            className="p-4 border border-st-border rounded-lg bg-gray-800 hover:bg-gray-700 hover:border-st-orange transition-colors text-center text-white font-medium"
          >
            🌌 Load Late-Game Build<br/>
            <span className="text-sm font-normal text-gray-400">(Asc 2, Floor 158)</span>
          </button>

          <button 
            onClick={() => resetState()}
            className="p-4 border border-red-900/50 rounded-lg bg-red-950/20 hover:bg-red-900/40 hover:border-red-500 transition-colors text-center text-red-200 font-medium"
          >
            🗑️ Factory Reset<br/>
            <span className="text-sm font-normal opacity-80">(Wipe All Data)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
