import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { EXTERNAL_UI_GROUPS } from './game_data';

const useStore = create(
  persist(
    (set) => ({
      // Global Settings
  asc1_unlocked: true,
  asc2_unlocked: false,
  arch_level: 45,
  current_max_floor: 40,
  hades_idol_level: 0,
  
  // Base Stats
  base_stats: {
    Str: 0, Agi: 0, Per: 0, Int: 0, Luck: 0, Div: 0, Corr: 0
  },
  
  // Upgrades & Cards
  upgrade_levels: {},
  external_levels: {},
  cards: {},
  arch_ability_infernal_bonus: "0",
  total_infernal_cards: 0,

  // Stores the live output from Pyodide (damage, crit_chance, etc.)
  calculated_stats: {},
  compendium_target_floor: null,
  opt_results: null,
  run_history: [ ],
  synth_history: [ ],
  synthesis_result: null,

  // Simulation Tab State Persistence
  optGoal: "Max Floor Push",
  targetFrag: 0,
  targetBlock: "myth3",
  timeLimit: 60,
  lockedStats: { },
  simsPerSec: 15,

  // Actions (Equivalent to updating st.session_state)
  setSetting: (key, value) => set({ [key]: value }),
  setBaseStat: (stat, value) => set((state) => ({
    base_stats: { ...state.base_stats, [stat]: parseInt(value) || 0 }
  })),
  setUpgradeLevel: (id, value) => set((state) => ({
    upgrade_levels: { ...state.upgrade_levels, [id]: parseInt(value) || 0 }
  })),
  setCardLevel: (id, value) => set((state) => ({
    cards: { ...state.cards, [id]: parseInt(value) || 0 }
  })),
  setExternalGroup: (rows, value) => set((state) => {
    const newExt = { ...state.external_levels };
    rows.forEach(r => newExt[r] = parseInt(value) || 0);
    return { external_levels: newExt };
  }),
  setCalculatedStats: (stats) => set({ calculated_stats: stats }),
  setCompendiumTargetFloor: (val) => set({ compendium_target_floor: parseInt(val) || 1 }),
  setOptResults: (res) => set({ opt_results: res }),
  addRunHistory: (run) => set((state) => ({ run_history:[ ...state.run_history, run ] })),
  setSimsState: (key, val) => set({ [key]: val }),
  
  // Bulk load from JSON file
  loadStateFromJson: (data) => set((state) => {
    const newState = { ...state };
    
    // 🕵️‍♂️ RECURSIVE HYBRID-KEY PARSER
    // Mimics verify_player.py to support legacy JSON files from Streamlit
    let foundInfernalRaw = null;
    const legacyKeys =[
      "Arch Ability Infernal Bonus", 
      "arch_ability_infernal_bonus", 
      "infernal_bonus", 
      "Arch_Ability_Infernal_Bonus",
      "Infernal Bonus"
    ];

    const searchJson = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      for (const [k, v] of Object.entries(obj)) {
        if (legacyKeys.includes(k)) {
          foundInfernalRaw = v;
          return;
        }
        if (typeof v === 'object') {
          searchJson(v);
        }
      }
    };
    
    searchJson(data);

    if (foundInfernalRaw !== null) {
      let rawFloat = parseFloat(foundInfernalRaw);
      if (!isNaN(rawFloat)) {
        newState.arch_ability_infernal_bonus = Number((rawFloat * 100).toFixed(4)).toString();
      }
    }

    // Parse Settings
    if (data.settings) {
      if (data.settings.asc1_unlocked !== undefined) newState.asc1_unlocked = data.settings.asc1_unlocked;
      if (data.settings.asc2_unlocked !== undefined) newState.asc2_unlocked = data.settings.asc2_unlocked;
      if (data.settings.arch_level !== undefined) newState.arch_level = data.settings.arch_level;
      if (data.settings.current_max_floor !== undefined) newState.current_max_floor = data.settings.current_max_floor;
      if (data.settings.total_infernal_cards !== undefined) newState.total_infernal_cards = data.settings.total_infernal_cards;
      
      // Legacy Fallback for older JSON files
      if (data.settings.hades_idol_level !== undefined) newState.hades_idol_level = data.settings.hades_idol_level;
    }

    // Parse Base Stats
    if (data.base_stats) {
      newState.base_stats = { ...state.base_stats, ...data.base_stats };
    }
    
    // Parse Upgrades (Map strings like "3 - Gem Stamina" to integer ID 3)
    if (data.internal_upgrades) {
      const parsedUpgs = {};
      Object.entries(data.internal_upgrades).forEach(([k, v]) => {
        const id = parseInt(k.split(" - ")[0]);
        if (!isNaN(id)) parsedUpgs[id] = v;
      });
      newState.upgrade_levels = parsedUpgs;
    }
    
    // Parse Cards
    if (data.cards) {
      newState.cards = { ...data.cards };
    }
    
    // Parse External (Idols/Pets)
    if (data.external_upgrades) {
      const newExt = {};
      EXTERNAL_UI_GROUPS.forEach(group => {
        if (data.external_upgrades[group.name] !== undefined) {
          group.rows.forEach(r => newExt[r] = data.external_upgrades[group.name]);
        }
      });

      // Parse Hades Idol explicitly from external block
      if (data.external_upgrades["Hades Idol"] !== undefined) {
        newState.hades_idol_level = parseInt(data.external_upgrades["Hades Idol"]) || 0;
      }
      
      // Target the Infernal Bonus from the External dictionary
      newState.external_levels = newExt;
    }
    
    return newState;
  }),
    }),
    {
      name: 'iom-optimizer-storage', // The unique key used in the browser's localStorage
    }
  )
);

export default useStore;