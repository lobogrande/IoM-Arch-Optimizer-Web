#!/usr/bin/env python3
# Generates the player_parity golden fixtures.
#
# For each normalized save in /normalized_saves/, builds a Python Player and
# dumps every computed @property value (max_sta, damage, crit_chance, etc.)
# into a JSON fixture at engine_wasm/tests/fixtures/player_props/{save}.json.
# The Rust parity test (tests/player_parity.rs) loads these fixtures, builds
# an equivalent Rust Player from `engine_state`, and asserts every property
# matches to last ULP.
#
# Usage: python3 engine_wasm/tests/fixtures/gen_player_props.py
# Re-run only if you change the property set or add new saves.

import json
import os
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(REPO, "public"))

from core.player import Player  # type: ignore

NORM_DIR = os.path.join(REPO, "normalized_saves")
OUT_DIR  = os.path.join(HERE, "player_props")
os.makedirs(OUT_DIR, exist_ok=True)

# Mirrors EXTERNAL_UI_GROUPS in src/game_data.js / project_config.py — used
# to fan a normalized save's group-keyed external_upgrades back out to the
# row-keyed external_levels the engine wants.
EXTERNAL_UI_GROUPS = [
    {"name": "Hestia Idol",         "rows": [4]},
    {"name": "Axolotl Skin",        "rows": [5]},
    {"name": "Dino Skin",           "rows": [6, 7]},
    {"name": "Geoduck Tribute",     "rows": [8]},
    {"name": "Avada Keda- Skill",   "rows": [9, 10, 11]},
    {"name": "Block Bonker Skill",  "rows": [12, 13, 14]},
    {"name": "Archaeology Bundle",  "rows": [15]},
    {"name": "Ascension Bundle",    "rows": [16, 17, 18, 19]},
    {"name": "Arch Ability Card",   "rows": [20]},
]


def normalized_to_engine_state(save: dict) -> dict:
    """Convert the normalized-save JSON shape into the engine state shape
    Player setters consume.  Mirrors the import-side of
    scripts/save_import.mjs (loadStateFromJson + toEngineState)."""
    settings = save.get("settings", {})

    # internal_upgrades: keys are "ID - Name", strip name to get int ID
    upgrade_levels = {}
    for k, v in save.get("internal_upgrades", {}).items():
        try:
            uid = int(k.split(" - ")[0])
            upgrade_levels[uid] = v
        except (ValueError, IndexError):
            pass

    # external_upgrades: group name → fan out across rows
    ext_raw = save.get("external_upgrades", {})
    external_levels = {}
    for group in EXTERNAL_UI_GROUPS:
        if group["name"] in ext_raw:
            for row in group["rows"]:
                external_levels[row] = ext_raw[group["name"]]

    # Hades Idol — row 21 — comes from settings.hades_idol_level if exported there
    if "hades_idol_level" in settings:
        external_levels[21] = settings["hades_idol_level"]

    # Arch ability infernal bonus comes through external_upgrades as a
    # decimal here (already divided by 100 in the export step).
    aaib = float(ext_raw.get("Arch Ability Infernal Bonus", 0.0) or 0.0)

    return {
        "asc1_unlocked": bool(settings.get("asc1_unlocked", False)),
        "asc2_unlocked": bool(settings.get("asc2_unlocked", False)),
        "arch_level": int(settings.get("arch_level", 1)),
        "current_max_floor": int(settings.get("current_max_floor", 1)),
        "hades_idol_level": int(external_levels.get(21, 0)),
        "arch_ability_infernal_bonus": aaib,
        "total_infernal_cards": int(settings.get("total_infernal_cards", 0)),
        "starting_speed_pool": int(settings.get("starting_speed_pool", 0)),
        "base_stats": dict(save.get("base_stats", {})),
        "upgrade_levels": upgrade_levels,
        "external_levels": external_levels,
        "cards": dict(save.get("cards", {})),
    }


def build_player(state: dict) -> Player:
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


# All @property names we want to assert against in the Rust test.
PROPERTIES = [
    "max_sta", "damage", "enraged_damage", "armor_pen", "atk_spd",
    "crit_chance", "crit_dmg_mult", "enraged_crit_dmg_mult",
    "super_crit_chance", "super_crit_dmg_mult",
    "ultra_crit_chance", "ultra_crit_dmg_mult",
    "ability_insta_charge",
    "crosshair_auto_tap", "gold_crosshair_chance", "gold_crosshair_mult",
    "exp_gain_mult", "frag_loot_gain_mult",
    "exp_mod_chance", "exp_mod_gain",
    "loot_mod_chance", "loot_mod_gain",
    "speed_mod_chance", "speed_mod_gain", "speed_mod_attack_rate",
    "stamina_mod_chance", "stamina_mod_gain",
    "gleaming_floor_chance", "gleaming_floor_multi",
    "enrage_charges", "enrage_cooldown",
    "enrage_bonus_dmg", "enrage_bonus_crit_dmg",
    "flurry_duration", "flurry_cooldown", "flurry_bonus_atk_spd", "flurry_sta_on_cast",
    "quake_attacks", "quake_cooldown", "quake_dmg_to_all",
    "infernal_multiplier",
]


def dump_props(p: Player) -> dict:
    out = {}
    for name in PROPERTIES:
        val = getattr(p, name)
        # All properties return float-ish numbers. Use raw u64 bit pattern for
        # exact compare in Rust (avoid JSON decimal rounding losing precision).
        out[name] = struct.unpack("<Q", struct.pack("<d", float(val)))[0]
    # Also dump the infernal cache (28 values) so we can validate cache parity.
    inf_cache = []
    for block_id in [
        "dirt1","com1","rare1","epic1","leg1","myth1","div1",
        "dirt2","com2","rare2","epic2","leg2","myth2","div2",
        "dirt3","com3","rare3","epic3","leg3","myth3","div3",
        "dirt4","com4","rare4","epic4","leg4","myth4","div4",
    ]:
        v = p.inf(block_id) if p.asc1_unlocked else 0.0
        inf_cache.append(struct.unpack("<Q", struct.pack("<d", float(v)))[0])
    out["__infernal_cache_bits"] = inf_cache
    return out


def main():
    saves = sorted(f for f in os.listdir(NORM_DIR) if f.endswith(".json"))
    print(f"generating fixtures for {len(saves)} saves...")
    for save_file in saves:
        with open(os.path.join(NORM_DIR, save_file), "r") as f:
            save = json.load(f)
        engine_state = normalized_to_engine_state(save)
        player = build_player(engine_state)
        props = dump_props(player)
        out = {
            "save_name": save_file,
            "engine_state": engine_state,
            "properties_bits": props,
        }
        out_path = os.path.join(OUT_DIR, save_file)
        with open(out_path, "w") as f:
            json.dump(out, f, indent=2)
        print(f"  {save_file}")
    print("done.")


if __name__ == "__main__":
    main()
