#!/usr/bin/env python3
# Generates full-sim parity fixtures.
#
# For each normalized save, seeds CPython's random with 42, runs a full
# CombatSimulator.run_simulation(), and dumps every RunState field that
# matters to the metrics dict (highest_floor, total_time, total_xp, all the
# damage tallies, hit_counts, history arrays, specific_blocks_mined per ID,
# div_tier_* per div tier, and the skill tracker totals).
#
# A passing combat_parity test in Rust here means the entire engine pipeline
# is faithful at the sim level — Phase 9 (full-baseline diff) should then
# pass automatically.
#
# Usage: python3 engine_wasm/tests/fixtures/gen_combat.py

import json
import os
import random
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(REPO, "public"))

from core.player import Player
from engine.combat_loop import CombatSimulator

PROPS_DIR = os.path.join(HERE, "player_props")
OUT_DIR = os.path.join(HERE, "combat")
os.makedirs(OUT_DIR, exist_ok=True)

BLOCK_IDS = [
    "dirt1","com1","rare1","epic1","leg1","myth1","div1",
    "dirt2","com2","rare2","epic2","leg2","myth2","div2",
    "dirt3","com3","rare3","epic3","leg3","myth3","div3",
    "dirt4","com4","rare4","epic4","leg4","myth4","div4",
]


def f_to_u64(v):
    return struct.unpack("<Q", struct.pack("<d", float(v)))[0]


def build_player_from_engine_state(state):
    p = Player()
    p.asc1_unlocked = state["asc1_unlocked"]
    p.asc2_unlocked = state["asc2_unlocked"]
    p.arch_level = state["arch_level"]
    p.current_max_floor = state["current_max_floor"]
    p.hades_idol_level = state["hades_idol_level"]
    p.arch_ability_infernal_bonus = state["arch_ability_infernal_bonus"]
    p.total_infernal_cards = state["total_infernal_cards"]
    p.starting_speed_pool = state["starting_speed_pool"]
    for k, v in state["base_stats"].items():
        p.base_stats[k] = int(v)
    for k, v in state["upgrade_levels"].items():
        p.set_upgrade_level(int(k), int(v))
    for k, v in state["external_levels"].items():
        p.set_external_level(int(k), int(v))
    for k, v in state["cards"].items():
        p.set_card_level(k, int(v))
    return p


def dump_run(save_name, seed):
    src_path = os.path.join(PROPS_DIR, save_name)
    with open(src_path) as f:
        src = json.load(f)
    player = build_player_from_engine_state(src["engine_state"])

    random.seed(seed)
    sim = CombatSimulator(player)
    state = sim.run_simulation()

    # specific_blocks_mined / _frags: serialize as arrays indexed by BLOCK_IDS
    sbm = [state.specific_blocks_mined.get(bid, 0) for bid in BLOCK_IDS]
    sbf = [f_to_u64(state.specific_blocks_frags.get(bid, 0.0)) for bid in BLOCK_IDS]

    return {
        "save_name": save_name,
        "rng_seed": seed,
        "highest_floor": state.highest_floor,
        "total_time_bits":          f_to_u64(state.total_time),
        "total_xp_bits":            f_to_u64(state.total_xp),
        "blocks_mined":             state.blocks_mined,
        "total_stamina_spent_bits": f_to_u64(state.total_stamina_spent),
        "crosshair_spawns":         state.crosshair_spawns,
        "crosshair_damage_bits":    f_to_u64(state.crosshair_damage),
        "melee_damage_bits":        f_to_u64(state.melee_damage),
        "quake_damage_bits":        f_to_u64(state.quake_damage),
        "overkill_damage_bits":     f_to_u64(state.overkill_damage),
        "stamina_refunded_flurry_bits": f_to_u64(state.stamina_refunded_flurry),
        "stamina_refunded_mods_bits":   f_to_u64(state.stamina_refunded_mods),
        "stamina_wasted_overcap_bits":  f_to_u64(state.stamina_wasted_overcap),
        "speed_pool_bits":          f_to_u64(state.speed_pool),
        "stamina_bits":             f_to_u64(state.stamina),
        "crosshair_timer_bits":     f_to_u64(state.crosshair_timer),
        "hit_counts": list(state.hit_counts),
        "total_frags_bits": [f_to_u64(state.total_frags[i]) for i in range(7)],
        "div_tier_kills": [state.div_tier_kills.get(f"div{i+1}", 0) for i in range(4)],
        "div_tier_frags_bits": [f_to_u64(state.div_tier_frags.get(f"div{i+1}", 0.0)) for i in range(4)],
        "specific_blocks_mined": sbm,
        "specific_blocks_frags_bits": sbf,
        "history_floor": list(state.history['floor']),
        "history_stamina_bits": [f_to_u64(s) for s in state.history['stamina']],
        # Skill totals
        "total_enrage_casts":  state.skills_tracker.total_enrage_casts,
        "total_flurry_casts":  state.skills_tracker.total_flurry_casts,
        "total_quake_casts":   state.skills_tracker.total_quake_casts,
        "total_instacharges":  state.skills_tracker.total_instacharges,
    }


def main():
    saves = sorted(f for f in os.listdir(PROPS_DIR) if f.endswith(".json"))
    print(f"generating combat fixtures for {len(saves)} saves...")
    for save_name in saves:
        out = dump_run(save_name, seed=42)
        with open(os.path.join(OUT_DIR, save_name), "w") as f:
            json.dump(out, f)
        print(f"  {save_name}  -> floor {out['highest_floor']}, "
              f"swings {int(struct.unpack('<d', struct.pack('<Q', out['total_stamina_spent_bits']))[0])}")
    print("done.")


if __name__ == "__main__":
    main()
