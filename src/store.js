import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { EXTERNAL_UI_GROUPS, ASC1_LOCKED_UPGS, ASC2_LOCKED_UPGS } from './game_data';

const getWorkspaceSnapshot = (state) => ({
  asc1_unlocked: state.asc1_unlocked,
  asc2_unlocked: state.asc2_unlocked,
  arch_level: state.arch_level,
  current_max_floor: state.current_max_floor,
  geoduck_unlocked: state.geoduck_unlocked,
  arch_ability_infernal_bonus: state.arch_ability_infernal_bonus,
  total_infernal_cards: state.total_infernal_cards,
  base_stats: { ...state.base_stats },
  upgrade_levels: { ...state.upgrade_levels },
  external_levels: { ...state.external_levels },
  cards: { ...state.cards }
});

const useStore = create(
  persist(
    (set) => ({
      // Global Settings
  theme: 'dark',
  hideMaxed: false,
  activeTab: 'welcome',
  activeSubTab: 'stats',
  upgradeView: 'internal',
  simActiveSubTab: 'optimizer',
  simResTab: 'build',
  simDataTab: 'performance',
  sandboxMinHits: 1,
  sandboxShowUnreachable: false,
  sandboxShowCrits: false,
  sandboxBlockFilters: [ ],
  
  // Profiles System
  profiles: [ ],
  activeProfileId: null,

  asc1_unlocked: true,
  asc2_unlocked: false,
  arch_level: 45,
  current_max_floor: 40,
  geoduck_unlocked: false,
  
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
  
  // Sandbox State
  sandbox_stats: { Str: 0, Agi: 0, Per: 0, Int: 0, Luck: 0, Div: 0, Corr: 0 },
  sandbox_floor: 100,
  sandbox_calculated_stats: null,
  sandbox_baseline: null,
  sandbox_baseline_stats: null,

  // Simulation Tab State Persistenceopt_results: null,
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
  setSetting: (key, value) => set((state) => {
    const updates = { [key]: value };

    // --- ENFORCE SANITIZATION FOR ASCENSION 2 ---
    if (key === 'asc2_unlocked' && value === false) {
      updates.base_stats = { ...state.base_stats, Corr: 0 };
      updates.sandbox_stats = { ...state.sandbox_stats, Corr: 0 };
      
      const newCards = { ...state.cards };
      Object.keys(newCards).forEach(c => {
        if (c.endsWith('4')) newCards[c] = 0;
      });
      updates.cards = newCards;

      const newUpgs = { ...state.upgrade_levels };
      ASC2_LOCKED_UPGS.forEach(id => newUpgs[id] = 0);
      updates.upgrade_levels = newUpgs;
    }

    // --- ENFORCE SANITIZATION FOR ASCENSION 1 ---
    if (key === 'asc1_unlocked' && value === false) {
      updates.asc2_unlocked = false; // Cascading lock
      updates.base_stats = { ...state.base_stats, Div: 0, Corr: 0 };
      updates.sandbox_stats = { ...state.sandbox_stats, Div: 0, Corr: 0 };
      
      const newCards = { ...state.cards };
      Object.keys(newCards).forEach(c => {
        if (c.startsWith('div') || c.endsWith('4')) newCards[c] = 0;
      });
      updates.cards = newCards;

      const newUpgs = { ...state.upgrade_levels };
      ASC1_LOCKED_UPGS.forEach(id => newUpgs[id] = 0);
      ASC2_LOCKED_UPGS.forEach(id => newUpgs[id] = 0);
      updates.upgrade_levels = newUpgs;
    }

    return updates;
  }),
  setBaseStat: (stat, value) => set((state) => ({
    base_stats: { ...state.base_stats, [stat]: value === '' ? '' : (parseInt(value) || 0) }
  })),
  setBaseStats: (newStats) => set((state) => ({
    base_stats: { ...state.base_stats, ...newStats }
  })),
  setUpgradeLevel: (id, value) => set((state) => ({
    upgrade_levels: { ...state.upgrade_levels, [id]: value === '' ? '' : (parseInt(value) || 0) }
  })),
  setCardLevel: (id, value) => set((state) => ({
    cards: { ...state.cards,[id]: value === '' ? '' : (parseInt(value) || 0) }
  })),
  setExternalGroup: (rows, value) => set((state) => {
    const newExt = { ...state.external_levels };
    rows.forEach(r => newExt[r] = value === '' ? '' : (parseInt(value) || 0));
    return { external_levels: newExt };
  }),
  setCalculatedStats: (stats) => set({ calculated_stats: stats }),
  setCompendiumTargetFloor: (val) => set({ compendium_target_floor: parseInt(val) || 1 }),
  setOptResults: (res) => set({ opt_results: res }),
  addRunHistory: (run) => set((state) => ({ run_history:[ ...state.run_history, run ] })),
  setSimsState: (key, val) => set({ [key]: val }),
  setSandboxStat: (stat, value) => set((state) => ({ sandbox_stats: { ...state.sandbox_stats, [stat]: value === '' ? '' : (parseInt(value) || 0) } })),
  setSandboxStats: (newStats) => set((state) => ({ sandbox_stats: { ...state.sandbox_stats, ...newStats } })),
  setSandboxCalculatedStats: (stats) => set({ sandbox_calculated_stats: stats }),
  setSandboxBaseline: (data, stats) => set({ sandbox_baseline: data, sandbox_baseline_stats: stats || null }),
  toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
  
  // Profiles Actions
  createProfile: (name) => set((state) => {
    const newId = 'prof_' + Date.now();
    return {
      profiles:[ ...state.profiles, { id: newId, name, data: getWorkspaceSnapshot(state) } ],
      activeProfileId: newId
    };
  }),
  saveToProfile: (id) => set((state) => ({
    profiles: state.profiles.map(p => p.id === id ? { ...p, data: getWorkspaceSnapshot(state) } : p)
  })),
  loadProfile: (id) => set((state) => {
    const prof = state.profiles.find(p => p.id === id);
    if (!prof) return { };
    return { ...prof.data, activeProfileId: id }; // Dumps snapshot back into the workspace
  }),
  renameProfile: (id, newName) => set((state) => ({
    profiles: state.profiles.map(p => p.id === id ? { ...p, name: newName } : p)
  })),
  deleteProfile: (id) => set((state) => {
    const newProfiles = state.profiles.filter(p => p.id !== id);
    return {
      profiles: newProfiles,
      activeProfileId: state.activeProfileId === id ? (newProfiles.length > 0 ? newProfiles[0].id : null) : state.activeProfileId
    };
  }),

  setHideMaxed: (val) => set({ hideMaxed: val }),
  setActiveTab: (val) => set({ activeTab: val }),
  setActiveSubTab: (val) => set({ activeSubTab: val }),
  setUpgradeView: (val) => set({ upgradeView: val }),
  setSimActiveSubTab: (val) => set({ simActiveSubTab: val }),
  setSimResTab: (val) => set({ simResTab: val }),
  setSimDataTab: (val) => set({ simDataTab: val }),
  setSandboxMinHits: (val) => set({ sandboxMinHits: val }),
  setSandboxShowUnreachable: (val) => set({ sandboxShowUnreachable: val }),
  setSandboxShowCrits: (val) => set({ sandboxShowCrits: val }),
  setSandboxBlockFilters: (val) => set({ sandboxBlockFilters: val }),
  saveRoiToCurrentRun: (context, category, data) => set((state) => {
    if (!state.opt_results) return state;
    // Bind a unique ID so we can flawlessly find it in the history arrays
    const targetId = state.opt_results.run_id || Date.now();
    const newOptResults = { ...state.opt_results, run_id: targetId, [category]: data };
    const newState = { opt_results: newOptResults };

    if (context === 'optimizer') {
      newState.run_history = state.run_history.map(r => {
        const restOpt = r._restore_state?.opt_results || (r._restore_state?.best_final ? r._restore_state : null);
        if (restOpt && (restOpt.run_id === targetId || restOpt === state.opt_results)) {
          if (r._restore_state.opt_results) {
            return { ...r, _restore_state: { ...r._restore_state, opt_results: { ...r._restore_state.opt_results, run_id: targetId, [category]: data } } };
          } else {
            return { ...r, _restore_state: { ...r._restore_state, run_id: targetId, [category]: data } };
          }
        }
        return r;
      });
    } else {
      newState.synth_history = state.synth_history.map(r => {
        const restOpt = r._restore_state?.opt_results;
        if (restOpt && (restOpt.run_id === targetId || restOpt === state.opt_results)) {
          return { ...r, _restore_state: { ...r._restore_state, opt_results: { ...r._restore_state.opt_results, run_id: targetId, [category]: data } } };
        }
        return r;
      });
    }
    return newState;
  }),
  
  // Wipe all data to default baseline
  resetState: () => set({
    asc1_unlocked: true,
    asc2_unlocked: false,
    arch_level: 45,
    current_max_floor: 40,
    geoduck_unlocked: false,
    base_stats: { Str: 0, Agi: 0, Per: 0, Int: 0, Luck: 0, Div: 0, Corr: 0 },
    upgrade_levels: { },
    external_levels: { },
    cards: { },
    arch_ability_infernal_bonus: "0",
    total_infernal_cards: 0,
    sandbox_stats: { Str: 0, Agi: 0, Per: 0, Int: 0, Luck: 0, Div: 0, Corr: 0 },
    sandbox_floor: 100
  }),

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

      // Legacy Fallback for very old Streamlit JSON files where Hades was inside settings
      if (data.settings && data.settings.hades_idol_level !== undefined && newExt[21] === undefined) {
        newExt[21] = parseInt(data.settings.hades_idol_level) || 0;
      }

      // Parse Geoduck Unlock from external block, with legacy fallback
      if (data.external_upgrades["Geoduck Unlocked"] !== undefined) {
        newState.geoduck_unlocked = !!data.external_upgrades["Geoduck Unlocked"];
      } else if (data.external_upgrades["Geoduck Tribute"] !== undefined && parseInt(data.external_upgrades["Geoduck Tribute"]) > 0) {
        newState.geoduck_unlocked = true;
      }
      
      // Target the Infernal Bonus from the External dictionary
      newState.external_levels = newExt;
    }
    
    // --- ENFORCE SANITIZATION AFTER JSON LOAD ---
    if (!newState.asc2_unlocked) {
      if (newState.base_stats) newState.base_stats.Corr = 0;
      if (newState.sandbox_stats) newState.sandbox_stats.Corr = 0;
      if (newState.cards) {
        Object.keys(newState.cards).forEach(c => {
          if (c.endsWith('4')) newState.cards[c] = 0;
        });
      }
      if (newState.upgrade_levels) {
        ASC2_LOCKED_UPGS.forEach(id => newState.upgrade_levels[id] = 0);
      }
    }

    if (!newState.asc1_unlocked) {
      if (newState.base_stats) {
        newState.base_stats.Div = 0;
        newState.base_stats.Corr = 0;
      }
      if (newState.sandbox_stats) {
        newState.sandbox_stats.Div = 0;
        newState.sandbox_stats.Corr = 0;
      }
      if (newState.cards) {
        Object.keys(newState.cards).forEach(c => {
          if (c.startsWith('div') || c.endsWith('4')) newState.cards[c] = 0;
        });
      }
      if (newState.upgrade_levels) {
        ASC1_LOCKED_UPGS.forEach(id => newState.upgrade_levels[id] = 0);
        ASC2_LOCKED_UPGS.forEach(id => newState.upgrade_levels[id] = 0);
      }
    }

    // Profile Injection: Legacy Auto-Migration vs V2 Import
    if (data.profiles) {
      newState.profiles = data.profiles;
      newState.activeProfileId = data.activeProfileId !== undefined ? data.activeProfileId : null;

      // Smart Auto-Matcher: Perform a semantic comparison to heal the workspace if it mathematically matches a profile!
      const isEq = (a, b) => {
        const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
        for (const k of keys) {
          if ((a[k] || 0) !== (b[k] || 0)) return false;
        }
        return true;
      };

      let matchedProfile = null;
      for (const p of newState.profiles) {
        const snap = p.data;
        if (
          newState.asc1_unlocked === snap.asc1_unlocked &&
          newState.asc2_unlocked === snap.asc2_unlocked &&
          newState.arch_level === snap.arch_level &&
          newState.current_max_floor === snap.current_max_floor &&
          !!newState.geoduck_unlocked === !!snap.geoduck_unlocked &&
          parseFloat(newState.arch_ability_infernal_bonus || 0) === parseFloat(snap.arch_ability_infernal_bonus || 0) &&
          (newState.total_infernal_cards || 0) === (snap.total_infernal_cards || 0) &&
          isEq(newState.base_stats, snap.base_stats) &&
          isEq(newState.upgrade_levels, snap.upgrade_levels) &&
          isEq(newState.external_levels, snap.external_levels) &&
          isEq(newState.cards, snap.cards)
        ) {
          matchedProfile = p;
          // If this semantic match also matches the previously active profile ID, prioritize it
          if (p.id === newState.activeProfileId) break;
        }
      }

      if (matchedProfile) {
        // Heal the workspace by explicitly mapping the profile's exact data references.
        // This guarantees strict equality across the app and clears false-positive badges!
        newState.activeProfileId = matchedProfile.id;
        newState.asc1_unlocked = matchedProfile.data.asc1_unlocked;
        newState.asc2_unlocked = matchedProfile.data.asc2_unlocked;
        newState.arch_level = matchedProfile.data.arch_level;
        newState.current_max_floor = matchedProfile.data.current_max_floor;
        newState.geoduck_unlocked = matchedProfile.data.geoduck_unlocked;
        newState.arch_ability_infernal_bonus = matchedProfile.data.arch_ability_infernal_bonus;
        newState.total_infernal_cards = matchedProfile.data.total_infernal_cards;
        newState.base_stats = { ...matchedProfile.data.base_stats };
        newState.upgrade_levels = { ...matchedProfile.data.upgrade_levels };
        newState.external_levels = { ...matchedProfile.data.external_levels };
        newState.cards = { ...matchedProfile.data.cards };
      }
    } else {
      const legacyId = 'prof_' + Date.now();
      newState.profiles =[ { id: legacyId, name: "Imported Legacy Save", data: getWorkspaceSnapshot(newState) } ];
      newState.activeProfileId = legacyId;
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