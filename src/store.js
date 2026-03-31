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
}));

export default useStore;
