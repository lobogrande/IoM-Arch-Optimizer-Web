//! Port of `public/core/block.py`.
//!
//! A `Block` holds the per-floor-scaled HP / Armor / XP / Frag values for one
//! ore instance.  The HP/Armor floor-scaling table is pre-computed at compile
//! time (via `const fn`) — covers floors 1..=500 with the exact game-bug
//! behavior preserved (floor-150 armor skip, floor-300 double-trigger).
//!
//! Modifiers (stamina_gain, exp_multi, etc.) are populated by floor_map.rs
//! during procedural generation; combat_loop.rs reads them on block kill.

use crate::player::{round_banker, Player};
use crate::project_config::{BlockId, BLOCK_BASE_STATS};

/// Per-block dynamic modifiers populated by FloorGenerator.  Defaults to
/// "no modifier active".  Mirrors Python's `block.modifiers` dict reads in
/// combat_loop.py.
#[derive(Clone, Copy, Debug)]
pub struct BlockModifiers {
    pub exp_multi: f64,
    pub loot_multi: f64,
    pub stamina_gain: f64,
    pub speed_active: bool,
    pub speed_gain: f64,
}

impl Default for BlockModifiers {
    fn default() -> Self {
        Self {
            exp_multi: 1.0,
            loot_multi: 1.0,
            stamina_gain: 0.0,
            speed_active: false,
            speed_gain: 0.0,
        }
    }
}

#[derive(Clone, Debug)]
pub struct Block {
    pub block_id: BlockId,
    pub hp: f64,
    pub armor: f64,
    pub xp: f64,
    pub frag_amt: f64,
    pub frag_type: u8,
    pub modifiers: BlockModifiers,
}

/// Floor-scaling multipliers (hp, armor) for floors 0..=500.  Index 0 unused.
/// At compile time we mirror exactly the sequential checks in `block.py`:
/// floor >= 100, >= 150 (HP only — armor-skip BUG), >= 200, >= 250, >= 300
/// (twice — double-trigger BUG), >= 350, >= 400, >= 450, >= 500.
pub const FLOOR_SCALARS: [(f64, f64); 501] = compute_floor_scalars();

const fn compute_floor_scalars() -> [(f64, f64); 501] {
    let mut out = [(1.0, 1.0); 501];
    let mut f: usize = 1;
    while f <= 500 {
        let mut hp = 1.0;
        let mut armor = 1.0;
        if f >= 100 { hp *= 2.0; armor *= 1.5; }
        if f >= 150 { hp *= 2.0; }                     // BUG: armor not scaled
        if f >= 200 { hp *= 2.0; armor *= 1.5; }
        if f >= 250 { hp *= 2.0; armor *= 1.5; }
        if f >= 300 { hp *= 2.0; armor *= 1.5; }
        if f >= 300 { hp *= 2.0; armor *= 1.5; }       // BUG: double-trigger
        if f >= 350 { hp *= 2.0; armor *= 1.5; }
        if f >= 400 { hp *= 2.0; armor *= 1.5; }
        if f >= 450 { hp *= 2.0; armor *= 1.5; }
        if f >= 500 { hp *= 2.0; armor *= 1.5; }
        out[f] = (hp, armor);
        f += 1;
    }
    out
}

/// Returns (hp_mult, armor_mult) for `floor`.  Floors above 500 are capped at
/// the floor-500 multipliers (the table doesn't extend further; combat doesn't
/// realistically reach that depth).
#[inline]
pub fn floor_scalars(floor: u32) -> (f64, f64) {
    let f = (floor as usize).min(500);
    FLOOR_SCALARS[f]
}

impl Block {
    /// Build a single block at the given floor with the player's card / global
    /// multipliers applied.  `p_exp_mult` and `p_frag_mult` should already be
    /// the cached values of `player.exp_gain_mult()` and
    /// `player.frag_loot_gain_mult()` — combat_loop.rs caches these once per
    /// run to avoid recomputing for every block.
    pub fn new(
        block_id: BlockId,
        current_floor: u32,
        player: &Player,
        p_exp_mult: f64,
        p_frag_mult: f64,
    ) -> Self {
        let base = &BLOCK_BASE_STATS[block_id.idx()];
        let (hp_mult, exp_mult, loot_mult) = player.get_card_bonuses(block_id);

        // HP / Armor floor scaling
        let (hp_scalar, armor_scalar) = floor_scalars(current_floor);
        let raw_hp = base.hp * hp_scalar;
        let armor = base.armor * armor_scalar;
        // Python: `round(raw_hp * hp_mult)` — banker's
        let hp = round_banker(raw_hp * hp_mult);

        // XP — mirrors block.py:
        //   raw_exp = base.xp * p_exp_mult * exp_mult
        //   floored_exp = floor((raw_exp + 1e-9) * 1000) / 1000.0   (3-decimal floor)
        //   if floored_exp > 100: xp = floor(floored_exp + 1e-9)
        //   else: xp = floored_exp
        let raw_exp = base.xp * p_exp_mult * exp_mult;
        let floored_exp = ((raw_exp + 1e-9) * 1000.0).floor() / 1000.0;
        let xp = if floored_exp > 100.0 {
            (floored_exp + 1e-9).floor()
        } else {
            floored_exp
        };

        // Frag — mirrors block.py:
        //   raw_frag = base.frag_amt * p_frag_mult * loot_mult
        //   frag_amt = floor((raw_frag + 1e-9) * 1000 + 0.5) / 1000.0   (3-decimal half-up)
        let raw_frag = base.frag_amt * p_frag_mult * loot_mult;
        let frag_amt = ((raw_frag + 1e-9) * 1000.0 + 0.5).floor() / 1000.0;

        Self {
            block_id,
            hp,
            armor,
            xp,
            frag_amt,
            frag_type: base.frag_type,
            modifiers: BlockModifiers::default(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn floor_scalars_table_match_known_floors() {
        // From block.py inline tests: floors 50, 101, 151, 301 must follow
        // the exact game-bug-preserving sequence.
        assert_eq!(floor_scalars(50),  (1.0, 1.0));
        // Floor 100: first doubling
        assert_eq!(floor_scalars(100), (2.0, 1.5));
        assert_eq!(floor_scalars(101), (2.0, 1.5));
        // Floor 150: HP doubles, armor does NOT (game bug)
        assert_eq!(floor_scalars(150), (4.0, 1.5));
        assert_eq!(floor_scalars(151), (4.0, 1.5));
        // Floor 300: armor multiplied by 1.5 TWICE (game bug)
        // hp: 2*2*2*2*2*2 = 64; armor: 1.5*1.5*1.5*1.5*1.5 = 7.59375
        // (line at 150 doesn't touch armor; 100/200/250/300/300 do = 5 scalings)
        assert_eq!(floor_scalars(300), (64.0, 1.5_f64.powi(5)));
        // Floor 500: every breakpoint hit
        // hp: 100, 150, 200, 250, 300, 300, 350, 400, 450, 500 = 10 doublings = 1024
        // armor: 100, 200, 250, 300, 300, 350, 400, 450, 500 = 9 * 1.5
        assert_eq!(floor_scalars(500), (1024.0, 1.5_f64.powi(9)));
    }

    #[test]
    fn floor_scalars_caps_at_500() {
        // Floors above 500 reuse the 500 multipliers.
        assert_eq!(floor_scalars(500), floor_scalars(501));
        assert_eq!(floor_scalars(500), floor_scalars(9999));
    }

    #[test]
    fn block_basic_no_cards() {
        let mut p = Player::new();
        p.cache_infernal_bonuses();
        let exp_m = p.exp_gain_mult();
        let frag_m = p.frag_loot_gain_mult();
        let b = Block::new(BlockId::Rare1, 50, &p, exp_m, frag_m);
        assert_eq!(b.hp, 550.0); // 550 base * 1.0 floor * 1.0 card
        assert_eq!(b.armor, 12.0);
        assert_eq!(b.frag_type, 2);
    }

    #[test]
    fn block_floor_scaling() {
        let mut p = Player::new();
        p.cache_infernal_bonuses();
        let exp_m = p.exp_gain_mult();
        let frag_m = p.frag_loot_gain_mult();
        let b50 = Block::new(BlockId::Rare1, 50, &p, exp_m, frag_m);
        let b101 = Block::new(BlockId::Rare1, 101, &p, exp_m, frag_m);
        // HP doubles, armor *= 1.5 at floor 100+
        assert_eq!(b101.hp, b50.hp * 2.0);
        assert_eq!(b101.armor, b50.armor * 1.5);
    }
}
