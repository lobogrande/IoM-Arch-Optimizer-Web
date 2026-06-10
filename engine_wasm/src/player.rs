//! Port of `public/core/player.py`.
//!
//! The Player carries the entire derived-stat surface of the engine.  Setters
//! populate flat `[f64; 56]` arrays for the F/H upgrade values and `[f64; 22]`
//! for the W external values; properties read those arrays directly so the
//! hot path is just array indexes + arithmetic (no hashing).
//!
//! Ascension gating: certain F/H rows are zeroed when the corresponding
//! Ascension is locked.  This is enforced at READ time (in `u_f`/`u_h`)
//! rather than at write time, matching Python.
//!
//! Infernal cache: `cache_infernal_bonuses()` precomputes all 28
//! `inf(block_id)` values once at sim start.  The cache is a `[f64; 28]`
//! indexed by `BlockId`.  Properties read directly from it.

use crate::project_config::{
    BlockId, Stat, BLOCK_ID_STRINGS, INTERNAL_UPGRADE_CAPS,
};

// ---------------------------------------------------------------------------
// Upgrade / external definitions (ported from Player.UPGRADE_DEF / EXTERNAL_DEF)
// ---------------------------------------------------------------------------

#[derive(Clone, Copy)]
struct UpgDef {
    f_mult: Option<f64>,
    h_mult: Option<f64>,
}

const fn upg(f: Option<f64>, h: Option<f64>) -> UpgDef {
    UpgDef { f_mult: f, h_mult: h }
}

/// Per-upgrade (F_mult, H_mult) for IDs 0..=55.  IDs without a row are
/// `UpgDef { f_mult: None, h_mult: None }`.
const UPGRADE_DEFS: [UpgDef; 56] = {
    let mut d = [upg(None, None); 56];
    d[3]  = upg(Some(2.0),     Some(0.0005));
    d[4]  = upg(Some(0.05),    Some(0.0005));
    d[5]  = upg(Some(0.02),    Some(0.0005));
    d[9]  = upg(Some(1.0),     None);
    d[10] = upg(Some(1.0),     None);
    d[11] = upg(Some(0.02),    None);
    d[12] = upg(Some(1.0),     None);
    d[13] = upg(Some(0.0025),  Some(0.01));
    d[14] = upg(Some(2.0),     Some(0.0005));
    d[15] = upg(Some(2.0),     None);
    d[16] = upg(Some(0.3),     None);
    d[17] = upg(Some(3.0),     None);
    d[18] = upg(Some(0.02),    Some(-1.0));
    d[19] = upg(Some(0.001),   None);
    d[20] = upg(Some(2.0),     Some(0.0035));
    d[21] = upg(Some(0.03),    Some(0.02));
    d[22] = upg(Some(1.0),     Some(-1.0));
    d[23] = upg(Some(4.0),     Some(1.0));
    d[24] = upg(Some(0.0002),  None);
    d[25] = upg(Some(0.2),     Some(0.001));
    d[26] = upg(Some(1.0),     Some(0.0002));
    d[27] = upg(Some(0.05),    None);
    d[28] = upg(Some(0.05),    Some(0.01));
    d[29] = upg(Some(0.02),    Some(-1.0));
    d[30] = upg(Some(0.02),    Some(0.02));
    d[31] = upg(Some(1.0),     Some(-2.0));
    d[32] = upg(Some(3.0),     Some(-1.0));
    d[33] = upg(Some(0.0001),  Some(1.0));
    d[34] = upg(Some(0.2),     None);
    d[35] = upg(Some(0.01),    Some(0.0001));
    d[36] = upg(Some(0.02),    Some(3.0));
    d[37] = upg(Some(0.0035),  Some(0.01));
    d[38] = upg(Some(0.1),     Some(0.001));
    d[39] = upg(Some(0.003),   Some(4.0));
    d[40] = upg(Some(0.02),    Some(0.0003));
    d[41] = upg(Some(0.15),    None);
    // 42 is the Frag Gain Mult special case (None/None); handled in setter.
    d[43] = upg(Some(2.0),     None);
    d[44] = upg(Some(0.015),   None);
    d[45] = upg(Some(2.0),     Some(5.0));
    d[46] = upg(Some(0.03),    None);
    d[47] = upg(Some(0.01),    Some(0.01));
    d[48] = upg(Some(0.01),    Some(0.01));
    d[49] = upg(Some(3.0),     Some(0.005));
    d[50] = upg(Some(0.001),   Some(0.001));
    d[51] = upg(Some(0.1),     Some(0.1));
    d[52] = upg(Some(0.002),   Some(0.0002));
    d[53] = upg(Some(0.005),   Some(0.02));
    d[54] = upg(Some(0.005),   Some(0.002));
    d[55] = upg(Some(0.02),    None);
    d
};

/// Asc1-locked upgrade IDs.  When `asc1_unlocked = false`, F/H values for
/// these rows read as 0.0.  From `Player.u()` in player.py.
const ASC1_LOCKED_UPGRADES: &[u8] = &[12, 17, 24, 32, 40, 47, 48, 49, 50, 51, 53, 54];
/// Asc2-locked upgrade IDs.
const ASC2_LOCKED_UPGRADES: &[u8] = &[19, 27, 34, 46, 52, 55];

/// Per-block infernal base bonuses (paired with each BlockId by index).
/// Mirrors the `bases` dict inside `Player._cache_infernal_bonuses()` /
/// `Player.inf()`.
const INFERNAL_BASES: [f64; BlockId::COUNT] = [
    // Tier 1: dirt1, com1, rare1, epic1, leg1, myth1, div1
    0.1,   0.06,  0.05,  0.3,   0.04,  0.013, 0.1,
    // Tier 2
    0.12,  0.07,  20.0,  0.04,  0.05,  0.008, 0.0125,
    // Tier 3
    0.08,  0.08,  0.4,   0.05,  40.0,  0.007, 1.0,
    // Tier 4
    0.1,   0.015, 0.08,  0.1,   20.0,  0.01,  0.005,
];

// ---------------------------------------------------------------------------
// Rounding helpers
// ---------------------------------------------------------------------------

/// Python-style banker's rounding (round half to even).
/// Python `round(2502.5) == 2502` (even); Rust `(2502.5_f64).round() == 2503`.
/// Many of the Player @properties end with this; matching to last ULP requires it.
pub fn round_banker(x: f64) -> f64 {
    if !x.is_finite() {
        return x;
    }
    let truncated = x.trunc();
    let fract = x - truncated;
    let abs_fract = fract.abs();
    if abs_fract < 0.5 {
        truncated
    } else if abs_fract > 0.5 {
        truncated + fract.signum()
    } else {
        // Exactly N.5 — pick the even neighbor.
        let lo = truncated;
        let hi = truncated + fract.signum();
        if (lo as i64) % 2 == 0 { lo } else { hi }
    }
}

/// Python-style `round(value, decimals)` — banker's rounding to N decimal places.
///
/// Why not `round_banker(val * 10^N) / 10^N`?  Because the `val * 10^N`
/// multiplication can shift `val` across a 0.5-tie boundary in f64, giving
/// the wrong answer.  Python `round(3.135, 2) == 3.13` because the actual
/// f64 closest to 3.135 is 3.1349999..., which is unambiguously closer to
/// 3.13.  But `3.13499... * 100` may round-up to exactly 313.5 in f64
/// multiplication, which banker's rounding then sends to 314.
///
/// Format-then-parse routes through the same decimal round-half-to-even
/// rule Python's `%.Nf` uses, giving bit-identical results.
fn gm_mult(val: f64, decimals: i32) -> f64 {
    if !val.is_finite() {
        return val;
    }
    let s = format!("{val:.*}", decimals as usize);
    s.parse::<f64>().expect("formatted float must parse")
}

/// GameMaker-style integer rounding with caller-specified drift.
///   drift = 0  : half-up (NOT banker's). 0.5 always rounds away from zero.
///   drift = 1  : ceil
///   drift = -1 : floor
fn gm_int(val: f64, drift: i32) -> f64 {
    match drift {
        0 => {
            if val >= 0.0 { (val + 0.5).floor() } else { -((-val + 0.5).floor()) }
        }
        1 => val.ceil(),
        -1 => val.floor(),
        _ => panic!("invalid gm_int drift {drift}"),
    }
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

#[derive(Clone)]
pub struct Player {
    pub asc1_unlocked: bool,
    pub asc2_unlocked: bool,
    pub arch_level: u32,
    pub current_max_floor: u32,
    pub base_damage_const: f64,
    pub hades_idol_level: u32,
    pub total_infernal_cards: u32,
    pub arch_ability_infernal_bonus: f64,
    pub starting_speed_pool: u32,

    /// Base stat values, indexed by `Stat as usize`.
    pub base_stats: [u32; Stat::COUNT],

    /// Raw upgrade levels for IDs 0..=55.  0 means "not purchased".
    pub upgrade_levels: [u32; 56],

    /// Pre-multiplied F values (lvl * f_mult).  Read via `u_f()` which gates
    /// on ascension.
    pub upgrades_f: [f64; 56],
    /// Pre-multiplied H values (lvl * h_mult).
    pub upgrades_h: [f64; 56],

    /// External upgrade levels, indexed by external ID.  IDs 0..=3 are
    /// unused; valid IDs are 4..=21. Can be -1 (not unlocked), 0 (unlocked),
    /// or 1..=11 (upgraded).
    pub external_levels: [i32; 22],
    /// Pre-computed external W values, indexed by external ID.
    /// Special: row 8 (Geoduck) stores the raw value here; `w()` applies
    /// the ascension-dependent cap on read.
    pub external_w: [f64; 22],

    /// Card levels, indexed by `BlockId as usize`.  Range 0..=4 (4 = Infernal).
    pub cards: [u32; BlockId::COUNT],

    /// Precomputed per-block infernal bonuses.  Populated by
    /// `cache_infernal_bonuses()`; read via `inf()` from properties.
    pub infernal_cache: [f64; BlockId::COUNT],
}

impl Player {
    pub fn new() -> Self {
        let mut p = Self {
            asc1_unlocked: false,
            asc2_unlocked: false,
            arch_level: 1,
            current_max_floor: 100,
            base_damage_const: 10.0,
            hades_idol_level: 0,
            total_infernal_cards: 0,
            arch_ability_infernal_bonus: 0.0,
            starting_speed_pool: 0,
            base_stats: [0; Stat::COUNT],
            upgrade_levels: [0; 56],
            upgrades_f: [0.0; 56],
            upgrades_h: [0.0; 56],
            external_levels: [0; 22],
            external_w: [0.0; 22],
            cards: [0; BlockId::COUNT],
            infernal_cache: [0.0; BlockId::COUNT],
        };
        // Match Python's __init__: walk every UPGRADE_DEF / EXTERNAL_DEF
        // entry through the setter at level 0 so derived dicts are populated.
        for row in 0u8..56 {
            p.set_upgrade_level(row, 0);
        }
        for row in 4u8..=21 {
            p.set_external_level(row, 0);
        }
        p
    }

    // -----------------------------------------------------------------------
    // Setters
    // -----------------------------------------------------------------------

    pub fn set_upgrade_level(&mut self, row: u8, mut lvl: u32) {
        let row_idx = row as usize;
        if row_idx >= 56 {
            return;
        }
        let cap = INTERNAL_UPGRADE_CAPS[row_idx];
        if cap > 0 {
            let mut effective_cap = cap;
            // Gem upgrades (3, 4, 5) have dynamic cap: arch_level + 4
            if row == 3 || row == 4 || row == 5 {
                let gem_cap = self.arch_level + 4;
                if gem_cap < effective_cap { effective_cap = gem_cap; }
            }
            if lvl > effective_cap { lvl = effective_cap; }
        }
        self.upgrade_levels[row_idx] = lvl;

        if row == 42 {
            // "Frag Gain Mult" — F42 is 1.0 (locked) or 1.25 (level 1).
            self.upgrades_f[42] = if lvl == 0 { 1.0 } else { 1.25 };
            return;
        }

        let def = UPGRADE_DEFS[row_idx];
        if let Some(f_mult) = def.f_mult {
            self.upgrades_f[row_idx] = lvl as f64 * f_mult;
        }
        if let Some(h_mult) = def.h_mult {
            self.upgrades_h[row_idx] = lvl as f64 * h_mult;
        }
    }

    pub fn set_external_level(&mut self, row: u8, lvl: i32) {
        let row_idx = row as usize;
        if row_idx >= 22 {
            return;
        }
        self.external_levels[row_idx] = lvl;
        let l = lvl as f64;
        match row {
            4  => self.external_w[4]  = l * 0.0001,
            5  => self.external_w[5]  = (1.0 + l) * 0.03,
            6  => self.external_w[6]  = (1.0 + l) * 50.0,
            7  => self.external_w[7]  = (1.0 + l) * 30.0,
            8  => self.external_w[8]  = l * 0.0025, // raw — cap applied in w()
            9  => self.external_w[9]  = l * 5.0,
            10 => self.external_w[10] = l * -10.0,
            11 => self.external_w[11] = l * 0.03,
            12 => self.external_w[12] = l * 0.01,
            13 => self.external_w[13] = l * 0.01,
            14 => self.external_w[14] = l * 1.0,
            15 => self.external_w[15] = (l * 1.25).max(1.0),
            16 => self.external_w[16] = (l * 1.15).max(1.0),
            17 => self.external_w[17] = l * 0.05,
            18 => self.external_w[18] = l * 0.02,
            19 => self.external_w[19] = l * 0.02,
            20 => {
                self.external_w[20] = match lvl {
                    0 => 0.0,
                    1 => -0.03,
                    2 => -0.06,
                    3 => -0.10,
                    _ => self.arch_ability_infernal_bonus, // lvl >= 4
                };
            }
            21 => self.hades_idol_level = lvl.max(0) as u32,
            _ => {}
        }
    }

    pub fn set_card_level(&mut self, block: BlockId, lvl: u32) {
        self.cards[block.idx()] = lvl;
    }

    // -----------------------------------------------------------------------
    // Accessors (ascension gating)
    // -----------------------------------------------------------------------

    /// `u('F{row}')` — F-value of upgrade `row`, 0.0 if ascension-gated.
    #[inline]
    pub fn u_f(&self, row: u8) -> f64 {
        if !self.asc1_unlocked && ASC1_LOCKED_UPGRADES.contains(&row) { return 0.0; }
        if !self.asc2_unlocked && ASC2_LOCKED_UPGRADES.contains(&row) { return 0.0; }
        self.upgrades_f[row as usize]
    }

    /// `u('H{row}')` — H-value of upgrade `row`, 0.0 if ascension-gated.
    #[inline]
    pub fn u_h(&self, row: u8) -> f64 {
        if !self.asc1_unlocked && ASC1_LOCKED_UPGRADES.contains(&row) { return 0.0; }
        if !self.asc2_unlocked && ASC2_LOCKED_UPGRADES.contains(&row) { return 0.0; }
        self.upgrades_h[row as usize]
    }

    /// `w('W{row}')` — external value, 0.0 default. Handles W4 Asc1 gate and
    /// W8 Geoduck cap (50% pre-Asc2, 75% Asc2).
    #[inline]
    pub fn w(&self, row: u8) -> f64 {
        self.w_or(row, 0.0)
    }

    /// `w('W{row}', default)` — variant with caller-supplied default.
    pub fn w_or(&self, row: u8, default: f64) -> f64 {
        if row == 4 && !self.asc1_unlocked {
            return 0.0;
        }
        if row == 8 {
            // Geoduck cap is ascension-dependent.
            let cap = if self.asc2_unlocked { 0.75 } else { 0.50 };
            return self.external_w[8].min(cap);
        }
        // For rows where 0 isn't a sensible default (e.g. some multipliers
        // start at 1.0), the caller passes the right default and Python's
        // `external.get(cell, default)` returns it for unset rows.  Our W
        // array is always populated by set_external_level, so we use the
        // stored value unless it's exactly 0.0 AND the caller asked for a
        // different default (matching dict.get() semantics).
        let stored = self.external_w[row as usize];
        if stored == 0.0 && self.external_levels[row as usize] <= 0 && default != 0.0 {
            default
        } else {
            stored
        }
    }

    /// `stat(name)` — base stat with Asc gating for Div / Corr.
    #[inline]
    pub fn stat(&self, s: Stat) -> u32 {
        match s {
            Stat::Div if !self.asc1_unlocked => 0,
            Stat::Corr if !self.asc2_unlocked => 0,
            _ => self.base_stats[s as usize],
        }
    }

    /// Cached infernal bonus for `block`.  Must call `cache_infernal_bonuses()`
    /// first; properties assume cache is fresh.
    #[inline]
    pub fn inf(&self, block: BlockId) -> f64 {
        self.infernal_cache[block.idx()]
    }

    // -----------------------------------------------------------------------
    // Card bonuses
    // -----------------------------------------------------------------------

    /// `get_card_bonuses(block_id)` → (hp_mult, exp_mult, loot_mult).
    /// Mirrors `Player.get_card_bonuses` in player.py.
    pub fn get_card_bonuses(&self, block: BlockId) -> (f64, f64, f64) {
        if !self.asc2_unlocked && BLOCK_ID_STRINGS[block.idx()].ends_with('4') {
            return (1.0, 1.0, 1.0);
        }
        let lvl = self.cards[block.idx()];
        match lvl {
            1 => (0.90, 1.10, 1.10),
            2 => (0.80, 1.20, 1.20),
            _ if lvl >= 3 => {
                let poly_bonus = 0.35 + self.u_f(41);
                (1.0 - poly_bonus, 1.0 + poly_bonus, 1.0 + poly_bonus)
            }
            _ => (1.0, 1.0, 1.0),
        }
    }

    // -----------------------------------------------------------------------
    // Infernal cache + arch_infernal_cards + infernal_multiplier
    // -----------------------------------------------------------------------

    pub fn arch_infernal_cards(&self) -> u32 {
        if !self.asc1_unlocked { return 0; }
        self.cards.iter().filter(|&&lvl| lvl == 4).count() as u32
    }

    pub fn infernal_multiplier(&self) -> f64 {
        let hades_bonus = if self.asc1_unlocked {
            self.hades_idol_level as f64 * 0.000045
        } else { 0.0 };
        let arch_bonus = 1.0
            + 0.04 * self.arch_infernal_cards() as f64
            + 0.002 * self.total_infernal_cards as f64;
        arch_bonus * (1.0 + hades_bonus)
    }

    /// Pre-compute all 28 per-block infernal bonuses.  Called once at sim
    /// start; properties read directly from `self.infernal_cache` afterward.
    pub fn cache_infernal_bonuses(&mut self) {
        if !self.asc1_unlocked {
            self.infernal_cache = [0.0; BlockId::COUNT];
            return;
        }
        let inf_mult = self.infernal_multiplier();
        for i in 0..BlockId::COUNT {
            let is_tier4 = i >= 21;
            if is_tier4 && !self.asc2_unlocked {
                self.infernal_cache[i] = 0.0;
            } else if self.cards[i] == 4 {
                self.infernal_cache[i] = INFERNAL_BASES[i] * inf_mult;
            } else {
                self.infernal_cache[i] = 0.0;
            }
        }
    }

    // -----------------------------------------------------------------------
    // Combat property calculations (port of @property methods)
    // Each function returns the same f64 value Python's property would return,
    // bit-identical when the input state matches.
    // -----------------------------------------------------------------------

    pub fn max_sta(&self) -> f64 {
        let base_calc = 100.0 + self.u_f(14) + self.u_f(23) + self.u_h(39) + self.u_f(3)
            + round_banker(self.inf(BlockId::Leg4));
        let stat_calc = self.stat(Stat::Agi) as f64 * (5.0 + self.u_f(26));
        let asc2_calc = (1.0 + self.u_h(28) + self.u_f(54))
            * (1.0 - 0.03 * self.stat(Stat::Corr) as f64);
        let bb_mult = 1.0 + self.w(13) * self.current_max_floor.min(100) as f64;
        let val = (base_calc + stat_calc) * asc2_calc * bb_mult * (1.0 + self.inf(BlockId::Epic3));
        round_banker(val)
    }

    pub fn damage(&self) -> f64 {
        let base_calc = self.u_f(9) + self.u_f(15) + self.u_f(20) + self.u_f(32) + self.u_f(49)
            + round_banker(self.inf(BlockId::Rare2));
        let stat_calc1 = self.stat(Stat::Str) as f64 * (1.0 + self.u_f(25));
        let stat_calc2 = self.stat(Stat::Div) as f64 * (2.0 + self.u_f(34));
        let mult1 = 1.0 + self.u_f(51) + self.u_f(36)
            + self.stat(Stat::Str) as f64 * (0.01 + self.u_f(47) + self.u_h(25))
            + self.inf(BlockId::Div1);
        let mult2 = (0.06 + self.u_f(52)) * self.stat(Stat::Corr) as f64;
        let bb_mult = 1.0 + self.w(12) * self.current_max_floor.min(100) as f64;
        let val = (base_calc + stat_calc1 + stat_calc2 + self.base_damage_const)
            * (mult1 + mult2) * bb_mult;
        round_banker(val)
    }

    pub fn enraged_damage(&self) -> f64 {
        let base_calc = self.u_f(9) + self.u_f(15) + self.u_f(20) + self.u_f(32) + self.u_f(49)
            + round_banker(self.inf(BlockId::Rare2));
        let stat_calc1 = self.stat(Stat::Str) as f64 * (1.0 + self.u_f(25));
        let stat_calc2 = self.stat(Stat::Div) as f64 * (2.0 + self.u_f(34));
        let mult1 = 1.0 + self.u_f(51) + self.u_f(36)
            + self.stat(Stat::Str) as f64 * (0.01 + self.u_f(47) + self.u_h(25))
            + self.inf(BlockId::Div1);
        let mult2 = (0.06 + self.u_f(52)) * self.stat(Stat::Corr) as f64;
        let enrage_mult = 0.2 + self.u_f(18);
        let bb_mult = 1.0 + self.w(12) * self.current_max_floor.min(100) as f64;
        let val = (base_calc + stat_calc1 + stat_calc2 + self.base_damage_const)
            * (mult1 + mult2 + enrage_mult) * bb_mult;
        round_banker(val)
    }

    pub fn armor_pen(&self) -> f64 {
        let stat_calc = self.stat(Stat::Per) as f64 * (2.0 + self.u_h(33));
        let base_ap = self.u_f(10) + self.u_f(17) + self.u_h(36) + stat_calc
            + round_banker(self.inf(BlockId::Leg3));
        let upg_mult = 1.0 + 0.03 * self.stat(Stat::Int) as f64 + self.u_f(29);
        let card_mult = 1.0 + self.inf(BlockId::Rare3);
        round_banker(base_ap * upg_mult * card_mult)
    }

    pub fn atk_spd(&self) -> f64 { 1.0 }

    pub fn crit_chance(&self) -> f64 {
        self.u_f(13)
            + 0.02 * self.stat(Stat::Luck) as f64
            + 0.01 * self.stat(Stat::Agi) as f64
            + self.inf(BlockId::Com4)
    }

    pub fn crit_dmg_mult(&self) -> f64 {
        let inner = 1.0 + self.u_h(13) + self.u_f(30)
            + (0.03 + self.u_h(47)) * self.stat(Stat::Str) as f64;
        let val = 1.5 * inner * (1.0 + self.inf(BlockId::Com1)) * (1.0 + self.inf(BlockId::Epic4));
        gm_mult(val, 2)
    }

    pub fn enraged_crit_dmg_mult(&self) -> f64 {
        let inner = 1.0 + self.u_h(13) + self.u_f(30)
            + (0.03 + self.u_h(47)) * self.stat(Stat::Str) as f64;
        let val = 1.5 * (inner * (1.0 + self.inf(BlockId::Com1)) * (1.0 + self.inf(BlockId::Epic4))
            + (1.0 + self.u_f(18)));
        gm_mult(val, 2)
    }

    pub fn super_crit_chance(&self) -> f64 {
        self.u_h(20) + self.u_f(37)
            + (0.02 + 0.01 * self.u_f(34)) * self.stat(Stat::Div) as f64
            + self.inf(BlockId::Epic2) + self.inf(BlockId::Com4)
    }

    pub fn super_crit_dmg_mult(&self) -> f64 {
        if self.super_crit_chance() <= 0.0 { return 0.0; }
        let inner = 1.0 + self.u_h(30) + self.u_f(53);
        let val = 2.0 * inner * (1.0 + self.inf(BlockId::Com2));
        gm_mult(val, 2)
    }

    pub fn ultra_crit_chance(&self) -> f64 {
        self.u_h(37) + self.u_h(49) + self.inf(BlockId::Com4)
    }

    pub fn ultra_crit_dmg_mult(&self) -> f64 {
        if self.ultra_crit_chance() <= 0.0 { return 0.0; }
        let inner = (1.0 + self.u_f(40)) * (1.0 + self.inf(BlockId::Com3));
        gm_mult(3.0 * inner, 2)
    }

    pub fn ability_insta_charge(&self) -> f64 {
        self.w(11) + self.u_f(39) + self.u_f(50) + self.inf(BlockId::Myth4)
    }

    pub fn crosshair_auto_tap(&self) -> f64 {
        self.w(17) + self.u_h(48) + self.u_h(54)
            + (0.02 + 0.01 * self.u_f(34)) * self.stat(Stat::Div) as f64
            + self.inf(BlockId::Rare1)
    }

    pub fn gold_crosshair_chance(&self) -> f64 {
        self.w(19) + self.u_f(48) + 0.005 * self.stat(Stat::Luck) as f64
            + self.inf(BlockId::Leg2)
    }

    pub fn gold_crosshair_mult(&self) -> f64 {
        gm_mult(3.0 * (1.0 + self.inf(BlockId::Epic1)), 2)
    }

    pub fn exp_gain_mult(&self) -> f64 {
        let stat_calc = self.stat(Stat::Int) as f64 * (0.05 + self.u_f(35));
        let mut val = 1.0 + self.u_f(4) + self.u_f(11) + self.u_f(21) + self.u_f(28)
            + self.u_h(51) + stat_calc;
        val *= self.u_f(45).max(1.0) * self.w_or(16, 1.0) * (1.0 + self.inf(BlockId::Dirt2));
        gm_mult(val, 2)
    }

    pub fn frag_loot_gain_mult(&self) -> f64 {
        let stat_calc = self.stat(Stat::Per) as f64 * 0.04;
        let base_val = 1.0 + self.u_f(5) + self.u_h(21) + stat_calc;
        
        let w4 = self.w(4);
        let w5 = self.w(5);
        let w8 = self.w(8);
        let mult1 = (1.0 + w4) * (1.0 + w5) * (1.0 + w8);
        
        let u_f_42 = self.u_f(42);
        let w15 = self.w_or(15, 1.0);
        let inf_dirt3 = self.inf(BlockId::Dirt3);
        let inf_leg1 = self.inf(BlockId::Leg1);
        let mult2 = u_f_42 * w15 * (1.0 + inf_dirt3) * (1.0 + inf_leg1);
        
        let mut val = base_val;
        val *= mult1;
        val *= mult2;
        gm_mult(val, 2)
    }

    pub fn exp_mod_chance(&self) -> f64 {
        self.u_h(38) + self.u_h(4)
            + 0.002 * self.stat(Stat::Luck) as f64
            + (0.003 + self.u_h(35)) * self.stat(Stat::Int) as f64
            + self.u_f(24) + self.u_f(44) + self.inf(BlockId::Div4)
    }

    pub fn exp_mod_gain(&self) -> f64 {
        (3.0 + self.u_f(38) + self.u_h(53))
            * (1.0 + self.u_f(55)
                + self.stat(Stat::Corr) as f64 * (0.01 + self.u_h(52)))
    }

    pub fn loot_mod_chance(&self) -> f64 {
        self.u_h(5) + self.u_f(24) + self.u_f(44) + self.w(18)
            + (0.003 + self.u_f(33)) * self.stat(Stat::Per) as f64
            + 0.002 * self.stat(Stat::Luck) as f64
            + self.inf(BlockId::Myth2) + self.inf(BlockId::Div4)
    }

    pub fn loot_mod_gain(&self) -> f64 {
        (2.0 + self.u_f(16) + self.u_f(27))
            * (1.0 + self.u_f(55)
                + self.stat(Stat::Corr) as f64 * (0.01 + self.u_h(52)))
            * (1.0 + self.inf(BlockId::Dirt1))
            * (1.0 + self.inf(BlockId::Rare4))
    }

    pub fn speed_mod_chance(&self) -> f64 {
        self.u_f(24) + self.u_f(44)
            + (0.002 + self.u_h(26)) * self.stat(Stat::Agi) as f64
            + 0.002 * self.stat(Stat::Luck) as f64
            + self.inf(BlockId::Div4)
    }

    pub fn speed_mod_gain(&self) -> f64 {
        let base_val = (10.0 + 15.0 * self.w(14))
            * (1.0 + self.u_f(55)
                + self.stat(Stat::Corr) as f64 * (0.01 + self.u_h(52)));
        gm_int(base_val, 0)
    }

    pub fn speed_mod_attack_rate(&self) -> f64 { 2.0 }

    pub fn stamina_mod_chance(&self) -> f64 {
        self.u_h(3) + self.u_h(14) + self.u_f(24) + self.u_f(44) + self.u_h(40) + self.u_h(50)
            + 0.002 * self.stat(Stat::Luck) as f64
            + self.inf(BlockId::Myth3) + self.inf(BlockId::Div4)
    }

    pub fn stamina_mod_gain(&self) -> f64 {
        let val = (3.0 + self.u_f(43) + self.u_h(23) + round_banker(self.inf(BlockId::Div3)))
            * (1.0 + self.u_f(55)
                + self.stat(Stat::Corr) as f64 * (0.01 + self.u_h(52)));
        round_banker(val)
    }

    pub fn gleaming_floor_chance(&self) -> f64 {
        if self.asc2_unlocked {
            self.u_f(19) + self.inf(BlockId::Myth1) + self.inf(BlockId::Div2)
        } else {
            0.0
        }
    }

    pub fn gleaming_floor_multi(&self) -> f64 {
        if self.asc2_unlocked {
            (3.0 + self.u_f(46)) * (1.0 + self.inf(BlockId::Dirt4))
        } else {
            1.0
        }
    }

    pub fn enrage_charges(&self) -> f64 {
        5.0 + self.w(9)
    }

    pub fn enrage_cooldown(&self) -> f64 {
        let val = (60.0 + self.u_h(18) + self.u_h(29) + self.u_h(32) + self.w(10))
            * (1.0 + self.w(20));
        gm_int(val, 1)
    }

    pub fn enrage_bonus_dmg(&self) -> f64 { 0.2 + self.u_f(18) }

    pub fn enrage_bonus_crit_dmg(&self) -> f64 { 1.0 + self.u_f(18) }

    pub fn flurry_duration(&self) -> f64 {
        5.0 + self.w(9)
    }

    pub fn flurry_cooldown(&self) -> f64 {
        // GAME BUG: H32 only supposed to apply to Enrage but applies here too.
        let val = (120.0 + self.u_h(22) + self.u_h(29) + self.u_h(32) + self.w(10))
            * (1.0 + self.w(20));
        gm_int(val, 1)
    }

    pub fn flurry_bonus_atk_spd(&self) -> f64 { 1.0 }

    pub fn flurry_sta_on_cast(&self) -> f64 {
        5.0 + self.u_f(22)
    }

    pub fn quake_attacks(&self) -> f64 {
        5.0 + self.u_f(31) + self.w(9)
    }

    pub fn quake_cooldown(&self) -> f64 {
        // GAME BUG: same H32 issue as flurry_cooldown.
        let val = (180.0 + self.u_h(29) + self.u_h(31) + self.u_h(32) + self.w(10))
            * (1.0 + self.w(20));
        gm_int(val, 1)
    }

    pub fn quake_dmg_to_all(&self) -> f64 { 0.2 }
}

impl Default for Player {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_banker_matches_python() {
        // Python: round(2502.5) → 2502 (round-half-to-even)
        assert_eq!(round_banker(2502.5), 2502.0);
        assert_eq!(round_banker(2503.5), 2504.0);
        assert_eq!(round_banker(0.5), 0.0);
        assert_eq!(round_banker(1.5), 2.0);
        assert_eq!(round_banker(2.5), 2.0);
        assert_eq!(round_banker(-0.5), 0.0);
        assert_eq!(round_banker(-1.5), -2.0);
        assert_eq!(round_banker(-2.5), -2.0);
        // Non-halfway values: normal nearest
        assert_eq!(round_banker(0.4), 0.0);
        assert_eq!(round_banker(0.6), 1.0);
    }

    #[test]
    fn gm_int_matches_python() {
        // drift=0 — half-up
        assert_eq!(gm_int(2.5, 0), 3.0);
        assert_eq!(gm_int(2.4, 0), 2.0);
        assert_eq!(gm_int(-2.5, 0), -3.0);
        // drift=1 — ceil
        assert_eq!(gm_int(2.1, 1), 3.0);
        assert_eq!(gm_int(-2.1, 1), -2.0);
        // drift=-1 — floor
        assert_eq!(gm_int(2.9, -1), 2.0);
        assert_eq!(gm_int(-2.1, -1), -3.0);
    }

    #[test]
    fn fresh_player_defaults() {
        let p = Player::new();
        assert_eq!(p.arch_level, 1);
        assert_eq!(p.current_max_floor, 100);
        assert_eq!(p.base_damage_const, 10.0);
        // F42 is initialized to 1.0 at level 0 (special case)
        assert_eq!(p.upgrades_f[42], 1.0);
        // External 15/16 default to 1.0 minimum
        assert_eq!(p.external_w[15], 1.0);
        assert_eq!(p.external_w[16], 1.0);
    }

    #[test]
    fn set_upgrade_caps() {
        let mut p = Player::new();
        // Try to set upgrade 8 to 100 — should clamp to 3
        p.set_upgrade_level(8, 100);
        assert_eq!(p.upgrade_levels[8], 3);
        // Try setting Gem Stamina (3) above arch_level + 4 cap
        p.arch_level = 5;
        p.set_upgrade_level(3, 50);
        assert_eq!(p.upgrade_levels[3], 9); // min(50, 5+4)
    }

    #[test]
    fn ascension_gates_stat() {
        let mut p = Player::new();
        p.base_stats[Stat::Div as usize] = 5;
        p.base_stats[Stat::Corr as usize] = 5;
        // Pre-Asc1: Div hidden
        assert_eq!(p.stat(Stat::Div), 0);
        assert_eq!(p.stat(Stat::Corr), 0);
        p.asc1_unlocked = true;
        assert_eq!(p.stat(Stat::Div), 5);
        assert_eq!(p.stat(Stat::Corr), 0); // Corr still gated until Asc2
        p.asc2_unlocked = true;
        assert_eq!(p.stat(Stat::Corr), 5);
    }

    #[test]
    fn infernal_cache_basics() {
        let mut p = Player::new();
        p.asc1_unlocked = true;
        // 1 infernal card of rare2 (base value 20.0)
        p.cards[BlockId::Rare2.idx()] = 4;
        p.total_infernal_cards = 1;
        p.cache_infernal_bonuses();
        // infernal_multiplier = (1 + 0.04*1 + 0.002*1) * 1 = 1.042
        // rare2 bonus = 20.0 * 1.042 = 20.84
        let bonus = p.inf(BlockId::Rare2);
        assert!((bonus - 20.84).abs() < 1e-9, "rare2 inf bonus = {bonus}");
    }
}
