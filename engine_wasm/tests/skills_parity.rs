//! SkillManager bit-identity test vs Python.
//!
//! For each save the fixture has:
//!   - The SkillConfig values constructed from that save's Player
//!   - A 200-step tick sequence with `random.seed(42)` and dt=1.0
//!   - State snapshots at steps 50, 100, 150, 200 plus total stamina restored
//!
//! Rust reconstructs the SkillConfig from the same bit values, runs the same
//! 200-step sequence with our CPython-compatible MT19937 seeded with 42, and
//! must produce byte-identical state at every snapshot.

use engine_wasm::rng::Mt19937;
use engine_wasm::skills::{SkillConfig, SkillManager};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

fn fixtures_dir() -> PathBuf {
    let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.push("tests");
    p.push("fixtures");
    p.push("skills_props");
    p
}

fn f64_from_bits_field(v: &Value, key: &str) -> f64 {
    f64::from_bits(v[key].as_u64().unwrap())
}

fn cfg_from_fixture(v: &Value) -> SkillConfig {
    SkillConfig {
        ability_insta:        f64_from_bits_field(v, "ability_insta_bits"),
        enrage_charges_max:   f64_from_bits_field(v, "enrage_charges_max_bits"),
        enrage_cd_max:        f64_from_bits_field(v, "enrage_cd_max_bits"),
        flurry_duration_max:  f64_from_bits_field(v, "flurry_duration_max_bits"),
        flurry_cd_max:        f64_from_bits_field(v, "flurry_cd_max_bits"),
        flurry_sta_cast:      f64_from_bits_field(v, "flurry_sta_cast_bits"),
        quake_attacks_max:    f64_from_bits_field(v, "quake_attacks_max_bits"),
        quake_cd_max:         f64_from_bits_field(v, "quake_cd_max_bits"),
        auto_enrage:          v["auto_enrage"].as_bool().unwrap(),
        auto_flurry:          v["auto_flurry"].as_bool().unwrap(),
        auto_quake:           v["auto_quake"].as_bool().unwrap(),
    }
}

fn check_save(save_name: &str) {
    let path = fixtures_dir().join(save_name);
    let txt = fs::read_to_string(&path).unwrap();
    let fx: Value = serde_json::from_str(&txt).unwrap();

    let cfg = cfg_from_fixture(&fx["config"]);
    let tick_count = fx["tick_count"].as_u64().unwrap() as usize;
    let dt = fx["dt"].as_f64().unwrap();
    let seed = fx["rng_seed"].as_u64().unwrap() as u32;
    let py_total_sta_bits = fx["total_stamina_restored_bits"].as_u64().unwrap();

    let mut sm = SkillManager::new();
    let mut rng = Mt19937::new(seed);
    let mut total_sta_restored = 0.0;
    let snapshots = fx["snapshots"].as_array().unwrap();
    let mut snap_idx = 0;
    let mut failures = Vec::new();

    for step in 0..tick_count {
        total_sta_restored += sm.tick(dt, &cfg, &mut rng);

        // If this step matches a snapshot in the fixture, compare.
        if snap_idx < snapshots.len() {
            let snap = &snapshots[snap_idx];
            if snap["step"].as_u64().unwrap() as usize == step + 1 {
                let checks = [
                    ("enrage_cd",      sm.enrage_cd.to_bits(),      snap["enrage_cd_bits"].as_u64().unwrap()),
                    ("enrage_charges", sm.enrage_charges.to_bits(), snap["enrage_charges_bits"].as_u64().unwrap()),
                    ("flurry_cd",      sm.flurry_cd.to_bits(),      snap["flurry_cd_bits"].as_u64().unwrap()),
                    ("flurry_timer",   sm.flurry_timer.to_bits(),   snap["flurry_timer_bits"].as_u64().unwrap()),
                    ("quake_cd",       sm.quake_cd.to_bits(),       snap["quake_cd_bits"].as_u64().unwrap()),
                    ("quake_charges",  sm.quake_charges.to_bits(),  snap["quake_charges_bits"].as_u64().unwrap()),
                ];
                for (label, r, py) in checks.iter() {
                    if r != py {
                        failures.push(format!(
                            "  step {}: {}: rust={:#x} ({}) vs py={:#x} ({})",
                            step + 1, label, r, f64::from_bits(*r), py, f64::from_bits(*py)
                        ));
                    }
                }
                // u32 counters
                let counter_checks = [
                    ("total_enrage_casts", sm.total_enrage_casts as u64, snap["total_enrage_casts"].as_u64().unwrap()),
                    ("total_flurry_casts", sm.total_flurry_casts as u64, snap["total_flurry_casts"].as_u64().unwrap()),
                    ("total_quake_casts",  sm.total_quake_casts as u64,  snap["total_quake_casts"].as_u64().unwrap()),
                    ("total_instacharges", sm.total_instacharges as u64, snap["total_instacharges"].as_u64().unwrap()),
                ];
                for (label, r, py) in counter_checks.iter() {
                    if r != py {
                        failures.push(format!("  step {}: {} counter: rust={} vs py={}", step + 1, label, r, py));
                    }
                }
                snap_idx += 1;
            }
        }
    }

    if total_sta_restored.to_bits() != py_total_sta_bits {
        failures.push(format!(
            "total_stamina_restored: rust={} ({:#x}) vs py={} ({:#x})",
            total_sta_restored,
            total_sta_restored.to_bits(),
            f64::from_bits(py_total_sta_bits),
            py_total_sta_bits,
        ));
    }

    if !failures.is_empty() {
        panic!(
            "{save_name}: {} mismatch(es):\n{}",
            failures.len(),
            failures.join("\n"),
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
