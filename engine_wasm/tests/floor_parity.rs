//! Floor generation bit-identity test vs Python.
//!
//! For each save and each test floor (regular, boss-uniform, mixed-gauntlet,
//! asc2-specific), seeds an Mt19937 with 42 and generates one floor.
//! Asserts:
//!   - is_gleaming + gleaming_multi match
//!   - Each of the 24 slots: same block_id (or both None)
//!   - Each block's modifier dice (exp_multi, loot_multi, stamina_gain,
//!     speed_active, speed_gain) bit-identical
//!
//! Passing this test proves the entire FloorGenerator path is faithful:
//! gleaming roll, boss-floor lookup, spawn-rate brackets, top-down rarity
//! iteration, tier selection, the asc1/asc2 div/tier-4 downgrades, and the
//! 4-call modifier ordering.  And implicitly, the randint rejection loop
//! consumes the MT stream in identical order to Python.

use engine_wasm::floor_map::{Floor, FloorGenerator};
use engine_wasm::player::Player;
use engine_wasm::project_config::{BlockId, Stat};
use engine_wasm::rng::Mt19937;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

fn fixtures_dir() -> PathBuf {
    let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.push("tests"); p.push("fixtures");
    p
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
        if let Some(s) = Stat::from_str(k) {
            p.base_stats[s as usize] = v.as_u64().unwrap() as u32;
        }
    }
    for (k, v) in state["upgrade_levels"].as_object().unwrap() {
        p.set_upgrade_level(k.parse().unwrap(), v.as_u64().unwrap() as u32);
    }
    for (k, v) in state["external_levels"].as_object().unwrap() {
        p.set_external_level(k.parse().unwrap(), v.as_u64().unwrap() as u32);
    }
    for (k, v) in state["cards"].as_object().unwrap() {
        if let Some(b) = BlockId::from_str(k) {
            p.set_card_level(b, v.as_u64().unwrap() as u32);
        }
    }
    p.cache_infernal_bonuses();
    p
}

fn compare_floor(save_name: &str, floor_id: u32, py_floor: &Value, rust_floor: &Floor)
    -> Vec<String>
{
    let mut failures = Vec::new();

    // Header: gleaming + multiplier
    let py_glm = py_floor["is_gleaming"].as_bool().unwrap();
    if py_glm != rust_floor.is_gleaming {
        failures.push(format!(
            "  f{floor_id}: is_gleaming: rust={} vs py={}",
            rust_floor.is_gleaming, py_glm,
        ));
    }
    let py_glmul = py_floor["gleaming_multi_bits"].as_u64().unwrap();
    if rust_floor.gleaming_multi.to_bits() != py_glmul {
        failures.push(format!(
            "  f{floor_id}: gleaming_multi: rust={} ({:#x}) vs py={} ({:#x})",
            rust_floor.gleaming_multi,
            rust_floor.gleaming_multi.to_bits(),
            f64::from_bits(py_glmul),
            py_glmul,
        ));
    }

    // Per-slot
    let py_slots = py_floor["slots"].as_array().unwrap();
    for (idx, py_slot) in py_slots.iter().enumerate() {
        let rust_slot = &rust_floor.grid[idx];
        match (py_slot, rust_slot) {
            (Value::Null, None) => {} // both empty
            (Value::Null, Some(b)) => {
                failures.push(format!("  f{floor_id} slot {idx}: py=None but rust={}", b.block_id.as_str()));
            }
            (_, None) => {
                let py_bid = py_slot["block_id"].as_str().unwrap();
                failures.push(format!("  f{floor_id} slot {idx}: py={py_bid} but rust=None"));
            }
            (_, Some(rust_block)) => {
                let py_bid = py_slot["block_id"].as_str().unwrap();
                let rust_bid = rust_block.block_id.as_str();
                if py_bid != rust_bid {
                    failures.push(format!("  f{floor_id} slot {idx}: block_id rust={rust_bid} vs py={py_bid}"));
                }
                let m = &rust_block.modifiers;
                let checks = [
                    ("exp_multi",    m.exp_multi.to_bits(),    py_slot["exp_multi_bits"].as_u64().unwrap()),
                    ("loot_multi",   m.loot_multi.to_bits(),   py_slot["loot_multi_bits"].as_u64().unwrap()),
                    ("stamina_gain", m.stamina_gain.to_bits(), py_slot["stamina_gain_bits"].as_u64().unwrap()),
                    ("speed_gain",   m.speed_gain.to_bits(),   py_slot["speed_gain_bits"].as_u64().unwrap()),
                ];
                for (label, r, py) in checks.iter() {
                    if r != py {
                        failures.push(format!(
                            "  f{floor_id} slot {idx} ({rust_bid}): {label}: rust={:#x} ({}) vs py={:#x} ({})",
                            r, f64::from_bits(*r), py, f64::from_bits(*py),
                        ));
                    }
                }
                let py_speed_active = py_slot["speed_active"].as_bool().unwrap();
                if m.speed_active != py_speed_active {
                    failures.push(format!(
                        "  f{floor_id} slot {idx}: speed_active rust={} vs py={}",
                        m.speed_active, py_speed_active,
                    ));
                }
            }
        }
        if failures.len() > 30 { break; }
    }
    if !failures.is_empty() {
        failures.insert(0, format!("[{save_name}] failures:"));
    }
    failures
}

fn check_save(save_name: &str) {
    // Player engine state lives in the player_props fixture; floor fixtures
    // hold just the per-floor data.
    let ps_path = fixtures_dir().join("player_props").join(save_name);
    let ps_txt = fs::read_to_string(&ps_path).unwrap();
    let ps: Value = serde_json::from_str(&ps_txt).unwrap();
    let player = build_player_from_engine_state(&ps["engine_state"]);

    let fx_path = fixtures_dir().join("floor_map").join(save_name);
    let fx_txt = fs::read_to_string(&fx_path).unwrap();
    let fx: Value = serde_json::from_str(&fx_txt).unwrap();
    let seed = fx["rng_seed"].as_u64().unwrap() as u32;

    let mut all_failures = Vec::new();
    for py_floor in fx["floors"].as_array().unwrap() {
        let floor_id = py_floor["floor_id"].as_u64().unwrap() as u32;
        let mut gen = FloorGenerator::new();
        let mut rng = Mt19937::new(seed);
        let rust_floor = gen.generate_floor(floor_id, &player, &mut rng);
        let mut fails = compare_floor(save_name, floor_id, py_floor, &rust_floor);
        all_failures.append(&mut fails);
        if all_failures.len() > 60 { break; }
    }

    if !all_failures.is_empty() {
        panic!(
            "{save_name}: {} floor mismatch(es) (first 60 shown):\n{}",
            all_failures.len(),
            all_failures.iter().take(60).cloned().collect::<Vec<_>>().join("\n"),
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
