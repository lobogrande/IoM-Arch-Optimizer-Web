// Shared save-import helpers extracted from normalize_saves.mjs so the baseline
// simulation harness (run_baseline_sims.mjs) can reuse the same pipeline the
// normalizer uses. Logic mirrors loadStateFromJson() in src/store.js.

import {
  EXTERNAL_UI_GROUPS,
  ASC1_LOCKED_UPGS,
  ASC2_LOCKED_UPGS,
  enforceAllUpgradeCaps,
} from '../src/game_data.js';

export function defaultState() {
  return {
    profiles: [],
    activeProfileId: null,
    asc1_unlocked: true,
    asc2_unlocked: false,
    arch_level: 45,
    current_max_floor: 40,
    starting_speed_pool: 0,
    geoduck_unlocked: false,
    hades_unlocked: false,
    base_stats: { Str: 0, Agi: 0, Per: 0, Int: 0, Luck: 0, Div: 0, Corr: 0 },
    upgrade_levels: {},
    external_levels: {},
    cards: {},
    card_progress: {},
    frags: { com: 0, rare: 0, epic: 0, leg: 0, myth: 0, div: 0 },
    arch_ability_infernal_bonus: '0',
    total_infernal_cards: 0,
    sandbox_stats: { Str: 0, Agi: 0, Per: 0, Int: 0, Luck: 0, Div: 0, Corr: 0 },
    duelStatsA: { Str: 0, Agi: 0, Per: 0, Int: 0, Luck: 0, Div: 0, Corr: 0 },
    duelStatsB: { Str: 0, Agi: 0, Per: 0, Int: 0, Luck: 0, Div: 0, Corr: 0 },
  };
}

export const getWorkspaceSnapshot = (state) => ({
  asc1_unlocked: state.asc1_unlocked,
  asc2_unlocked: state.asc2_unlocked,
  arch_level: state.arch_level,
  current_max_floor: state.current_max_floor,
  starting_speed_pool: state.starting_speed_pool,
  geoduck_unlocked: state.geoduck_unlocked,
  hades_unlocked: state.hades_unlocked,
  arch_ability_infernal_bonus: state.arch_ability_infernal_bonus,
  total_infernal_cards: state.total_infernal_cards,
  base_stats: { ...state.base_stats },
  upgrade_levels: { ...state.upgrade_levels },
  external_levels: { ...state.external_levels },
  cards: { ...state.cards },
  card_progress: { ...state.card_progress },
  frags: { ...state.frags },
});

// Faithful port of loadStateFromJson(data) from src/store.js.
export function loadStateFromJson(state, data) {
  const newState = { ...state };

  let foundInfernalRaw = null;
  const legacyKeys = [
    'Arch Ability Infernal Bonus',
    'arch_ability_infernal_bonus',
    'infernal_bonus',
    'Arch_Ability_Infernal_Bonus',
    'Infernal Bonus',
  ];
  const searchJson = (obj) => {
    if (foundInfernalRaw !== null) return;
    if (!obj || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'profiles') continue;
      if (legacyKeys.includes(k)) {
        foundInfernalRaw = v;
        return;
      }
      if (typeof v === 'object') searchJson(v);
    }
  };
  searchJson(data);
  if (foundInfernalRaw !== null) {
    const rawFloat = parseFloat(foundInfernalRaw);
    if (!isNaN(rawFloat)) {
      newState.arch_ability_infernal_bonus = Number((rawFloat * 100).toFixed(4)).toString();
    }
  }

  if (data.settings) {
    if (data.settings.asc1_unlocked !== undefined) newState.asc1_unlocked = data.settings.asc1_unlocked;
    if (data.settings.asc2_unlocked !== undefined) newState.asc2_unlocked = data.settings.asc2_unlocked;
    if (data.settings.arch_level !== undefined) newState.arch_level = data.settings.arch_level;
    if (data.settings.current_max_floor !== undefined) newState.current_max_floor = data.settings.current_max_floor;
    if (data.settings.starting_speed_pool !== undefined) newState.starting_speed_pool = data.settings.starting_speed_pool;
    if (data.settings.total_infernal_cards !== undefined) newState.total_infernal_cards = data.settings.total_infernal_cards;
  }

  if (data.base_stats) {
    newState.base_stats = { ...state.base_stats, ...data.base_stats };
  }

  if (data.internal_upgrades) {
    const parsedUpgs = {};
    Object.entries(data.internal_upgrades).forEach(([k, v]) => {
      const id = parseInt(k.split(' - ')[0]);
      if (!isNaN(id)) parsedUpgs[id] = v;
    });
    newState.upgrade_levels = enforceAllUpgradeCaps(parsedUpgs, newState.arch_level);
  }

  if (data.cards) {
    newState.cards = { ...data.cards };
  }

  if (data.external_upgrades) {
    if (data.external_upgrades['Axolotl Skin'] !== undefined) {
      data.external_upgrades['Axolotl Pet Quest Rank'] = data.external_upgrades['Axolotl Skin'];
    }
    if (data.external_upgrades['Dino Skin'] !== undefined) {
      data.external_upgrades['Dino Pet Quest Rank'] = data.external_upgrades['Dino Skin'];
    }

    const newExt = {};
    EXTERNAL_UI_GROUPS.forEach((group) => {
      if (data.external_upgrades[group.name] !== undefined) {
        group.rows.forEach((r) => (newExt[r] = data.external_upgrades[group.name]));
      }
    });

    if (data.settings && data.settings.hades_idol_level !== undefined && newExt[21] === undefined) {
      newExt[21] = parseInt(data.settings.hades_idol_level) || 0;
    }

    if (data.external_upgrades['Geoduck Unlocked'] !== undefined) {
      newState.geoduck_unlocked = !!data.external_upgrades['Geoduck Unlocked'];
    } else if (
      data.external_upgrades['Geoduck Tribute'] !== undefined &&
      parseInt(data.external_upgrades['Geoduck Tribute']) > 0
    ) {
      newState.geoduck_unlocked = true;
    }

    if (data.external_upgrades['Hades Unlocked'] !== undefined) {
      newState.hades_unlocked = !!data.external_upgrades['Hades Unlocked'];
    } else if (
      data.external_upgrades['Hades Idol'] !== undefined &&
      parseInt(data.external_upgrades['Hades Idol']) > 0
    ) {
      newState.hades_unlocked = true;
    }

    newState.external_levels = newExt;
  }

  // --- SANITIZATION ---
  if (!newState.asc2_unlocked) {
    if (newState.base_stats) newState.base_stats.Corr = 0;
    if (newState.sandbox_stats) newState.sandbox_stats.Corr = 0;
    if (newState.duelStatsA) newState.duelStatsA.Corr = 0;
    if (newState.duelStatsB) newState.duelStatsB.Corr = 0;
    if (newState.cards) {
      Object.keys(newState.cards).forEach((c) => {
        if (c.endsWith('4')) newState.cards[c] = 0;
      });
    }
    if (newState.upgrade_levels) {
      ASC2_LOCKED_UPGS.forEach((id) => (newState.upgrade_levels[id] = 0));
    }
  }

  const hasHadesUnlockedField =
    data.external_upgrades && data.external_upgrades['Hades Unlocked'] !== undefined;

  if (!hasHadesUnlockedField && newState.cards) {
    const hasInfernalCards = Object.keys(newState.cards).some((c) => newState.cards[c] === 4);
    if (hasInfernalCards) newState.hades_unlocked = true;
  }

  if (!newState.hades_unlocked && hasHadesUnlockedField) {
    if (newState.cards) {
      Object.keys(newState.cards).forEach((c) => {
        if (newState.cards[c] === 4) newState.cards[c] = 3;
      });
    }
    if (newState.total_infernal_cards > 0) newState.total_infernal_cards = 0;
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
    if (newState.duelStatsA) {
      newState.duelStatsA.Div = 0;
      newState.duelStatsA.Corr = 0;
    }
    if (newState.duelStatsB) {
      newState.duelStatsB.Div = 0;
      newState.duelStatsB.Corr = 0;
    }
    if (newState.cards) {
      Object.keys(newState.cards).forEach((c) => {
        if (c.startsWith('div') || c.endsWith('4')) newState.cards[c] = 0;
      });
    }
    if (newState.upgrade_levels) {
      ASC1_LOCKED_UPGS.forEach((id) => (newState.upgrade_levels[id] = 0));
      ASC2_LOCKED_UPGS.forEach((id) => (newState.upgrade_levels[id] = 0));
    }
  }

  if (data.profiles) {
    newState.profiles = data.profiles;
    newState.activeProfileId = data.activeProfileId !== undefined ? data.activeProfileId : null;

    const isEq = (a, b) => {
      const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
      for (const k of keys) {
        if (Number(a[k] || 0) !== Number(b[k] || 0)) return false;
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
        (newState.starting_speed_pool || 0) === (snap.starting_speed_pool || 0) &&
        !!newState.geoduck_unlocked === !!snap.geoduck_unlocked &&
        !!newState.hades_unlocked === !!snap.hades_unlocked &&
        parseFloat(newState.arch_ability_infernal_bonus || 0) === parseFloat(snap.arch_ability_infernal_bonus || 0) &&
        (newState.total_infernal_cards || 0) === (snap.total_infernal_cards || 0) &&
        isEq(newState.base_stats, snap.base_stats) &&
        isEq(newState.upgrade_levels, snap.upgrade_levels) &&
        isEq(newState.external_levels, snap.external_levels) &&
        isEq(newState.cards, snap.cards)
      ) {
        matchedProfile = p;
        if (p.id === newState.activeProfileId) break;
      }
    }

    if (matchedProfile) {
      newState.activeProfileId = matchedProfile.id;
      newState.asc1_unlocked = matchedProfile.data.asc1_unlocked;
      newState.asc2_unlocked = matchedProfile.data.asc2_unlocked;
      newState.arch_level = matchedProfile.data.arch_level;
      newState.current_max_floor = matchedProfile.data.current_max_floor;
      newState.starting_speed_pool = matchedProfile.data.starting_speed_pool;
      newState.geoduck_unlocked = matchedProfile.data.geoduck_unlocked;
      newState.hades_unlocked = matchedProfile.data.hades_unlocked;
      newState.arch_ability_infernal_bonus = matchedProfile.data.arch_ability_infernal_bonus;
      newState.total_infernal_cards = matchedProfile.data.total_infernal_cards;
      newState.base_stats = { ...matchedProfile.data.base_stats };
      newState.upgrade_levels = { ...matchedProfile.data.upgrade_levels };
      newState.external_levels = { ...matchedProfile.data.external_levels };
      newState.cards = { ...matchedProfile.data.cards };
    }
  } else {
    const legacyId = 'prof_' + Date.now();
    const presetName = data._presetName || 'Imported Legacy Save';
    newState.profiles = [
      ...(state.profiles || []),
      { id: legacyId, name: presetName, data: getWorkspaceSnapshot(newState) },
    ];
    newState.activeProfileId = legacyId;
  }

  return newState;
}
