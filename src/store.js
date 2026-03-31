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

  // Actions (Equivalent to updating st.session_state)
  setSetting: (key, value) => set({ [key]: value }),
  setBaseStat: (stat, value) => set((state) => ({
    base_stats: { ...state.base_stats, [stat]: parseInt(value) || 0 }
  })),
  
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
    
    // (We will add upgrades and cards here later!)
    
    return newState;
  }),
}));

export default useStore;