import { create } from 'zustand';

const useStore = create((set) => ({
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
  arch_ability_infernal_bonus: 0.0,
  total_infernal_cards: 0,

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
  
  // Bulk load from JSON file
  loadStateFromJson: (data) => set((state) => {
    const newState = { ...state };
    
    // Parse Settings
    if (data.settings) {
      if (data.settings.asc1_unlocked !== undefined) newState.asc1_unlocked = data.settings.asc1_unlocked;
      if (data.settings.asc2_unlocked !== undefined) newState.asc2_unlocked = data.settings.asc2_unlocked;
      if (data.settings.arch_level !== undefined) newState.arch_level = data.settings.arch_level;
      if (data.settings.current_max_floor !== undefined) newState.current_max_floor = data.settings.current_max_floor;
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
      // We will map these carefully when we build the External Upgrades UI
      newState.raw_external_import = data.external_upgrades;
    }
    
    if (data.settings?.total_infernal_cards !== undefined) newState.total_infernal_cards = data.settings.total_infernal_cards;
    
    return newState;
  }),
}));

export default useStore;