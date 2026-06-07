//! Port of `public/engine/floor_map.py`.
//!
//! Builds a 24-slot Floor from a player + RNG.  Two code paths:
//!   1. Boss / mixed-gauntlet floors (hardcoded layouts) — see `boss_layout`.
//!   2. Regular floors — top-down rarity rolling using CHANCE_SETS &
//!      TIER_UNLOCKS, exactly mirroring the GameMaker C# algorithm.
//!
//! RNG ordering is critical for seed parity:
//!   - 1 `random()` for the gleaming roll
//!   - Per occupied slot's spawn check: 1+ `randint(1, chance)` calls (one
//!     per rarity tried, top-down, stopping at first 1-in-X success)
//!   - Per created block: 4 `random()` calls for modifiers (exp/loot/sta/speed)
//!
//! Boss / mixed floors skip the spawn rolls entirely — they're 24 forced
//! blocks each with their own 4-call modifier roll.

use crate::block::Block;
use crate::player::Player;
use crate::project_config::BlockId;
use crate::rng::Mt19937;

// ---------------------------------------------------------------------------
// Spawn tables (verbatim from floor_map.py)
// ---------------------------------------------------------------------------

/// Per-rarity tier unlock floors.  Index 0..=6 (dirt..div), each row is
/// `[tier1_floor, tier2_floor, tier3_floor, tier4_floor]`.
pub const TIER_UNLOCKS: [[u32; 4]; 7] = [
    [1, 12, 24, 81],     // dirt
    [1, 18, 30, 96],     // com
    [3, 26, 36, 111],    // rare
    [6, 30, 42, 126],    // epic
    [12, 32, 45, 136],   // leg
    [20, 35, 50, 141],   // myth
    [50, 75, 100, 150],  // div
];

/// Per-bracket 1-in-X spawn chances.  Ordered TOP-DOWN by minimum floor so
/// the first `floor >= min_f` match wins.  Each inner array is indexed by
/// rarity 0..=6.
pub const CHANCE_SETS: &[(u32, [u32; 7])] = &[
    (150, [3, 6, 6, 6, 6, 10, 15]),
    (100, [3, 6, 7, 7, 7, 14, 30]),
    (70,  [3, 6, 7, 7, 8, 17, 40]),
    (60,  [3, 7, 7, 6, 8, 18, 45]),
    (50,  [3, 7, 7, 6, 8, 18, 50]),
    (30,  [3, 7, 9, 7, 8, 20, 21]),
    (25,  [3, 8, 8, 7, 9, 20, 21]),
    (20,  [3, 9, 9, 7, 11, 20, 21]),
    (15,  [3, 9, 9, 8, 13, 20, 21]),
    (10,  [3, 9, 9, 9, 14, 20, 21]),
    (5,   [3, 8, 8, 10, 14, 20, 21]),
    (1,   [3, 7, 9, 10, 14, 20, 21]),
];

#[inline]
fn chances_for(floor: u32) -> [u32; 7] {
    for &(min_f, chances) in CHANCE_SETS {
        if floor >= min_f {
            return chances;
        }
    }
    // CHANCE_SETS' last entry covers floor 1; reaching here means floor 0.
    CHANCE_SETS.last().unwrap().1
}

// ---------------------------------------------------------------------------
// Boss / mixed-gauntlet layouts (ASC_BOSS_DATA, project_config.py)
// ---------------------------------------------------------------------------

/// Boss-floor layout: either every slot is the same block, or each slot has
/// a specific block_id from a 24-entry table.
#[derive(Clone, Copy)]
pub enum BossLayout {
    Uniform(BlockId),
    Mixed(&'static [BlockId; 24]),
}

// Floor 34 — both asc1 and asc2
const MIX_34: [BlockId; 24] = [
    BlockId::Com3, BlockId::Com3, BlockId::Com3, BlockId::Com3, BlockId::Com3, BlockId::Com3,
    BlockId::Com3, BlockId::Com3, BlockId::Myth1, BlockId::Myth1, BlockId::Com3, BlockId::Com3,
    BlockId::Com3, BlockId::Com3, BlockId::Myth1, BlockId::Myth1, BlockId::Com3, BlockId::Com3,
    BlockId::Com3, BlockId::Com3, BlockId::Com3, BlockId::Com3, BlockId::Com3, BlockId::Com3,
];

// Floor 49 — both asc1 and asc2
const MIX_49: [BlockId; 24] = [
    BlockId::Dirt3, BlockId::Dirt3, BlockId::Dirt3, BlockId::Dirt3, BlockId::Dirt3, BlockId::Dirt3,
    BlockId::Com3,  BlockId::Com3,  BlockId::Com3,  BlockId::Com3,  BlockId::Com3,  BlockId::Com3,
    BlockId::Rare3, BlockId::Rare3, BlockId::Rare3, BlockId::Rare3, BlockId::Rare3, BlockId::Rare3,
    BlockId::Myth2, BlockId::Myth2, BlockId::Myth2, BlockId::Myth2, BlockId::Myth2, BlockId::Myth2,
];

// Floor 74 — both asc1 and asc2
const MIX_74: [BlockId; 24] = [
    BlockId::Dirt3, BlockId::Dirt3, BlockId::Dirt3, BlockId::Dirt3, BlockId::Dirt3, BlockId::Dirt3,
    BlockId::Dirt3, BlockId::Dirt3, BlockId::Dirt3, BlockId::Dirt3, BlockId::Dirt3, BlockId::Dirt3,
    BlockId::Dirt3, BlockId::Dirt3, BlockId::Dirt3, BlockId::Dirt3, BlockId::Dirt3, BlockId::Dirt3,
    BlockId::Dirt3, BlockId::Dirt3, BlockId::Div1,  BlockId::Div1,  BlockId::Dirt3, BlockId::Dirt3,
];

// Floor 99 — asc1 variant (com3 in column 0)
const MIX_99_ASC1: [BlockId; 24] = [
    BlockId::Com3, BlockId::Rare3, BlockId::Epic3, BlockId::Leg3, BlockId::Myth3, BlockId::Div2,
    BlockId::Com3, BlockId::Rare3, BlockId::Epic3, BlockId::Leg3, BlockId::Myth3, BlockId::Div2,
    BlockId::Com3, BlockId::Rare3, BlockId::Epic3, BlockId::Leg3, BlockId::Myth3, BlockId::Div2,
    BlockId::Com3, BlockId::Rare3, BlockId::Epic3, BlockId::Leg3, BlockId::Myth3, BlockId::Div2,
];

// Floor 99 — asc2 variant (com4 in column 0)
const MIX_99_ASC2: [BlockId; 24] = [
    BlockId::Com4, BlockId::Rare3, BlockId::Epic3, BlockId::Leg3, BlockId::Myth3, BlockId::Div2,
    BlockId::Com4, BlockId::Rare3, BlockId::Epic3, BlockId::Leg3, BlockId::Myth3, BlockId::Div2,
    BlockId::Com4, BlockId::Rare3, BlockId::Epic3, BlockId::Leg3, BlockId::Myth3, BlockId::Div2,
    BlockId::Com4, BlockId::Rare3, BlockId::Epic3, BlockId::Leg3, BlockId::Myth3, BlockId::Div2,
];

/// Look up the boss/mixed layout for `floor_id`.  asc2 unlocks several
/// extra uniform-tier floors and overrides floor 99.
pub fn boss_layout(floor_id: u32, asc2: bool) -> Option<BossLayout> {
    // Asc2-only floors (override or extend asc1 set)
    if asc2 {
        match floor_id {
            80 => return Some(BossLayout::Uniform(BlockId::Dirt3)),
            95 => return Some(BossLayout::Uniform(BlockId::Com3)),
            99 => return Some(BossLayout::Mixed(&MIX_99_ASC2)),
            110 => return Some(BossLayout::Uniform(BlockId::Rare3)),
            125 => return Some(BossLayout::Uniform(BlockId::Epic3)),
            135 => return Some(BossLayout::Uniform(BlockId::Leg3)),
            140 => return Some(BossLayout::Uniform(BlockId::Myth3)),
            149 => return Some(BossLayout::Uniform(BlockId::Div3)),
            _ => {}
        }
    }
    // Floors common to both ascensions.  asc1 floor 99 falls through here.
    match floor_id {
        11 => Some(BossLayout::Uniform(BlockId::Dirt1)),
        17 => Some(BossLayout::Uniform(BlockId::Com1)),
        23 => Some(BossLayout::Uniform(BlockId::Dirt2)),
        25 => Some(BossLayout::Uniform(BlockId::Rare1)),
        29 => Some(BossLayout::Uniform(BlockId::Epic1)),
        31 => Some(BossLayout::Uniform(BlockId::Leg1)),
        34 => Some(BossLayout::Mixed(&MIX_34)),
        35 => Some(BossLayout::Uniform(BlockId::Rare2)),
        41 => Some(BossLayout::Uniform(BlockId::Epic2)),
        44 => Some(BossLayout::Uniform(BlockId::Leg2)),
        49 => Some(BossLayout::Mixed(&MIX_49)),
        74 => Some(BossLayout::Mixed(&MIX_74)),
        98 => Some(BossLayout::Uniform(BlockId::Myth3)),
        99 => Some(BossLayout::Mixed(&MIX_99_ASC1)),
        _ => None,
    }
}

/// Pre-Asc1 fallback: div blocks downgrade to myth (per floor_map.py).
fn downgrade_div_pre_asc1(b: BlockId, asc1: bool) -> BlockId {
    if asc1 { return b; }
    match b {
        BlockId::Div1 => BlockId::Myth1,
        BlockId::Div2 => BlockId::Myth2,
        BlockId::Div3 => BlockId::Myth3,
        BlockId::Div4 => BlockId::Myth4,
        other => other,
    }
}

// ---------------------------------------------------------------------------
// Cached modifier configuration (computed once per sim)
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug)]
pub struct ModConfig {
    pub exp_gain: f64,
    pub exp_chance: f64,
    pub loot_gain: f64,
    pub loot_chance: f64,
    pub sta_gain: f64,
    pub sta_chance: f64,
    pub speed_gain: f64,
    pub speed_chance: f64,
    pub exp_gain_mult: f64,
    pub frag_gain_mult: f64,
    pub gleaming_chance: f64,
    pub gleaming_multi: f64,
}

impl ModConfig {
    pub fn from_player(player: &Player) -> Self {
        Self {
            exp_gain: player.exp_mod_gain(),
            exp_chance: player.exp_mod_chance(),
            loot_gain: player.loot_mod_gain(),
            loot_chance: player.loot_mod_chance(),
            sta_gain: player.stamina_mod_gain(),
            sta_chance: player.stamina_mod_chance(),
            speed_gain: player.speed_mod_gain(),
            speed_chance: player.speed_mod_chance(),
            exp_gain_mult: player.exp_gain_mult(),
            frag_gain_mult: player.frag_loot_gain_mult(),
            gleaming_chance: player.gleaming_floor_chance(),
            gleaming_multi: player.gleaming_floor_multi(),
        }
    }
}

// ---------------------------------------------------------------------------
// Floor + FloorGenerator
// ---------------------------------------------------------------------------

/// One generated floor.  `grid[i]` holds the block at slot `i` (24 slots),
/// or `None` for an empty slot (regular floors can have empty slots).
pub struct Floor {
    pub floor_id: u32,
    pub grid: [Option<Block>; 24],
    pub is_gleaming: bool,
    pub gleaming_multi: f64,
}

pub struct FloorGenerator {
    pub mod_config: Option<ModConfig>,
}

impl FloorGenerator {
    pub fn new() -> Self {
        Self { mod_config: None }
    }

    /// Lazily compute (or return) the cached ModConfig.  Mirrors
    /// `_cache_player_mods` in floor_map.py.
    fn cache(&mut self, player: &Player) -> ModConfig {
        if self.mod_config.is_none() {
            self.mod_config = Some(ModConfig::from_player(player));
        }
        self.mod_config.unwrap()
    }

    /// Helper: instantiate a Block + roll its 4 modifier dice.  The dice are
    /// drawn in this exact order (exp, loot, sta, speed) to match Python's
    /// dict-construction RNG ordering.
    fn create_block(
        &self,
        block_id: BlockId,
        floor_id: u32,
        player: &Player,
        rng: &mut Mt19937,
    ) -> Block {
        let cfg = self.mod_config.as_ref().unwrap();
        let mut block = Block::new(block_id, floor_id, player, cfg.exp_gain_mult, cfg.frag_gain_mult);

        // Order critical for seed parity — must match the four
        // `random.random()` calls in Python's dict-comprehension order.
        let r_exp = rng.random();
        let r_loot = rng.random();
        let r_sta = rng.random();
        let r_speed = rng.random();

        block.modifiers.exp_multi = if r_exp < cfg.exp_chance { cfg.exp_gain } else { 1.0 };
        block.modifiers.loot_multi = if r_loot < cfg.loot_chance { cfg.loot_gain } else { 1.0 };
        block.modifiers.stamina_gain = if r_sta < cfg.sta_chance { cfg.sta_gain } else { 0.0 };
        block.modifiers.speed_active = r_speed < cfg.speed_chance;
        block.modifiers.speed_gain = cfg.speed_gain;

        block
    }

    /// Generate one floor.  Consumes RNG in the order:
    ///   1. Gleaming chance (1 `random()`)
    ///   2. Per slot: rarity rolls top-down, then 4 mod rolls per block
    /// Matches `generate_floor` in floor_map.py byte-for-byte.
    pub fn generate_floor(
        &mut self,
        floor_id: u32,
        player: &Player,
        rng: &mut Mt19937,
    ) -> Floor {
        let cfg = self.cache(player);

        // 1. Gleaming floor roll (always consumes 1 random() — even pre-Asc2
        //    where gleaming_floor_chance is forced to 0.0 — to match Python).
        let r = rng.random();
        let is_gleaming = r < cfg.gleaming_chance;
        let gleaming_multi = if is_gleaming { cfg.gleaming_multi } else { 1.0 };

        const NONE_BLOCK: Option<Block> = None;
        let mut grid: [Option<Block>; 24] = [NONE_BLOCK; 24];

        // 2. Boss / mixed-gauntlet override
        if let Some(layout) = boss_layout(floor_id, player.asc2_unlocked) {
            match layout {
                BossLayout::Uniform(bid) => {
                    let bid = downgrade_div_pre_asc1(bid, player.asc1_unlocked);
                    for idx in 0..24 {
                        grid[idx] = Some(self.create_block(bid, floor_id, player, rng));
                    }
                }
                BossLayout::Mixed(slots) => {
                    for idx in 0..24 {
                        let bid = downgrade_div_pre_asc1(slots[idx], player.asc1_unlocked);
                        grid[idx] = Some(self.create_block(bid, floor_id, player, rng));
                    }
                }
            }
            return Floor { floor_id, grid, is_gleaming, gleaming_multi };
        }

        // 3. Regular floor — top-down rarity rolling
        let current_chances = chances_for(floor_id);

        for idx in 0..24 {
            // Roll top-down: divine (rarity 6) first, dirt (0) last.
            // Stop on the FIRST successful 1-in-X roll.
            for rarity_i in (0..=6).rev() {
                let rarity = rarity_i as u8;
                // Divine blocks (rarity 6) don't exist pre-Asc1.
                if rarity == 6 && !player.asc1_unlocked {
                    continue;
                }
                // Skip rarities not yet unlocked for this floor.
                if floor_id < TIER_UNLOCKS[rarity as usize][0] {
                    continue;
                }
                let chance = current_chances[rarity as usize];
                // randint(1, chance) == 1 → 1-in-chance success
                if rng.randint(1, chance as i64) == 1 {
                    // Determine tier for this rarity (highest unlocked).
                    let mut tier: u8 = 1;
                    let unlocks = TIER_UNLOCKS[rarity as usize];
                    if floor_id >= unlocks[3] { tier = 4; }
                    else if floor_id >= unlocks[2] { tier = 3; }
                    else if floor_id >= unlocks[1] { tier = 2; }
                    // Asc2-safety: pre-Asc2 players can't spawn tier 4.
                    if tier == 4 && !player.asc2_unlocked {
                        tier = 3;
                    }
                    let bid = BlockId::from_rarity_tier(rarity, tier);
                    grid[idx] = Some(self.create_block(bid, floor_id, player, rng));
                    break; // First match wins for this slot.
                }
            }
        }

        Floor { floor_id, grid, is_gleaming, gleaming_multi }
    }
}

impl Default for FloorGenerator {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chances_lookup() {
        assert_eq!(chances_for(150), [3, 6, 6, 6, 6, 10, 15]);
        assert_eq!(chances_for(100), [3, 6, 7, 7, 7, 14, 30]);
        assert_eq!(chances_for(1),   [3, 7, 9, 10, 14, 20, 21]);
        assert_eq!(chances_for(999), [3, 6, 6, 6, 6, 10, 15]);
    }

    #[test]
    fn boss_layout_lookup() {
        // Common floors
        assert!(matches!(boss_layout(11, false), Some(BossLayout::Uniform(BlockId::Dirt1))));
        assert!(matches!(boss_layout(34, false), Some(BossLayout::Mixed(_))));
        assert!(matches!(boss_layout(99, false), Some(BossLayout::Mixed(_))));
        // Asc2-only
        assert!(matches!(boss_layout(149, true), Some(BossLayout::Uniform(BlockId::Div3))));
        assert!(boss_layout(149, false).is_none());
        // Asc2 overrides floor 99
        if let Some(BossLayout::Mixed(asc2_99)) = boss_layout(99, true) {
            assert_eq!(asc2_99[0], BlockId::Com4); // asc2-99 has com4 in col 0
        } else { panic!("asc2 99 should be mixed"); }
        // Normal floor — no boss
        assert!(boss_layout(50, false).is_none());
    }

    #[test]
    fn div_downgrade_pre_asc1() {
        assert_eq!(downgrade_div_pre_asc1(BlockId::Div1, false), BlockId::Myth1);
        assert_eq!(downgrade_div_pre_asc1(BlockId::Div1, true), BlockId::Div1);
        assert_eq!(downgrade_div_pre_asc1(BlockId::Rare2, false), BlockId::Rare2); // non-div pass through
    }
}
