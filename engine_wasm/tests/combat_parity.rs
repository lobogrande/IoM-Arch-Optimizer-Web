//! Full-sim bit-identity test vs Python.
//!
//! For each of 9 normalized saves, runs a complete combat simulation with
//! seed=42 and compares every RunState field against the Python golden:
//! highest_floor, total_time, all damage/swing/cast counters, hit_counts,
//! total_frags, divine-tier tracking, per-block kill counts, history arrays.
//!
//! Passing this means the entire engine pipeline is faithful — Phase 9
//! (per-seed bit-identity across 4,500 sims) should follow immediately.

use engine_wasm::combat_loop::CombatSimulator;
use engine_wasm::player::Player;
use engine_wasm::project_config::{BlockId, Stat, BLOCK_ID_STRINGS};
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
        p.set_external_level(k.parse().unwrap(), v.as_u64().unwrap() as i32);
    }
    for (k, v) in state["cards"].as_object().unwrap() {
        if let Some(b) = BlockId::from_str(k) {
            p.set_card_level(b, v.as_u64().unwrap() as u32);
        }
    }
    // Note: cache_infernal_bonuses() is called inside CombatSimulator::new
    p
}

fn check_save(save_name: &str) {
    // Player state from player_props fixture
    let ps_path = fixtures_dir().join("player_props").join(save_name);
    let ps: Value = serde_json::from_str(&fs::read_to_string(&ps_path).unwrap()).unwrap();
    let player = build_player_from_engine_state(&ps["engine_state"]);

    // Expected sim output from combat fixture
    let fx_path = fixtures_dir().join("combat").join(save_name);
    let fx: Value = serde_json::from_str(&fs::read_to_string(&fx_path).unwrap()).unwrap();
    let seed = fx["rng_seed"].as_u64().unwrap() as u32;

    // Run the Rust sim
    let mut sim = CombatSimulator::new(player);
    let mut rng = Mt19937::new(seed);
    let state = sim.run_simulation(&mut rng);

    let mut failures = Vec::new();

    // ---- Scalars: u32 / u32 ----
    let int_checks = [
        ("highest_floor",      state.highest_floor as u64, fx["highest_floor"].as_u64().unwrap()),
        ("blocks_mined",       state.blocks_mined  as u64, fx["blocks_mined"].as_u64().unwrap()),
        ("crosshair_spawns",   state.crosshair_spawns as u64, fx["crosshair_spawns"].as_u64().unwrap()),
        ("total_enrage_casts", state.total_enrage_casts as u64, fx["total_enrage_casts"].as_u64().unwrap()),
        ("total_flurry_casts", state.total_flurry_casts as u64, fx["total_flurry_casts"].as_u64().unwrap()),
        ("total_quake_casts",  state.total_quake_casts  as u64, fx["total_quake_casts"].as_u64().unwrap()),
        ("total_instacharges", state.total_instacharges as u64, fx["total_instacharges"].as_u64().unwrap()),
    ];
    for (label, r, py) in int_checks.iter() {
        if r != py {
            failures.push(format!("  {}: rust={} vs py={}", label, r, py));
        }
    }

    // ---- f64 bit-comparisons ----
    let f64_checks = [
        ("total_time",              state.total_time.to_bits(),              fx["total_time_bits"].as_u64().unwrap()),
        ("total_xp",                state.total_xp.to_bits(),                fx["total_xp_bits"].as_u64().unwrap()),
        ("total_stamina_spent",     state.total_stamina_spent.to_bits(),     fx["total_stamina_spent_bits"].as_u64().unwrap()),
        ("crosshair_damage",        state.crosshair_damage.to_bits(),        fx["crosshair_damage_bits"].as_u64().unwrap()),
        ("melee_damage",            state.melee_damage.to_bits(),            fx["melee_damage_bits"].as_u64().unwrap()),
        ("quake_damage",            state.quake_damage.to_bits(),            fx["quake_damage_bits"].as_u64().unwrap()),
        ("overkill_damage",         state.overkill_damage.to_bits(),         fx["overkill_damage_bits"].as_u64().unwrap()),
        ("stamina_refunded_flurry", state.stamina_refunded_flurry.to_bits(), fx["stamina_refunded_flurry_bits"].as_u64().unwrap()),
        ("stamina_refunded_mods",   state.stamina_refunded_mods.to_bits(),   fx["stamina_refunded_mods_bits"].as_u64().unwrap()),
        ("stamina_wasted_overcap",  state.stamina_wasted_overcap.to_bits(),  fx["stamina_wasted_overcap_bits"].as_u64().unwrap()),
        ("speed_pool",              state.speed_pool.to_bits(),              fx["speed_pool_bits"].as_u64().unwrap()),
        ("stamina",                 state.stamina.to_bits(),                 fx["stamina_bits"].as_u64().unwrap()),
        ("crosshair_timer",         state.crosshair_timer.to_bits(),         fx["crosshair_timer_bits"].as_u64().unwrap()),
    ];
    for (label, r, py) in f64_checks.iter() {
        if r != py {
            failures.push(format!(
                "  {}: rust={} ({:#x}) vs py={} ({:#x})",
                label, f64::from_bits(*r), r, f64::from_bits(*py), py,
            ));
        }
    }

    // ---- hit_counts[0..4] ----
    let py_hc = fx["hit_counts"].as_array().unwrap();
    for i in 0..4 {
        let r = state.hit_counts[i] as u64;
        let py = py_hc[i].as_u64().unwrap();
        if r != py {
            let names = ["normal", "crit", "super", "ultra"];
            failures.push(format!("  hit_counts[{}]: rust={} vs py={}", names[i], r, py));
        }
    }

    // ---- total_frags[0..7] (f64 bits) ----
    let py_tf = fx["total_frags_bits"].as_array().unwrap();
    for i in 0..7 {
        let r = state.total_frags[i].to_bits();
        let py = py_tf[i].as_u64().unwrap();
        if r != py {
            failures.push(format!("  total_frags[{}]: rust={} vs py={}", i,
                f64::from_bits(r), f64::from_bits(py)));
        }
    }

    // ---- div_tier_kills / div_tier_frags ----
    let py_dtk = fx["div_tier_kills"].as_array().unwrap();
    let py_dtf = fx["div_tier_frags_bits"].as_array().unwrap();
    for i in 0..4 {
        let rk = state.div_tier_kills[i] as u64;
        let pyk = py_dtk[i].as_u64().unwrap();
        if rk != pyk {
            failures.push(format!("  div_tier_kills[{}]: rust={} vs py={}", i+1, rk, pyk));
        }
        let rf = state.div_tier_frags[i].to_bits();
        let pyf = py_dtf[i].as_u64().unwrap();
        if rf != pyf {
            failures.push(format!("  div_tier_frags[{}]: rust={} vs py={}", i+1,
                f64::from_bits(rf), f64::from_bits(pyf)));
        }
    }

    // ---- specific_blocks_mined / _frags (28 entries) ----
    let py_sbm = fx["specific_blocks_mined"].as_array().unwrap();
    let py_sbf = fx["specific_blocks_frags_bits"].as_array().unwrap();
    for i in 0..BlockId::COUNT {
        let rm = state.specific_blocks_mined[i] as u64;
        let pym = py_sbm[i].as_u64().unwrap();
        if rm != pym {
            failures.push(format!("  specific_blocks_mined[{}]: rust={} vs py={}",
                BLOCK_ID_STRINGS[i], rm, pym));
        }
        let rf = state.specific_blocks_frags[i].to_bits();
        let pyf = py_sbf[i].as_u64().unwrap();
        if rf != pyf {
            failures.push(format!("  specific_blocks_frags[{}]: rust={} vs py={}",
                BLOCK_ID_STRINGS[i], f64::from_bits(rf), f64::from_bits(pyf)));
        }
    }

    // ---- history_floor + history_stamina ----
    let py_hf = fx["history_floor"].as_array().unwrap();
    if state.history_floor.len() != py_hf.len() {
        failures.push(format!(
            "  history_floor.len: rust={} vs py={}",
            state.history_floor.len(), py_hf.len()
        ));
    }
    let py_hs = fx["history_stamina_bits"].as_array().unwrap();
    let len = state.history_floor.len().min(py_hf.len());
    for i in 0..len {
        let r = state.history_floor[i] as u64;
        let py = py_hf[i].as_u64().unwrap();
        if r != py {
            failures.push(format!("  history_floor[{}]: rust={} vs py={}", i, r, py));
            if failures.len() > 20 { break; }
        }
        let rs = state.history_stamina[i].to_bits();
        let pys = py_hs[i].as_u64().unwrap();
        if rs != pys {
            failures.push(format!("  history_stamina[{}]: rust={} vs py={}", i,
                f64::from_bits(rs), f64::from_bits(pys)));
            if failures.len() > 20 { break; }
        }
    }

    if !failures.is_empty() {
        panic!(
            "{save_name}: {} mismatch(es) (first 20 shown):\n{}",
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
