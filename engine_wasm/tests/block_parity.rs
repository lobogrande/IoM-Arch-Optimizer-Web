//! Block bit-identity test vs Python.
//!
//! For each save, the fixture has every (block_id × test_floor) combination
//! pre-computed by `Block(...)` in CPython.  We rebuild the equivalent Rust
//! Block here and assert hp / armor / xp / frag_amt / frag_type match
//! exactly.  Test floors include each scaling-table breakpoint and the
//! floor-150 armor-skip + floor-300 double-trigger game bugs.

use engine_wasm::block::Block;
use engine_wasm::player::Player;
use engine_wasm::project_config::{BlockId, Stat};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

fn fixtures_dir() -> PathBuf {
    let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.push("tests");
    p.push("fixtures");
    p
}

fn load_engine_state(save_name: &str) -> Value {
    let path = fixtures_dir().join("player_props").join(save_name);
    let txt = fs::read_to_string(&path).unwrap();
    let v: Value = serde_json::from_str(&txt).unwrap();
    v["engine_state"].clone()
}

fn build_player_from_engine_state(state: &Value) -> Player {
    let mut p = Player::new();
    p.asc1_unlocked = state["asc1_unlocked"].as_bool().unwrap();
    p.asc2_unlocked = state["asc2_unlocked"].as_bool().unwrap();
    p.arch_level = state["arch_level"].as_u64().unwrap() as u32;
    p.current_max_floor = state["current_max_floor"].as_u64().unwrap() as u32;
    p.hades_idol_level = state["hades_idol_level"].as_u64().unwrap() as u32;
    p.arch_ability_infernal_bonus = state["arch_ability_infernal_bonus"].as_f64().unwrap();
    p.total_infernal_cards = state["total_infernal_cards"].as_u64().unwrap() as u32;
    p.starting_speed_pool = state["starting_speed_pool"].as_u64().unwrap() as u32;
    for (k, v) in state["base_stats"].as_object().unwrap() {
        if let Some(stat) = Stat::from_str(k) {
            p.base_stats[stat as usize] = v.as_u64().unwrap() as u32;
        }
    }
    for (k, v) in state["upgrade_levels"].as_object().unwrap() {
        p.set_upgrade_level(k.parse().unwrap(), v.as_u64().unwrap() as u32);
    }
    for (k, v) in state["external_levels"].as_object().unwrap() {
        p.set_external_level(k.parse().unwrap(), v.as_u64().unwrap() as i32);
    }
    for (k, v) in state["cards"].as_object().unwrap() {
        if let Some(b) = BlockId::from_str(k) {
            p.set_card_level(b, v.as_u64().unwrap() as u32);
        }
    }
    p.cache_infernal_bonuses();
    p
}

fn check_save(save_name: &str) {
    let engine_state = load_engine_state(save_name);
    let player = build_player_from_engine_state(&engine_state);

    let block_fx_path = fixtures_dir().join("block_props").join(save_name);
    let txt = fs::read_to_string(&block_fx_path).unwrap();
    let fx: Value = serde_json::from_str(&txt).unwrap();

    // Rust should compute identical exp / frag multipliers from the same state.
    let py_exp_mult_bits = fx["p_exp_mult_bits"].as_u64().unwrap();
    let py_frag_mult_bits = fx["p_frag_mult_bits"].as_u64().unwrap();
    let rust_exp_mult = player.exp_gain_mult();
    let rust_frag_mult = player.frag_loot_gain_mult();
    assert_eq!(rust_exp_mult.to_bits(), py_exp_mult_bits, "exp_gain_mult mismatch");
    assert_eq!(rust_frag_mult.to_bits(), py_frag_mult_bits, "frag_loot_gain_mult mismatch");

    let blocks = fx["blocks"].as_array().unwrap();
    let mut failures = Vec::new();
    for b in blocks {
        let bid = BlockId::from_str(b["block_id"].as_str().unwrap()).unwrap();
        let floor = b["floor"].as_u64().unwrap() as u32;
        let rust_b = Block::new(bid, floor, &player, rust_exp_mult, rust_frag_mult);
        let mismatch = [
            ("hp",        rust_b.hp.to_bits(),       b["hp_bits"].as_u64().unwrap()),
            ("armor",     rust_b.armor.to_bits(),    b["armor_bits"].as_u64().unwrap()),
            ("xp",        rust_b.xp.to_bits(),       b["xp_bits"].as_u64().unwrap()),
            ("frag_amt",  rust_b.frag_amt.to_bits(), b["frag_amt_bits"].as_u64().unwrap()),
        ];
        for (label, r, py) in mismatch.iter() {
            if r != py {
                failures.push(format!(
                    "  {}@f{}: {}: rust={:#x} ({}) vs py={:#x} ({})",
                    b["block_id"].as_str().unwrap(),
                    floor,
                    label,
                    r,
                    f64::from_bits(*r),
                    py,
                    f64::from_bits(*py),
                ));
                if failures.len() > 20 { break; }
            }
        }
        // frag_type is u8 — compare directly
        let py_ft = b["frag_type"].as_u64().unwrap() as u8;
        if rust_b.frag_type != py_ft {
            failures.push(format!(
                "  {}@f{}: frag_type: rust={} vs py={}",
                b["block_id"].as_str().unwrap(),
                floor,
                rust_b.frag_type,
                py_ft,
            ));
        }
        if failures.len() > 20 { break; }
    }

    if !failures.is_empty() {
        panic!(
            "{save_name}: {} block mismatch(es) (first 20 shown):\n{}",
            failures.len(),
            failures.iter().take(20).cloned().collect::<Vec<_>>().join("\n"),
        );
    }
}

#[test] fn early_asc1_arch74_floor91_ramuh() {
    check_save("early_asc1_arch74_floor91_ramuh.json");
}

#[test] fn early_asc2_arch1_floor1_asc2_playerstart() {
    check_save("early_asc2_arch1_floor1_asc2_playerstart.json");
}

#[test] fn late_asc2_arch114_floor186_lobo_asc2_multipleprofiles() {
    check_save("late_asc2_arch114_floor186_lobo_asc2_multipleprofiles.json");
}

#[test] fn late_asc2_arch118_floor225_lobo() {
    check_save("late_asc2_arch118_floor225_lobo.json");
}

#[test] fn mid_asc1_arch100_floor167_example_asc2_player_start() {
    check_save("mid_asc1_arch100_floor167_example_asc2_player_start.json");
}

#[test] fn mid_asc1_arch82_floor106_aa() {
    check_save("mid_asc1_arch82_floor106_aa.json");
}

#[test] fn mid_asc1_arch82_floor106_annoyance() {
    check_save("mid_asc1_arch82_floor106_annoyance.json");
}

#[test] fn mid_asc2_arch110_floor160_lobo_new() {
    check_save("mid_asc2_arch110_floor160_lobo_new.json");
}

#[test] fn mid_asc2_arch96_floor151_a() {
    check_save("mid_asc2_arch96_floor151_a.json");
}

#[test] fn early_asc0_arch52_floor24_preset_early() {
    check_save("early_asc0_arch52_floor24_preset_early.json");
}

#[test] fn early_asc1_arch45_floor40_preset_mid() {
    check_save("early_asc1_arch45_floor40_preset_mid.json");
}

#[test] fn mid_asc2_arch99_floor158_preset_late() {
    check_save("mid_asc2_arch99_floor158_preset_late.json");
}
