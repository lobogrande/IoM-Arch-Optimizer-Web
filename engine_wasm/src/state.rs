//! Packed binary serialization for the `extern "C"` `engine_run_simulation`
//! API.  JS writes a Player state into bytes via `engine_alloc`, calls
//! `engine_run_simulation(ptr, len, seed)`, then reads the result bytes from
//! the returned pointer.
//!
//! Format is little-endian throughout (browsers + Node share this) and
//! UNALIGNED (callers can pack at any byte offset; we use `from_le_bytes`
//! everywhere so alignment is irrelevant on read).
//!
//! Schema version is bumped any time the layout changes; JS asserts a match
//! at boot via `engine_schema_version()` (defined in lib.rs).
//!
//! ## Input layout (484 bytes, fixed)
//!
//! ```text
//!  off  size  field
//!  0    1     schema_version (= 1)
//!  1    1     asc1_unlocked (u8 bool)
//!  2    1     asc2_unlocked (u8 bool)
//!  3    1     _pad
//!  4    4     arch_level (u32)
//!  8    4     current_max_floor (u32)
//!  12   4     hades_idol_level (u32)
//!  16   4     total_infernal_cards (u32)
//!  20   4     starting_speed_pool (u32)
//!  24   8     arch_ability_infernal_bonus (f64)
//!  32   4×7   base_stats[7] (u32 each)  — Str/Agi/Per/Int/Luck/Div/Corr
//!  60   4×56  upgrade_levels[56] (u32 each) — indexed by upgrade ID 0..55
//!  284  4×22  external_levels[22] (i32 each) — IDs 0..21 (0..3 unused, can be -1)
//!  372  4×28  cards[28] (u32 each) — indexed by BlockId 0..27
//!  484  END
//! ```
//!
//! ## Output layout (596 bytes fixed header + 12 × N variable tail)
//!
//! ```text
//!  off  size      field
//!  0    1         schema_version (= 1)
//!  1    3         _pad
//!  4    4         highest_floor (u32)
//!  8    4         blocks_mined (u32)
//!  12   4         crosshair_spawns (u32)
//!  16   4         total_flurry_casts (u32)
//!  20   4         total_enrage_casts (u32)
//!  24   4         total_quake_casts (u32)
//!  28   4         total_instacharges (u32)
//!  32   4×4       hit_counts[normal/crit/super/ultra] (u32 each)
//!  48   8         total_time (f64)
//!  56   8         total_xp (f64)
//!  64   8         total_stamina_spent (f64)
//!  72   8         crosshair_damage (f64)
//!  80   8         melee_damage (f64)
//!  88   8         quake_damage (f64)
//!  96   8         overkill_damage (f64)
//!  104  8         stamina_refunded_flurry (f64)
//!  112  8         stamina_refunded_mods (f64)
//!  120  8         stamina_wasted_overcap (f64)
//!  128  8         speed_pool (f64)
//!  136  8         stamina (f64)
//!  144  8         crosshair_timer (f64)
//!  152  8×7       total_frags[7] (f64 each)
//!  208  4×4       div_tier_kills[div1..div4] (u32 each)
//!  224  8×4       div_tier_frags[div1..div4] (f64 each)
//!  256  4×28      specific_blocks_mined[BlockId 0..27] (u32 each)
//!  368  8×28      specific_blocks_frags[BlockId 0..27] (f64 each)
//!  592  4         history_len = N (u32)
//!  596  4×N       history_floor[N] (u32 each)
//!  596+4N 8×N     history_stamina[N] (f64 each)
//! ```

use crate::combat_loop::RunState;
use crate::player::Player;
use crate::project_config::{BlockId, Stat};

pub const SCHEMA_VERSION: u8 = 1;

pub const INPUT_SIZE: usize = 484;
pub const OUTPUT_HEADER_SIZE: usize = 596;

#[derive(Debug)]
pub enum DecodeError {
    TooShort { got: usize, need: usize },
    WrongSchema { got: u8, expected: u8 },
}

#[inline] fn read_u32(b: &[u8], o: usize) -> u32 {
    u32::from_le_bytes(b[o..o + 4].try_into().unwrap())
}
#[inline] fn read_i32(b: &[u8], o: usize) -> i32 {
    i32::from_le_bytes(b[o..o + 4].try_into().unwrap())
}
#[inline] fn read_f64(b: &[u8], o: usize) -> f64 {
    f64::from_le_bytes(b[o..o + 8].try_into().unwrap())
}
#[inline] fn push_u32(v: &mut Vec<u8>, x: u32) { v.extend_from_slice(&x.to_le_bytes()); }
#[inline] fn push_f64(v: &mut Vec<u8>, x: f64) { v.extend_from_slice(&x.to_le_bytes()); }

/// Deserialize a Player from the input byte buffer.
/// Player setters are invoked so the f/h/w pre-multiplied arrays get
/// populated (matches what Python's `Player.__init__` + setters do).
/// `cache_infernal_bonuses()` is NOT called here — `CombatSimulator::new`
/// handles it as it does the per-property caching.
pub fn deserialize_player(bytes: &[u8]) -> Result<Player, DecodeError> {
    if bytes.len() < INPUT_SIZE {
        return Err(DecodeError::TooShort { got: bytes.len(), need: INPUT_SIZE });
    }
    if bytes[0] != SCHEMA_VERSION {
        return Err(DecodeError::WrongSchema { got: bytes[0], expected: SCHEMA_VERSION });
    }

    let mut p = Player::new();
    p.asc1_unlocked = bytes[1] != 0;
    p.asc2_unlocked = bytes[2] != 0;
    p.arch_level = read_u32(bytes, 4);
    p.current_max_floor = read_u32(bytes, 8);
    p.hades_idol_level = read_u32(bytes, 12);
    p.total_infernal_cards = read_u32(bytes, 16);
    p.starting_speed_pool = read_u32(bytes, 20);
    p.arch_ability_infernal_bonus = read_f64(bytes, 24);

    // base_stats[7]
    for i in 0..Stat::COUNT {
        p.base_stats[i] = read_u32(bytes, 32 + i * 4);
    }

    // upgrade_levels[56] — through the setter so upgrades_f/h fill in.
    for i in 0..56 {
        let lvl = read_u32(bytes, 60 + i * 4);
        p.set_upgrade_level(i as u8, lvl);
    }

    // external_levels[22] — IDs 0..3 unused, but slots present in the buffer.
    // Can be -1 (not unlocked), 0 (unlocked), or positive (upgraded).
    for i in 0..22 {
        let lvl = read_i32(bytes, 284 + i * 4);
        p.set_external_level(i as u8, lvl);
    }

    // cards[28]
    for i in 0..BlockId::COUNT {
        let lvl = read_u32(bytes, 372 + i * 4);
        if let Some(b) = BlockId::from_idx(i) {
            p.set_card_level(b, lvl);
        }
    }

    Ok(p)
}

/// Serialize a RunState to bytes in the output layout above.
/// Returns a freshly-allocated Vec; caller hands the pointer back to JS via
/// `engine_run_simulation`.
pub fn serialize_result(state: &RunState) -> Vec<u8> {
    let n_history = state.history_floor.len();
    let total_size = OUTPUT_HEADER_SIZE + 12 * n_history;
    let mut out = Vec::with_capacity(total_size);

    // Header (schema + 3 pad)
    out.push(SCHEMA_VERSION);
    out.extend_from_slice(&[0u8, 0, 0]);

    // Integer counters
    push_u32(&mut out, state.highest_floor);
    push_u32(&mut out, state.blocks_mined);
    push_u32(&mut out, state.crosshair_spawns);
    push_u32(&mut out, state.total_flurry_casts);
    push_u32(&mut out, state.total_enrage_casts);
    push_u32(&mut out, state.total_quake_casts);
    push_u32(&mut out, state.total_instacharges);

    // hit_counts[4]
    for h in state.hit_counts.iter() {
        push_u32(&mut out, *h);
    }

    // f64 scalars
    push_f64(&mut out, state.total_time);
    push_f64(&mut out, state.total_xp);
    push_f64(&mut out, state.total_stamina_spent);
    push_f64(&mut out, state.crosshair_damage);
    push_f64(&mut out, state.melee_damage);
    push_f64(&mut out, state.quake_damage);
    push_f64(&mut out, state.overkill_damage);
    push_f64(&mut out, state.stamina_refunded_flurry);
    push_f64(&mut out, state.stamina_refunded_mods);
    push_f64(&mut out, state.stamina_wasted_overcap);
    push_f64(&mut out, state.speed_pool);
    push_f64(&mut out, state.stamina);
    push_f64(&mut out, state.crosshair_timer);

    // total_frags[7]
    for f in state.total_frags.iter() {
        push_f64(&mut out, *f);
    }
    // div_tier_kills[4]
    for k in state.div_tier_kills.iter() {
        push_u32(&mut out, *k);
    }
    // div_tier_frags[4]
    for f in state.div_tier_frags.iter() {
        push_f64(&mut out, *f);
    }
    // specific_blocks_mined[28]
    for c in state.specific_blocks_mined.iter() {
        push_u32(&mut out, *c);
    }
    // specific_blocks_frags[28]
    for f in state.specific_blocks_frags.iter() {
        push_f64(&mut out, *f);
    }

    // history_len + history_floor[N] + history_stamina[N]
    push_u32(&mut out, n_history as u32);
    for f in state.history_floor.iter() {
        push_u32(&mut out, *f);
    }
    for s in state.history_stamina.iter() {
        push_f64(&mut out, *s);
    }

    debug_assert_eq!(out.len(), total_size, "serialize_result size mismatch");
    out
}

/// Serialize a Player to bytes — used in tests to round-trip the input
/// format and confirm encode/decode are inverses.
pub fn serialize_player(p: &Player) -> Vec<u8> {
    let mut out = Vec::with_capacity(INPUT_SIZE);
    out.resize(INPUT_SIZE, 0);
    out[0] = SCHEMA_VERSION;
    out[1] = p.asc1_unlocked as u8;
    out[2] = p.asc2_unlocked as u8;
    // bytes[3] = pad
    out[4..8].copy_from_slice(&p.arch_level.to_le_bytes());
    out[8..12].copy_from_slice(&p.current_max_floor.to_le_bytes());
    out[12..16].copy_from_slice(&p.hades_idol_level.to_le_bytes());
    out[16..20].copy_from_slice(&p.total_infernal_cards.to_le_bytes());
    out[20..24].copy_from_slice(&p.starting_speed_pool.to_le_bytes());
    out[24..32].copy_from_slice(&p.arch_ability_infernal_bonus.to_le_bytes());

    for i in 0..Stat::COUNT {
        let o = 32 + i * 4;
        out[o..o + 4].copy_from_slice(&p.base_stats[i].to_le_bytes());
    }
    for i in 0..56 {
        let o = 60 + i * 4;
        out[o..o + 4].copy_from_slice(&p.upgrade_levels[i].to_le_bytes());
    }
    for i in 0..22 {
        let o = 284 + i * 4;
        out[o..o + 4].copy_from_slice(&p.external_levels[i].to_le_bytes());
    }
    for i in 0..BlockId::COUNT {
        let o = 372 + i * 4;
        out[o..o + 4].copy_from_slice(&p.cards[i].to_le_bytes());
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_player() -> Player {
        let mut p = Player::new();
        p.asc1_unlocked = true;
        p.asc2_unlocked = true;
        p.arch_level = 82;
        p.current_max_floor = 106;
        p.hades_idol_level = 1234;
        p.total_infernal_cards = 15;
        p.starting_speed_pool = 5;
        p.arch_ability_infernal_bonus = 0.4074;
        p.base_stats[0] = 25; // Str
        p.base_stats[1] = 12; // Agi
        p.set_upgrade_level(3, 8);
        p.set_upgrade_level(13, 25);
        p.set_external_level(4, 100);
        p.set_external_level(21, 1234);
        p.set_card_level(BlockId::Rare2, 4);
        p
    }

    #[test]
    fn round_trip_player() {
        let p1 = make_player();
        let bytes = serialize_player(&p1);
        assert_eq!(bytes.len(), INPUT_SIZE);
        let p2 = deserialize_player(&bytes).expect("deserialize");
        // Spot-check every persisted field
        assert_eq!(p2.asc1_unlocked, p1.asc1_unlocked);
        assert_eq!(p2.asc2_unlocked, p1.asc2_unlocked);
        assert_eq!(p2.arch_level, p1.arch_level);
        assert_eq!(p2.current_max_floor, p1.current_max_floor);
        assert_eq!(p2.hades_idol_level, p1.hades_idol_level);
        assert_eq!(p2.total_infernal_cards, p1.total_infernal_cards);
        assert_eq!(p2.starting_speed_pool, p1.starting_speed_pool);
        assert_eq!(p2.arch_ability_infernal_bonus.to_bits(), p1.arch_ability_infernal_bonus.to_bits());
        assert_eq!(p2.base_stats, p1.base_stats);
        assert_eq!(p2.upgrade_levels, p1.upgrade_levels);
        assert_eq!(p2.external_levels, p1.external_levels);
        assert_eq!(p2.cards, p1.cards);
        // Pre-multiplied F / H / W arrays should also match (setters rebuilt them).
        for i in 0..56 {
            assert_eq!(p2.upgrades_f[i].to_bits(), p1.upgrades_f[i].to_bits(), "upgrades_f[{i}]");
            assert_eq!(p2.upgrades_h[i].to_bits(), p1.upgrades_h[i].to_bits(), "upgrades_h[{i}]");
        }
        for i in 0..22 {
            assert_eq!(p2.external_w[i].to_bits(), p1.external_w[i].to_bits(), "external_w[{i}]");
        }
    }

    #[test]
    fn deserialize_rejects_wrong_schema() {
        let mut bytes = serialize_player(&make_player());
        bytes[0] = 99;
        assert!(matches!(deserialize_player(&bytes), Err(DecodeError::WrongSchema { got: 99, .. })));
    }

    #[test]
    fn deserialize_rejects_short_input() {
        let bytes = vec![1u8; 50];
        assert!(matches!(deserialize_player(&bytes), Err(DecodeError::TooShort { .. })));
    }
}
