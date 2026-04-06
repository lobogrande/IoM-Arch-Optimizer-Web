import React from 'react';
import useStore from '../store';

const TRUE_EARLY_GAME = { "_presetName": "Template: Early Game", "settings": { "asc1_unlocked": false, "asc2_unlocked": false, "arch_level": 52, "current_max_floor": 24, "total_infernal_cards": 0 }, "base_stats": { "Str": 9, "Agi": 6, "Per": 13, "Int": 0, "Luck": 24, "Div": 10, "Corr": 0 }, "internal_upgrades": { "3 - Gem Stamina": 0, "4 - Gem Exp": 0, "5 - Gem Loot": 0, "8 - Unlock New Ability": 3, "9 - Flat Damage": 25, "10 - Armor Pen.": 25, "11 - Exp. Gain": 25, "12 - Stat Points": 3, "13 - Crit Chance/Damage": 25, "14 - Max Sta/Sta Mod Chance": 20, "15 - Flat Damage": 20, "16 - Loot Mod Gain": 10, "17 - Unlock Fairy/Armor Pen": 6, "18 - Enrage&Crit Dmg/Enrage CD": 15, "19 - Gleaming Floor Chance": 0, "20 - Flat Dmg/Super Crit": 25, "21 - Exp Gain/Frag Gain": 20, "22 - Flurry Sta Gain/Flurry CD": 10, "23 - Max Sta/Sta Mod Gain": 5, "24 - All Mod Chances": 3, "25 - Flat Dmg/Damage Up": 5, "26 - Max Sta/Mod Chance": 5, "27 - Ability Fairy/Loot Mod": 0, "28 - Exp Gain/Max Sta": 13, "29 - Armor Pen/Ability CDs": 0, "30 - Crit Dmg/Super Crit Dmg": 0, "31 - Quake Atks/Cooldown": 7, "32 - Flat Dmg/Enrage CD": 0, "33 - Mod Chance/Armor Pen": 5, "34 - Buff Divinity": 0, "35 - Exp Gain/Mod Ch.": 0, "36 - Damage Up/Armor Pen": 0, "37 - Super Crit/Ultra Crit Chance": 0, "38 - Exp Mod Gain/Chance": 0, "39 - Ability Insta Chance/Max Sta": 0, "40 - Ultra Crit Dmg/Sta Mod Chance": 0, "41 - Poly Card Bonus": 0, "42 - Frag Gain Mult": 0, "43 - Sta Mod Gain": 0, "44 - All Mod Chances": 0, "45 - Exp Gain/Stat Cap Inc.": 0, "46 - Gleaming Floor Multi": 0, "47 - Damage Up/Crit Dmg Up": 0, "48 - Gold Crosshair/Auto-Tap": 0, "49 - Flat Dmg/Ultra Crit": 0, "50 - Insta Chance/Sta Mod": 0, "51 - Dmg Up/Exp Gain": 0, "52 - Dmg Up / Mod Multi Up": 0, "53 - Super Crit Dmg/Exp Mod": 0, "54 - Max Sta/Auto-Tap Chance": 0, "55 - All Mod Multipliers": 0 }, "external_upgrades": { "Hestia Idol": 0, "Hades Idol": 0, "Axolotl Skin": -1, "Dino Skin": -1, "Geoduck Unlocked": false, "Geoduck Tribute": 0, "Avada Keda- Skill": 0, "Block Bonker Skill": 0, "Archaeology Bundle": 0, "Ascension Bundle": 0, "Arch Ability Card": 1, "Arch Ability Infernal Bonus": 0 }, "cards": { "dirt1": 1, "dirt2": 1, "dirt3": 0, "dirt4": 0, "com1": 1, "com2": 1, "com3": 0, "com4": 0, "rare1": 1, "rare2": 0, "rare3": 0, "rare4": 0, "epic1": 1, "epic2": 0, "epic3": 0, "epic4": 0, "leg1": 1, "leg2": 0, "leg3": 0, "leg4": 0, "myth1": 0, "myth2": 0, "myth3": 0, "myth4": 0, "div1": 0, "div2": 0, "div3": 0, "div4": 0 } };

const MID_GAME = { "_presetName": "Template: Mid Game", "settings": { "asc1_unlocked": true, "asc2_unlocked": false, "arch_level": 45, "current_max_floor": 40, "base_damage_const": 10, "total_infernal_cards": 0 }, "base_stats": { "Str": 15, "Agi": 0, "Per": 0, "Int": 0, "Luck": 20, "Div": 10 }, "internal_upgrades": { "3 - Gem Stamina": 25, "4 - Gem Exp": 12, "5 - Gem Loot": 12, "8 - Unlock New Ability": 3, "9 - Flat Damage": 15, "10 - Armor Pen.": 15, "11 - Exp. Gain": 15, "12 - Stat Points": 3, "13 - Crit Chance/Damage": 12, "14 - Max Sta/Sta Mod Chance": 12, "15 - Flat Damage": 8, "16 - Loot Mod Gain": 6, "17 - Unlock Fairy/Armor Pen": 6, "18 - Enrage&Crit Dmg/Enrage Cooldown": 5, "20 - Flat Dmg/Super Crit Chance": 5, "21 - Exp Gain/Fragment Gain": 4, "22 - Flurry Sta Gain/Flurr Cooldown": 4, "23 - Max Sta/Sta Mod Gain": 4, "24 - All Mod Chances": 3, "25 - Flat Dmg/Damage Up": 0, "26 - Max Sta/Mod Chance": 0, "28 - Exp Gain/Max Sta": 3, "29 - Armor Pen/Ability Cooldowns": 3, "30 - Crit Dmg/Super Crit Dmg": 3, "31 - Quake Atks/Cooldown": 3, "32 - Flat Dmg/Enrage Cooldown": 0, "33 - Mod Chance/Armor Pen": 0, "35 - Exp Gain/Mod Ch.": 0, "36 - Damage Up/Armor Pen": 0, "37 - Super Crit/Ultra Crit Chance": 0, "38 - Exp Mod Gain/Chance": 0, "39 - Ability Insta Chance/Max Sta": 0, "40 - Ultra Crit Dmg/Sta Mod Chance": 0, "41 - Poly Card Bonus": 0, "42 - Frag Gain Mult": 0, "43 - Sta Mod Gain": 0, "44 - All Mod Chances": 0, "45 - Exp Gain/All Stat Cap Inc.": 0, "47 - Damage Up/Crit Dmg Up": 0, "48 - Gold Crosshair Chance/Auto-Tap Chance": 0, "49 - Flat Dmg/Ultra Crit Chance": 0, "50 - Ability Insta Chance/Sta Mod Chance": 0, "51 - Dmg Up/Exp Gain": 0, "53 - Super Crit Dmg/Exp Mod Gain": 0, "54 - Max Sta/Crosshair Auto-Tap Chance": 0 }, "external_upgrades": { "Hestia Idol": 0, "Axolotl Skin": 9, "Dino Skin": 9, "Geoduck Unlocked": true, "Geoduck Tribute": 750, "Avada Keda- Skill": 1, "Block Bonker Skill": 1, "Archaeology Bundle": 0, "Ascension Bundle": 0, "Arch Ability Card": 3, "Arch Ability Infernal Bonus": 0.0 }, "cards": { "dirt1": 3, "dirt2": 2, "dirt3": 2, "com1": 3, "com2": 2, "com3": 2, "rare1": 3, "rare2": 2, "rare3": 2, "epic1": 2, "epic2": 2, "epic3": 2, "leg1": 2, "leg2": 2, "leg3": 2, "myth1": 2, "myth2": 2, "myth3": 2, "div1": 2, "div2": 0, "div3": 0 } };

const LATE_GAME = { "_presetName": "Template: Late Game", "settings": { "asc1_unlocked": true, "asc2_unlocked": true, "arch_level": 99, "current_max_floor": 158, "base_damage_const": 10, "hades_idol_level": 129, "total_infernal_cards": 303 }, "base_stats": { "Str": 15, "Agi": 0, "Per": 0, "Int": 29, "Luck": 30, "Div": 15, "Corr": 15 }, "internal_upgrades": { "3 - Gem Stamina": 50, "4 - Gem Exp": 25, "5 - Gem Loot": 25, "8 - Unlock New Ability": 3, "9 - Flat Damage": 25, "10 - Armor Pen.": 25, "11 - Exp. Gain": 25, "12 - Stat Points": 5, "13 - Crit Chance/Damage": 25, "14 - Max Sta/Sta Mod Chance": 20, "15 - Flat Damage": 20, "16 - Loot Mod Gain": 10, "17 - Unlock Fairy/Armor Pen": 15, "18 - Enrage&Crit Dmg/Enrage Cooldown": 15, "19 - Gleaming Floor Chance": 30, "20 - Flat Dmg/Super Crit Chance": 25, "21 - Exp Gain/Fragment Gain": 20, "22 - Flurry Sta Gain/Flurr Cooldown": 10, "23 - Max Sta/Sta Mod Gain": 5, "24 - All Mod Chances": 30, "25 - Flat Dmg/Damage Up": 5, "26 - Max Sta/Mod Chance": 5, "27 - Unlock Ability Fairy/Loot Mod Gain": 20, "28 - Exp Gain/Max Sta": 15, "29 - Armor Pen/Ability Cooldowns": 10, "30 - Crit Dmg/Super Crit Dmg": 20, "31 - Quake Atks/Cooldown": 10, "32 - Flat Dmg/Enrage Cooldown": 5, "33 - Mod Chance/Armor Pen": 5, "34 - Buff Divinity[Div Stats Up]": 5, "35 - Exp Gain/Mod Ch.": 5, "36 - Damage Up/Armor Pen": 20, "37 - Super Crit/Ultra Crit Chance": 20, "38 - Exp Mod Gain/Chance": 20, "39 - Ability Insta Chance/Max Sta": 20, "40 - Ultra Crit Dmg/Sta Mod Chance": 20, "41 - Poly Card Bonus": 1, "42 - Frag Gain Mult": 1, "43 - Sta Mod Gain": 1, "44 - All Mod Chances": 1, "45 - Exp Gain/All Stat Cap Inc.": 1, "46 - Gleaming Floor Multi": 24, "47 - Damage Up/Crit Dmg Up": 1, "48 - Gold Crosshair Chance/Auto-Tap Chance": 5, "49 - Flat Dmg/Ultra Crit Chance": 5, "50 - Ability Insta Chance/Sta Mod Chance": 25, "51 - Dmg Up/Exp Gain": 5, "52 - [Corruption Buff] Dmg Up / Mod Multi Up": 10, "53 - Super Crit Dmg/Exp Mod Gain": 30, "54 - Max Sta/Crosshair Auto-Tap Chance": 28, "55 - All Mod Multipliers": 10 }, "external_upgrades": { "Hestia Idol": 1929, "Axolotl Skin": 11, "Dino Skin": 11, "Geoduck Unlocked": true, "Geoduck Tribute": 1047, "Avada Keda- Skill": 1, "Block Bonker Skill": 1, "Archaeology Bundle": 1, "Ascension Bundle": 1, "Arch Ability Card": 4, "Arch Ability Infernal Bonus": -0.1509 }, "cards": { "dirt1": 4, "dirt2": 4, "dirt3": 4, "dirt4": 3, "com1": 3, "com2": 3, "com3": 4, "com4": 2, "rare1": 3, "rare2": 3, "rare3": 3, "rare4": 2, "epic1": 3, "epic2": 3, "epic3": 4, "epic4": 2, "leg1": 3, "leg2": 3, "leg3": 4, "leg4": 2, "myth1": 3, "myth2": 3, "myth3": 3, "myth4": 2, "div1": 3, "div2": 3, "div3": 3, "div4": 0 } };

export default function Welcome({ setActiveTab }) {
  const loadStateFromJson = useStore(state => state.loadStateFromJson);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Dev Note (Styled exactly like the Calculated Stats Info box) */}
      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-400 dark:border-blue-500 text-blue-800 dark:text-blue-200 rounded shadow-sm text-sm">
        <h3 className="text-lg font-bold mb-2">📝 A note from the developer...</h3>
        <p className="mb-2">
          Welcome! I built this optimizer because Idle Obelisk Miner's stat mechanics are surprisingly deep. With so many upgrade paths and play styles, figuring out the perfect stat distribution often feels like taking a shot in the dark.
        </p>
        <p>
          My goal is simple: to give you a tool that completely eliminates the guesswork. Whether you are an early-game player trying to farm your first Block Cards, or deep into Ascensions pushing for a new Max Floor, this engine crunches the numbers to find the absolute best setup for your exact character. I sincerely hope it helps you crush those progression walls and makes your mining journey that much more fun!
        </p>
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 pt-4 border-t border-blue-200/50 mt-2">
          <a 
            href="https://ko-fi.com/lobogrande" 
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#FF5E5B] text-white font-bold rounded-lg shadow hover:bg-[#E05350] transition-transform hover:-translate-y-0.5"
          >
            <span className="text-lg">🥤</span> Buy the Dev a Smoothie
          </a>
          <span className="text-xs text-blue-700/80 italic">
            (This tool is 100% free and open-source forever. Any tips go directly toward offsetting the out-of-pocket costs of the AI tools used to build it!)
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        {/* Guide */}
        <div className="md:col-span-3 st-container">
          <h3 className="text-xl font-bold mb-4">👋 How to use this app</h3>
          <p className="mb-4 text-st-text-light">If you are new here, follow these 3 steps to get started:</p>
          <ol className="list-decimal list-inside space-y-2">
            <li><strong>Input your Stats:</strong> Go to the <strong>Player Setup</strong> tab to manually enter your info, <strong>Import</strong> your json data, or click a <strong>Preset Build</strong> below.</li>
            <li><strong>Select your Goal:</strong> Go to the <strong>Simulations ➔ Optimizer</strong> tab and choose your target.</li>
            <li><strong>Run the Engine:</strong> Let the AI find your perfect mathematical build.</li>
          </ol>
        </div>

        {/* Tips Expander */}
        <div className="md:col-span-2 st-container h-fit">
          <details className="group">
            <summary className="cursor-pointer font-bold flex justify-between items-center list-none outline-none">
              <span>💡 Quick Tips & Tricks</span>
              <span className="transition group-open:rotate-180 text-st-orange">▼</span>
            </summary>
            <div className="mt-4 pt-4 border-t border-st-border text-st-text-light space-y-3 text-sm">
              <p><strong>The "Suicide Farming" Paradox:</strong> Buying survival stats (Agility/Stamina) when farming early-game blocks pushes you to deeper floors where blocks have exponentially more HP, mathematically lowering your kills/min!</p>
              <p><strong>Stat Plateaus:</strong> Because blocks only take whole hits, 50 Strength and 54 Strength might both result in a '3-hit kill'. Use the <strong>Sandbox Tab</strong> to find these exact breakpoints.</p>
              <p><strong>Use Stat Locks:</strong> When running the Optimizer, locking obvious stats (like setting Agility to 0 for early farming) makes the AI run exponentially faster and more accurately!</p>
            </div>
          </details>
        </div>
      </div>

      <hr />

      {/* Preset Builds */}
      <div>
        <h4 className="text-xl font-bold mb-4">🚀 Quick Start: Load a Preset Build</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <button 
            onClick={() => { loadStateFromJson(TRUE_EARLY_GAME); setActiveTab('setup'); }}
            className="st-container hover:border-st-orange transition-colors text-center font-medium shadow-sm cursor-pointer py-4"
          >
            🌱 Load Early-Game Build<br/>
            <span className="text-sm font-normal text-st-text-light">(Pre-Asc, Floor 24)</span>
          </button>

          <button 
            onClick={() => { loadStateFromJson(MID_GAME); setActiveTab('setup'); }}
            className="st-container hover:border-st-orange transition-colors text-center font-medium shadow-sm cursor-pointer py-4"
          >
            ⚔️ Load Mid-Game Build<br/>
            <span className="text-sm font-normal text-st-text-light">(Asc 1, Floor 40)</span>
          </button>

          <button 
            onClick={() => { loadStateFromJson(LATE_GAME); setActiveTab('setup'); }}
            className="st-container hover:border-st-orange transition-colors text-center font-medium shadow-sm cursor-pointer py-4"
          >
            🌌 Load Late-Game Build<br/>
            <span className="text-sm font-normal text-st-text-light">(Asc 2, Floor 158)</span>
          </button>
        </div>
        
        </div>
    </div>
  );
}