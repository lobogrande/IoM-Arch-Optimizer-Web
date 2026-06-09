// Normalize example saves by running them through the app's exact import -> export
// pipeline, then writing them to normalized_saves/ with descriptive test filenames.
//
// Import logic lives in scripts/save_import.mjs (mirrors loadStateFromJson() in src/store.js)
// Export logic mirrors handleExport() in src/components/PlayerSetup.jsx
// Both pull the same constants the app uses from src/game_data.js so the output
// is byte-for-byte what the running app would produce.

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  EXTERNAL_UI_GROUPS,
  INTERNAL_UPGRADE_CAPS,
  UPGRADE_NAMES,
  CARD_TYPES,
} from '../src/game_data.js';
import { defaultState, loadStateFromJson } from './save_import.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC_DIR = join(ROOT, 'example_saves');
const OUT_DIR = join(ROOT, 'normalized_saves');

// --- EXPORT: faithful port of handleExport() from src/components/PlayerSetup.jsx ---
function handleExport(state) {
  const internal_upgrades = {};
  Object.keys(INTERNAL_UPGRADE_CAPS).forEach((idStr) => {
    const id = parseInt(idStr);
    const val = state.upgrade_levels[id] || 0;
    const name = UPGRADE_NAMES[id] || 'Upg';
    internal_upgrades[`${id} - ${name}`] = val;
  });

  const external_upgrades = {};
  EXTERNAL_UI_GROUPS.forEach((group) => {
    external_upgrades[group.name] = state.external_levels[group.rows[0]] || 0;
  });
  external_upgrades['Geoduck Unlocked'] = !!state.geoduck_unlocked;
  external_upgrades['Hades Unlocked'] = !!state.hades_unlocked;
  external_upgrades['Arch Ability Infernal Bonus'] = parseFloat(state.arch_ability_infernal_bonus) / 100.0 || 0.0;

  const ordered_cards = {};
  CARD_TYPES.forEach((ot) => {
    [1, 2, 3, 4].forEach((tier) => {
      const cid = `${ot}${tier}`;
      ordered_cards[cid] = state.cards[cid] || 0;
    });
  });

  return {
    settings: {
      asc1_unlocked: state.asc1_unlocked,
      asc2_unlocked: state.asc2_unlocked,
      arch_level: state.arch_level,
      current_max_floor: state.current_max_floor,
      starting_speed_pool: state.starting_speed_pool,
      total_infernal_cards: state.total_infernal_cards,
    },
    base_stats: state.base_stats,
    internal_upgrades,
    external_upgrades,
    cards: ordered_cards,
    profiles: state.profiles,
    activeProfileId: state.activeProfileId,
  };
}

// Stage bucket by global max floor reached (per user decision).
function stageForFloor(floor) {
  if (floor < 100) return 'early';
  if (floor <= 175) return 'mid';
  return 'late';
}

// A short, traceable slug derived from the original filename, to keep names
// unique (e.g. two saves share asc1/arch82/floor106).
function slugify(filename) {
  return filename
    .replace(/\.json$/i, '')
    .replace(/player_?state/gi, '')
    .replace(/\d{8}/g, '') // drop YYYYMMDD date stamps
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

// --- driver ---
mkdirSync(OUT_DIR, { recursive: true });
const files = readdirSync(SRC_DIR).filter((f) => f.endsWith('.json')).sort();

const rows = [];
for (const f of files) {
  const raw = JSON.parse(readFileSync(join(SRC_DIR, f), 'utf8'));
  const imported = loadStateFromJson(defaultState(), raw);
  const exported = handleExport(imported);
  const s = exported.settings;
  const ascend = s.asc2_unlocked ? 2 : s.asc1_unlocked ? 1 : 0;
  const stage = stageForFloor(s.current_max_floor);

  const slug = slugify(f);
  const outName =
    `${stage}_asc${ascend}_arch${s.arch_level}_floor${s.current_max_floor}` +
    (slug ? `_${slug}` : '') +
    '.json';

  writeFileSync(join(OUT_DIR, outName), JSON.stringify(exported, null, 4) + '\n');

  rows.push({
    source: f,
    output: outName,
    stage,
    ascend,
    arch_level: s.arch_level,
    max_floor: s.current_max_floor,
    infernal: s.total_infernal_cards,
    geoduck: imported.geoduck_unlocked,
    hades: imported.hades_unlocked,
  });
}

console.table(rows);
console.log(`\nWrote ${rows.length} normalized saves to ${OUT_DIR}`);
export { rows, OUT_DIR };
