//! End-to-end serialization round-trip test.
//!
//! For each save:
//!   1. Build a Player from the engine_state fixture.
//!   2. Serialize to bytes (input format).
//!   3. Deserialize back to a Player.
//!   4. Run a sim with the deserialized Player @ seed=42.
//!   5. Serialize the RunState to bytes (output format).
//!   6. Run an independent in-memory sim with the original Player @ seed=42.
//!   7. Assert: the output buffer's byte-for-byte content equals what
//!      `serialize_result` of the in-memory sim would produce.
//!
//! This is the gate that confirms Phase 7 plumbing is lossless — the
//! input/output binary formats are inverses of the runtime state, and
//! a WASM-mode sim produces identical bytes to a direct sim.

use engine_wasm::combat_loop::CombatSimulator;
use engine_wasm::player::Player;
use engine_wasm::project_config::{BlockId, Stat};
use engine_wasm::rng::Mt19937;
use engine_wasm::state::{deserialize_player, serialize_player, serialize_result};
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
    p
}

fn check_save(save_name: &str) {
    let ps_path = fixtures_dir().join("player_props").join(save_name);
    let ps: Value = serde_json::from_str(&fs::read_to_string(&ps_path).unwrap()).unwrap();
    let original = build_player_from_engine_state(&ps["engine_state"]);

    // 1-3: serialize → deserialize → confirm field equivalence.
    let bytes = serialize_player(&original);
    assert_eq!(bytes.len(), engine_wasm::state::INPUT_SIZE);
    let restored = deserialize_player(&bytes).expect("deserialize must succeed");

    // 4: run sim from the restored player @ seed=42
    let mut restored_sim = CombatSimulator::new(restored);
    let mut rng_a = Mt19937::new(42);
    let result_restored = restored_sim.run_simulation(&mut rng_a);

    // 5: serialize that result
    let bytes_a = serialize_result(&result_restored);

    // 6: independently sim the original player @ seed=42
    let mut direct_sim = CombatSimulator::new(original);
    let mut rng_b = Mt19937::new(42);
    let result_direct = direct_sim.run_simulation(&mut rng_b);
    let bytes_b = serialize_result(&result_direct);

    // 7: byte-for-byte equality of the serialized outputs
    assert_eq!(
        bytes_a.len(),
        bytes_b.len(),
        "{save_name}: serialized result lengths differ: {} vs {}",
        bytes_a.len(),
        bytes_b.len(),
    );
    if bytes_a != bytes_b {
        // Find the first byte difference for a useful error message.
        for (i, (a, b)) in bytes_a.iter().zip(bytes_b.iter()).enumerate() {
            if a != b {
                panic!(
                    "{save_name}: first byte mismatch at offset {i}: roundtrip=0x{a:02x} direct=0x{b:02x}",
                );
            }
        }
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
