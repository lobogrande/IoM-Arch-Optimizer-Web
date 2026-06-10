//! Player @property bit-identity test vs Python.
//!
//! For each of 9 normalized saves, loads the Python-generated fixture
//! (`tests/fixtures/player_props/{save}.json`), builds an equivalent Rust
//! Player, and asserts every computed property matches the Python value to
//! the last bit.  This is the gate that proves Phase 3 is correct: a passing
//! suite here means the full @property surface is faithful, so Phase 6
//! (combat_loop port) can build on it.
//!
//! Regenerate fixtures with:
//!   python3 engine_wasm/tests/fixtures/gen_player_props.py

use engine_wasm::player::Player;
use engine_wasm::project_config::{BlockId, Stat};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

fn fixtures_dir() -> PathBuf {
    let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.push("tests");
    p.push("fixtures");
    p.push("player_props");
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
        if let Some(stat) = Stat::from_str(k) {
            p.base_stats[stat as usize] = v.as_u64().unwrap() as u32;
        }
    }
    for (k, v) in state["upgrade_levels"].as_object().unwrap() {
        let id: u8 = k.parse().unwrap();
        p.set_upgrade_level(id, v.as_u64().unwrap() as u32);
    }
    for (k, v) in state["external_levels"].as_object().unwrap() {
        let id: u8 = k.parse().unwrap();
        p.set_external_level(id, v.as_u64().unwrap() as i32);
    }
    for (k, v) in state["cards"].as_object().unwrap() {
        if let Some(block) = BlockId::from_str(k) {
            p.set_card_level(block, v.as_u64().unwrap() as u32);
        }
    }
    p.cache_infernal_bonuses();
    p
}

/// Return the Rust f64 value for a named property.  Mirrors the
/// `PROPERTIES` list in gen_player_props.py.
fn rust_property(p: &Player, name: &str) -> Option<f64> {
    Some(match name {
        "max_sta" => p.max_sta(),
        "damage" => p.damage(),
        "enraged_damage" => p.enraged_damage(),
        "armor_pen" => p.armor_pen(),
        "atk_spd" => p.atk_spd(),
        "crit_chance" => p.crit_chance(),
        "crit_dmg_mult" => p.crit_dmg_mult(),
        "enraged_crit_dmg_mult" => p.enraged_crit_dmg_mult(),
        "super_crit_chance" => p.super_crit_chance(),
        "super_crit_dmg_mult" => p.super_crit_dmg_mult(),
        "ultra_crit_chance" => p.ultra_crit_chance(),
        "ultra_crit_dmg_mult" => p.ultra_crit_dmg_mult(),
        "ability_insta_charge" => p.ability_insta_charge(),
        "crosshair_auto_tap" => p.crosshair_auto_tap(),
        "gold_crosshair_chance" => p.gold_crosshair_chance(),
        "gold_crosshair_mult" => p.gold_crosshair_mult(),
        "exp_gain_mult" => p.exp_gain_mult(),
        "frag_loot_gain_mult" => p.frag_loot_gain_mult(),
        "exp_mod_chance" => p.exp_mod_chance(),
        "exp_mod_gain" => p.exp_mod_gain(),
        "loot_mod_chance" => p.loot_mod_chance(),
        "loot_mod_gain" => p.loot_mod_gain(),
        "speed_mod_chance" => p.speed_mod_chance(),
        "speed_mod_gain" => p.speed_mod_gain(),
        "speed_mod_attack_rate" => p.speed_mod_attack_rate(),
        "stamina_mod_chance" => p.stamina_mod_chance(),
        "stamina_mod_gain" => p.stamina_mod_gain(),
        "gleaming_floor_chance" => p.gleaming_floor_chance(),
        "gleaming_floor_multi" => p.gleaming_floor_multi(),
        "enrage_charges" => p.enrage_charges(),
        "enrage_cooldown" => p.enrage_cooldown(),
        "enrage_bonus_dmg" => p.enrage_bonus_dmg(),
        "enrage_bonus_crit_dmg" => p.enrage_bonus_crit_dmg(),
        "flurry_duration" => p.flurry_duration(),
        "flurry_cooldown" => p.flurry_cooldown(),
        "flurry_bonus_atk_spd" => p.flurry_bonus_atk_spd(),
        "flurry_sta_on_cast" => p.flurry_sta_on_cast(),
        "quake_attacks" => p.quake_attacks(),
        "quake_cooldown" => p.quake_cooldown(),
        "quake_dmg_to_all" => p.quake_dmg_to_all(),
        "infernal_multiplier" => p.infernal_multiplier(),
        _ => return None,
    })
}

fn check_save(save_name: &str) {
    let path = fixtures_dir().join(save_name);
    let txt = fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("missing fixture {path:?}: {e}"));
    let fixture: Value = serde_json::from_str(&txt).unwrap();
    let player = build_player_from_engine_state(&fixture["engine_state"]);

    // Compare each named property to the Python value (bit-identical).
    let py_props = fixture["properties_bits"].as_object().unwrap();
    let mut failures = Vec::new();
    for (name, py_bits_val) in py_props {
        if name == "__infernal_cache_bits" {
            continue;
        }
        let py_bits = py_bits_val.as_u64()
            .unwrap_or_else(|| panic!("non-u64 bits for property '{name}'"));
        let rust_val = rust_property(&player, name)
            .unwrap_or_else(|| panic!("Rust accessor missing for property '{name}'"));
        let rust_bits = rust_val.to_bits();
        if rust_bits != py_bits {
            let py_f = f64::from_bits(py_bits);
            failures.push(format!(
                "  {name}: rust={rust_val:.17e} ({rust_bits:#x}) vs py={py_f:.17e} ({py_bits:#x})"
            ));
        }
    }

    // Also compare the 28-element infernal cache.
    let py_cache = fixture["properties_bits"]["__infernal_cache_bits"]
        .as_array()
        .expect("__infernal_cache_bits must be an array");
    assert_eq!(py_cache.len(), 28, "infernal cache len mismatch");
    for i in 0..28 {
        let py_bits = py_cache[i].as_u64().unwrap();
        let rust_bits = player.infernal_cache[i].to_bits();
        if rust_bits != py_bits {
            let py_f = f64::from_bits(py_bits);
            let rust_f = player.infernal_cache[i];
            failures.push(format!(
                "  inf_cache[{i}]: rust={rust_f:.17e} ({rust_bits:#x}) vs py={py_f:.17e} ({py_bits:#x})"
            ));
        }
    }

    if !failures.is_empty() {
        panic!(
            "{save_name}: {} property mismatch(es):\n{}",
            failures.len(),
            failures.join("\n")
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
