#!/usr/bin/env python3
# Generates Block + SkillManager parity fixtures.
#
# For each normalized save:
#   - Build a Python Player.
#   - For each (block_id, test_floor) combination, instantiate a Block and
#     dump (hp, armor, xp, frag_amt, frag_type) as u64-bit-pattern values
#     so Rust can compare to last ULP.
#   - Build a SkillConfig from the Player.  Run SkillManager.tick() for 200
#     steps with a Python random.seed(42) and dump the final manager state
#     plus a few intermediate snapshots — this validates the auto-cast
#     cascade + RNG ordering matches.
#
# Usage: python3 engine_wasm/tests/fixtures/gen_block_skills.py

import json
import os
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(REPO, "public"))

import random
from core.player import Player
from core.block import Block
from core.skills import SkillManager

NORM_DIR = os.path.join(REPO, "normalized_saves")
PROPS_DIR = os.path.join(HERE, "player_props")  # reuse engine_state from there
BLOCK_OUT = os.path.join(HERE, "block_props")
SKILLS_OUT = os.path.join(HERE, "skills_props")
os.makedirs(BLOCK_OUT, exist_ok=True)
os.makedirs(SKILLS_OUT, exist_ok=True)

BLOCK_IDS = [
    "dirt1","com1","rare1","epic1","leg1","myth1","div1",
    "dirt2","com2","rare2","epic2","leg2","myth2","div2",
    "dirt3","com3","rare3","epic3","leg3","myth3","div3",
    "dirt4","com4","rare4","epic4","leg4","myth4","div4",
]

# Floors chosen to exercise every scaling-table breakpoint, including the
# floor-150 armor-skip bug and the floor-300 double-trigger.
TEST_FLOORS = [50, 99, 100, 101, 149, 150, 151, 299, 300, 301, 350, 500]


def f_to_u64(v: float) -> int:
    return struct.unpack("<Q", struct.pack("<d", float(v)))[0]


def build_player_from_engine_state(state: dict) -> Player:
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
    p._cache_infernal_bonuses()
    return p


def gen_block_fixture(save_name: str) -> None:
    src_path = os.path.join(PROPS_DIR, save_name)
    with open(src_path) as f:
        src = json.load(f)
    player = build_player_from_engine_state(src["engine_state"])
    p_exp_mult = player.exp_gain_mult
    p_frag_mult = player.frag_loot_gain_mult

    blocks = []
    for floor in TEST_FLOORS:
        for bid in BLOCK_IDS:
            b = Block(bid, floor, player, exp_mult_cache=p_exp_mult, frag_mult_cache=p_frag_mult)
            blocks.append({
                "block_id": bid,
                "floor": floor,
                "hp_bits": f_to_u64(b.hp),
                "armor_bits": f_to_u64(b.armor),
                "xp_bits": f_to_u64(b.xp),
                "frag_amt_bits": f_to_u64(b.frag_amt),
                "frag_type": b.frag_type,
            })

    out = {
        "save_name": save_name,
        "p_exp_mult_bits": f_to_u64(p_exp_mult),
        "p_frag_mult_bits": f_to_u64(p_frag_mult),
        "blocks": blocks,
    }
    with open(os.path.join(BLOCK_OUT, save_name), "w") as f:
        json.dump(out, f)


def gen_skills_fixture(save_name: str) -> None:
    src_path = os.path.join(PROPS_DIR, save_name)
    with open(src_path) as f:
        src = json.load(f)
    player = build_player_from_engine_state(src["engine_state"])

    # Build SkillManager from player (no skill_cache — use property fallback).
    sm = SkillManager(player)

    # Pull out the cached config the manager constructed so the Rust test can
    # build an identical SkillConfig.
    upg8 = player.upgrade_levels.get(8, 0)
    cfg = {
        "ability_insta_bits":      f_to_u64(player.ability_insta_charge),
        "enrage_charges_max_bits": f_to_u64(player.enrage_charges),
        "enrage_cd_max_bits":      f_to_u64(player.enrage_cooldown),
        "flurry_duration_max_bits":f_to_u64(player.flurry_duration),
        "flurry_cd_max_bits":      f_to_u64(player.flurry_cooldown),
        "flurry_sta_cast_bits":    f_to_u64(player.flurry_sta_on_cast),
        "quake_attacks_max_bits":  f_to_u64(player.quake_attacks),
        "quake_cd_max_bits":       f_to_u64(player.quake_cooldown),
        "auto_enrage": upg8 >= 1,
        "auto_flurry": upg8 >= 2,
        "auto_quake":  upg8 >= 3,
    }

    # Tick for 200 steps with seed=42 and dt=1.0.  Dump the resulting state.
    random.seed(42)
    total_stamina_restored = 0.0
    snapshots = []
    for step in range(200):
        events = sm.tick(1.0)
        total_stamina_restored += events["stamina_restored"]
        # Snapshot every 50 steps so a single divergence is easy to localize.
        if (step + 1) % 50 == 0:
            snapshots.append({
                "step": step + 1,
                "enrage_cd_bits":      f_to_u64(sm.enrage_cd),
                "enrage_charges_bits": f_to_u64(sm.enrage_charges),
                "flurry_cd_bits":      f_to_u64(sm.flurry_cd),
                "flurry_timer_bits":   f_to_u64(sm.flurry_timer),
                "quake_cd_bits":       f_to_u64(sm.quake_cd),
                "quake_charges_bits":  f_to_u64(sm.quake_charges),
                "total_enrage_casts":  sm.total_enrage_casts,
                "total_flurry_casts":  sm.total_flurry_casts,
                "total_quake_casts":   sm.total_quake_casts,
                "total_instacharges":  sm.total_instacharges,
            })

    out = {
        "save_name": save_name,
        "config": cfg,
        "tick_count": 200,
        "dt": 1.0,
        "rng_seed": 42,
        "total_stamina_restored_bits": f_to_u64(total_stamina_restored),
        "snapshots": snapshots,
    }
    with open(os.path.join(SKILLS_OUT, save_name), "w") as f:
        json.dump(out, f)


def main():
    saves = sorted(f for f in os.listdir(PROPS_DIR) if f.endswith(".json"))
    print(f"generating block + skills fixtures for {len(saves)} saves...")
    for s in saves:
        gen_block_fixture(s)
        gen_skills_fixture(s)
        print(f"  {s}")
    print("done.")


if __name__ == "__main__":
    main()
