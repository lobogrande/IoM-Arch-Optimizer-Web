#!/usr/bin/env python3
# Generates floor_map parity fixtures.
#
# For each normalized save, seed CPython's random with 42 and generate one
# floor at each test floor_id.  Dump the result (gleaming + per-slot
# block_id + modifier bits) so Rust can confirm byte-identical behavior.
#
# A single fixture file per save covers ~14 floors: a mix of regular
# floors (no boss), boss floors (uniform layouts), and mixed-gauntlet
# floors (per-slot overrides).  Asc2 fixtures additionally include the
# tier-3 uniform bosses (110, 125, 140, 149) and the asc2-99 override.

import json
import os
import random
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(REPO, "public"))

from core.player import Player
from engine.floor_map import FloorGenerator

PROPS_DIR = os.path.join(HERE, "player_props")
OUT_DIR = os.path.join(HERE, "floor_map")
os.makedirs(OUT_DIR, exist_ok=True)

# Floors that exercise: regular spawn rolls, every boss-floor type, the
# floor-150 / floor-300 scaling boundaries (also covered in block_parity but
# important to confirm reachable here via the generator), and asc2 bosses.
TEST_FLOORS = [
    5, 25, 50, 75,                  # regular floors at different chance brackets
    11, 17, 23, 25, 29, 31, 35, 41, 44,  # asc1 uniform bosses
    34, 49, 74,                     # asc1 mixed gauntlets
    98, 99,                         # asc1 boss + mixed at top
    80, 95, 110, 125, 135, 140, 149,  # asc2 extra uniforms
    100, 125, 150, 175,             # high regular floors (asc2 territory)
]
TEST_FLOORS = sorted(set(TEST_FLOORS))


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
    p._cache_infernal_bonuses()
    return p


def dump_floor(player, floor_id, seed):
    """Generate floor with a freshly seeded RNG, dump bit-accurate state."""
    gen = FloorGenerator()
    random.seed(seed)
    floor = gen.generate_floor(floor_id, player)

    slots = []
    for slot in floor.grid:
        if slot is None:
            slots.append(None)
        else:
            m = slot.modifiers
            slots.append({
                "block_id": slot.block_id,
                "exp_multi_bits":    f_to_u64(m.get("exp_multi", 1.0)),
                "loot_multi_bits":   f_to_u64(m.get("loot_multi", 1.0)),
                "stamina_gain_bits": f_to_u64(m.get("stamina_gain", 0.0)),
                "speed_active":      bool(m.get("speed_active", False)),
                "speed_gain_bits":   f_to_u64(m.get("speed_gain", 0.0)),
            })

    return {
        "floor_id":           floor_id,
        "seed":               seed,
        "is_gleaming":        floor.is_gleaming,
        "gleaming_multi_bits": f_to_u64(floor.gleaming_multi),
        "slots":              slots,
    }


def main():
    saves = sorted(f for f in os.listdir(PROPS_DIR) if f.endswith(".json"))
    print(f"generating floor_map fixtures for {len(saves)} saves x {len(TEST_FLOORS)} floors...")
    for save_name in saves:
        with open(os.path.join(PROPS_DIR, save_name)) as f:
            src = json.load(f)
        player = build_player_from_engine_state(src["engine_state"])
        floors = [dump_floor(player, fid, seed=42) for fid in TEST_FLOORS]
        out = {"save_name": save_name, "rng_seed": 42, "floors": floors}
        with open(os.path.join(OUT_DIR, save_name), "w") as f:
            json.dump(out, f)
        print(f"  {save_name}")
    print("done.")


if __name__ == "__main__":
    main()
