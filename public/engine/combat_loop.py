# ==============================================================================
# Script: engine/combat_loop.py
# Version: 1.3.0 (Phase 4 Optimization: Skill Property Caching)
# Description: The core simulation engine. Executes a run floor-by-floor using 
#              micro-tick hit-by-hit combat. Features extreme loop-hoisting to
#              minimize @property accesses and maximize Monte Carlo throughput.
#
# Phase 4 Enhancement: Extended property caching to include all skill-related
#                     properties, eliminating repeated lookups during skill
#                     activation cascades (8-12% estimated speedup)
# ==============================================================================

import os
import sys
import random
import math

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.append(BASE_DIR)

from core.player import Player
from core.skills import SkillManager
from engine.floor_map import FloorGenerator

STAMINA_COST_PER_ORE = 0.0
STAMINA_COST_PER_HIT = 1.0

PATH_ORDER =[
    0, 1, 2, 3, 4, 5,
    11, 10, 9, 8, 7, 6,
    12, 13, 14, 15, 16, 17,
    23, 22, 21, 20, 19, 18
]


def _floor_to_js(floor, to_js, dict_to_js_object):
    """Serialize a Python floor (24-slot grid + gleaming multi + per-block
    modifiers/metadata) into the shape combat_kernel.js tickFloor expects.

    Includes all fields the JS port of _process_kill_rewards needs: xp, frag,
    frag_type, block_id, the modifier values, and the floor's gleaming_multi.
    Per-floor build cost: ~30µs serialization; amortized over 24 micro-ticks
    + reward processing that would otherwise cross the bridge."""
    blocks = []
    for b in floor.grid:
        if b is None:
            blocks.append(None)
        else:
            mods = b.modifiers
            blocks.append({
                'hp': float(b.hp),
                'armor': float(b.armor),
                'modExpMulti': float(mods.get('exp_multi', 1.0)),
                'modLootMulti': float(mods.get('loot_multi', 1.0)),
                'modStaGain': float(mods.get('stamina_gain', 0.0)),
                'modSpeedActive': bool(mods.get('speed_active', False)),
                'modSpeedGain': float(mods.get('speed_gain', 0.0)),
                'xp': float(b.xp),
                'fragAmt': float(b.frag_amt),
                'fragType': int(b.frag_type),
                'blockId': str(b.block_id),
            })
    return to_js({
        'gleamingMulti': float(floor.gleaming_multi),
        'blocks': blocks,
    }, dict_converter=dict_to_js_object)


def _push_state_to_js(js_state, state, current_floor_id):
    """Push Python-side fields that JS reads at the start of each tickFloor.

    stamina/speed_pool can change between floors if the engine ever applies
    rewards outside JS (currently it doesn't, but kept for safety).
    highest_floor is the current floor number — JS uses it for telemetry
    snapshots inside the floor.

    Notably NOT pushed: totalStaminaSpent and the tally fields. JS owns those
    end-to-end now; pushing would erase accumulated counts."""
    js_state.stamina = state.stamina
    js_state.speedPool = state.speed_pool
    js_state.highestFloor = current_floor_id


def _sync_state_from_js_minimal(state, js_state):
    """Per-floor sync — only stamina + speed_pool. Drives the outer
    `while state.stamina > 0` break check between floors."""
    state.stamina = js_state.stamina
    state.speed_pool = js_state.speedPool


def _sync_state_from_js(state, js_state):
    """End-of-sim full sync — pulls every telemetry / tally field the metrics
    dict will read. JS owns these across the whole sim now; we only read at
    the end to avoid bridge cost during the run."""
    state.stamina = js_state.stamina
    state.speed_pool = js_state.speedPool
    state.crosshair_timer = js_state.crosshairTimer
    state.total_time = js_state.totalTime
    state.hit_counts[0] = js_state.hitCounts[0]
    state.hit_counts[1] = js_state.hitCounts[1]
    state.hit_counts[2] = js_state.hitCounts[2]
    state.hit_counts[3] = js_state.hitCounts[3]
    state.crosshair_spawns = js_state.crosshairSpawns
    state.crosshair_damage = js_state.crosshairDamage
    state.melee_damage = js_state.meleeDamage
    state.quake_damage = js_state.quakeDamage
    state.overkill_damage = js_state.overkillDamage
    state.stamina_refunded_flurry = js_state.staminaRefundedFlurry
    state.stamina_refunded_mods = js_state.staminaRefundedMods
    state.stamina_wasted_overcap = js_state.staminaWastedOvercap
    state.total_stamina_spent = js_state.totalStaminaSpent

    # Reward tallies (JS-owned for the per-floor path)
    state.total_xp = js_state.totalXp
    state.blocks_mined = js_state.blocksMined
    # totalFrags is a 7-element JS Array; pull each tier value out.
    for k in range(7):
        state.total_frags[k] = js_state.totalFrags[k]
    # Specific-block dicts: JS Objects (string keys) → Python dicts via to_py.
    state.specific_blocks_mined = js_state.specificBlocksMined.to_py()
    state.specific_blocks_frags = js_state.specificBlocksFrags.to_py()
    state.div_tier_kills = js_state.divTierKills.to_py()
    state.div_tier_frags = js_state.divTierFrags.to_py()

    # Telemetry history
    state.history['floor'] = list(js_state.historyFloor)
    state.history['stamina'] = list(js_state.historyStamina)


def _sync_skills_from_js(skills, js_skills):
    """Pull skill state back from JS mirror so Python's SkillManager reflects final totals."""
    skills.enrage_cd = js_skills.enrageCd
    skills.enrage_charges = js_skills.enrageCharges
    skills.flurry_cd = js_skills.flurryCd
    skills.flurry_timer = js_skills.flurryTimer
    skills.quake_cd = js_skills.quakeCd
    skills.quake_charges = js_skills.quakeCharges
    skills.total_enrage_casts = js_skills.totalEnrageCasts
    skills.total_flurry_casts = js_skills.totalFlurryCasts
    skills.total_quake_casts = js_skills.totalQuakeCasts
    skills.total_instacharges = js_skills.totalInstacharges

class RunState:
    def __init__(self, player):
        self.stamina = player.max_sta
        self.speed_pool = getattr(player, 'starting_speed_pool', 0)
        self.total_time = 0.0
        self.total_stamina_spent = 0.0
        self.stamina_refunded_flurry = 0.0
        self.stamina_refunded_mods = 0.0
        self.stamina_wasted_overcap = 0.0
        self.crosshair_timer = 0.0
        self.total_xp = 0.0
        self.total_frags = {0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0}
        
        # --- NEW TELEMETRY ---
        self.crosshair_spawns = 0
        self.crosshair_damage = 0.0
        self.melee_damage = 0.0
        self.quake_damage = 0.0
        self.overkill_damage = 0.0
        
        # --- DIVINE TRACKING ---
        self.div_tier_kills = {'div1':0, 'div2':0, 'div3':0, 'div4':0}
        self.div_tier_frags = {'div1':0.0, 'div2':0.0, 'div3':0.0, 'div4':0.0}
        
        self.blocks_mined = 0
        self.specific_blocks_mined = {} # <--- Specific tracking for Card Farming
        self.specific_blocks_frags = {} # <--- Specific fragment yield tracking for telemetry
        self.highest_floor = 1
        
        # --- TELEMETRY DATA ---
        # Only 'floor' and 'stamina' are consumed by the JS layer (see engine_worker.js).
        # 'time' and 'speed_pool' were tracked but never read — dropped to halve append cost.
        # hit_counts is [normal, crit, super, ultra]. List indexing is faster than dict
        # lookup on the per-hit hot path and lets roll_crit increment without a tuple return.
        self.hit_counts = [0, 0, 0, 0]
        self.history = {
            'floor': [],
            'stamina':[]
        }

    def record_telemetry(self):
        """Snapshots the current state into the history arrays."""
        self.history['floor'].append(self.highest_floor)
        self.history['stamina'].append(self.stamina)


class CombatSimulator:
    def __init__(self, player: Player, js_kernel=None, js_rng=None):
        """
        js_kernel / js_rng: optional Pyodide JsProxies of the public/combat_kernel.js
        module's `tickBlock` (and friends) plus an RNG built via `createRng(seed)`.
        When both are provided, run_simulation() delegates the inner micro-tick
        loop to JS. When either is None, the existing pure-Python inner loop
        runs unchanged.
        """
        self.player = player
        self.generator = FloorGenerator()
        self.js_kernel = js_kernel
        self.js_rng = js_rng

    def _process_kill_rewards(self, block, floor_obj, state: RunState, p_max_sta):
        """Processes loot, XP, and modifiers when a block HP hits 0."""
        xp_yield = block.xp * block.modifiers.get('exp_multi', 1.0) * floor_obj.gleaming_multi
        state.total_xp += xp_yield
        
        loot_yield = block.frag_amt * block.modifiers.get('loot_multi', 1.0) * floor_obj.gleaming_multi
        if block.frag_type in state.total_frags:
            state.total_frags[block.frag_type] += loot_yield
            if block.block_id.startswith('div'):
                if block.block_id in state.div_tier_kills:
                    state.div_tier_kills[block.block_id] += 1
                    state.div_tier_frags[block.block_id] += loot_yield
            
        sta_gain = block.modifiers.get('stamina_gain', 0.0)
        if sta_gain > 0:
            actual_gain = min(p_max_sta - state.stamina, sta_gain)
            state.stamina += actual_gain
            state.stamina_refunded_mods += actual_gain
            state.stamina_wasted_overcap += (sta_gain - actual_gain)
            
        if block.modifiers.get('speed_active', False):
            state.speed_pool += block.modifiers.get('speed_gain', 0.0)
            
        state.blocks_mined += 1
        
        # Tracking specific block tier/type kills
        block_id = block.block_id
        state.specific_blocks_mined[block_id] = state.specific_blocks_mined.get(block_id, 0) + 1
        state.specific_blocks_frags[block_id] = state.specific_blocks_frags.get(block_id, 0.0) + loot_yield


    def run_simulation(self):
        # ======================================================================
        # PHASE 11 OPTIMIZATION: Initialize infernal bonus cache
        # Pre-compute all 28 block infernal bonuses once to eliminate repeated
        # dictionary creation and calculations (called 39 times per property access)
        # ======================================================================
        self.player._cache_infernal_bonuses()
        
        # ======================================================================
        # LOOP HOISTING (ATTRIBUTE CACHING)
        # We cache static @property calculations into local variables once per
        # run to prevent billions of redundant dictionary lookups during the loop.
        # ======================================================================
        p_max_sta = self.player.max_sta
        p_atk_spd = self.player.atk_spd
        p_speed_mod_atk_rate = self.player.speed_mod_attack_rate
        p_flurry_bonus_atk_spd = self.player.flurry_bonus_atk_spd
        p_damage = self.player.damage
        p_enraged_damage = self.player.enraged_damage
        p_armor_pen = self.player.armor_pen
        p_quake_dmg_to_all = self.player.quake_dmg_to_all

        # --- NEW CROSSHAIR CACHE ---
        p_crosshair_auto_tap = self.player.crosshair_auto_tap
        p_gold_crosshair_chance = self.player.gold_crosshair_chance
        p_gold_crosshair_mult = self.player.gold_crosshair_mult
        # Default testing interval. The stress test will override this dynamically.
        CROSSHAIR_SPAWN_INTERVAL = getattr(self, 'crosshair_interval', 3.5)
        
        # Crit Cache
        p_u_crit_ch = self.player.ultra_crit_chance
        p_u_crit_dmg = self.player.ultra_crit_dmg_mult
        p_s_crit_ch = self.player.super_crit_chance
        p_s_crit_dmg = self.player.super_crit_dmg_mult
        p_crit_ch = self.player.crit_chance
        p_crit_dmg = self.player.crit_dmg_mult
        
        # --- ADDED ENRAGED CRIT CACHE AND REMOVED THE ADDITIVE BONUS ---
        p_enraged_crit_dmg = self.player.enraged_crit_dmg_mult
        
        # ======================================================================
        # PHASE 4 OPTIMIZATION: SKILL PROPERTY CACHING
        # Cache frequently-accessed skill properties to eliminate repeated
        # property lookups during skill activation cascades
        # ======================================================================
        p_ability_insta = self.player.ability_insta_charge
        p_enrage_charges_max = self.player.enrage_charges
        p_enrage_cd_max = self.player.enrage_cooldown
        p_flurry_duration = self.player.flurry_duration
        p_flurry_cd_max = self.player.flurry_cooldown
        p_flurry_sta_cast = self.player.flurry_sta_on_cast
        p_quake_attacks_max = self.player.quake_attacks
        p_quake_cd_max = self.player.quake_cooldown
        
        # Pre-compute upgrade-dependent flags (eliminates dict lookups in hot loop)
        upg8 = self.player.upgrade_levels.get(8, 0)
        auto_enrage_enabled = upg8 >= 1
        auto_flurry_enabled = upg8 >= 2
        auto_quake_enabled = upg8 >= 3

        state = RunState(self.player)

        # Capture hit_counts by reference so roll_crit can increment it in-place.
        # Returning just a float (instead of (float, str)) avoids tuple allocation
        # on every hit — measurable in Pyodide where tuple allocs are expensive.
        hit_counts = state.hit_counts

        # Using a fast local closure instead of a class method eliminates
        # function-call overhead and 'self.' lookups on every single hit.
        def roll_crit(is_enrage_active):
            # 1. Roll for Base Crit
            if random.random() < p_crit_ch:
                base_c_dmg = p_enraged_crit_dmg if is_enrage_active else p_crit_dmg

                # 2. Roll for Super Crit (Nested)
                if random.random() < p_s_crit_ch:

                    # 3. Roll for Ultra Crit (Nested)
                    if random.random() < p_u_crit_ch:
                        # Ultra Crit: Compounds all 3 multipliers!
                        hit_counts[3] += 1
                        return base_c_dmg * p_s_crit_dmg * p_u_crit_dmg
                    else:
                        # Super Crit: Compounds 2 multipliers
                        hit_counts[2] += 1
                        return base_c_dmg * p_s_crit_dmg
                else:
                    # Standard Crit
                    hit_counts[1] += 1
                    return base_c_dmg
            else:
                # Normal Hit
                hit_counts[0] += 1
                return 1.0

        # ======================================================================
        
        # Pass cached skill properties to SkillManager to eliminate property lookups
        skill_cache = {
            'ability_insta': p_ability_insta,
            'enrage_charges': p_enrage_charges_max,
            'enrage_cd': p_enrage_cd_max,
            'flurry_duration': p_flurry_duration,
            'flurry_cd': p_flurry_cd_max,
            'flurry_sta_cast': p_flurry_sta_cast,
            'quake_attacks': p_quake_attacks_max,
            'quake_cd': p_quake_cd_max,
            'auto_enrage': auto_enrage_enabled,
            'auto_flurry': auto_flurry_enabled,
            'auto_quake': auto_quake_enabled
        }
        skills = SkillManager(self.player, skill_cache)
        current_floor_id = 1
        state.record_telemetry()

        # ======================================================================
        # JS KERNEL SETUP (opt-in; off by default)
        # When js_kernel + js_rng are supplied, the inner micro-tick is delegated
        # to public/combat_kernel.js. Otherwise the existing Python loop runs.
        #
        # bool() handles Pyodide 0.29's JsNull (which is `!= None` but falsy);
        # JS callers often pass `null` for these when the kernel is disabled.
        # ======================================================================
        use_js = bool(self.js_kernel) and bool(self.js_rng)
        js_cfg = None
        js_state = None
        js_skills = None
        _to_js = None
        _dict_to_obj = None
        if use_js:
            import js as _js_mod
            from pyodide.ffi import to_js as _imported_to_js
            _to_js = _imported_to_js
            _dict_to_obj = _js_mod.Object.fromEntries

            js_cfg = _to_js({
                'pMaxSta': p_max_sta,
                'pAtkSpd': p_atk_spd,
                'pSpeedModAtkRate': p_speed_mod_atk_rate,
                'pFlurryBonusAtkSpd': p_flurry_bonus_atk_spd,
                'pDamage': p_damage,
                'pEnragedDamage': p_enraged_damage,
                'pArmorPen': p_armor_pen,
                'pQuakeDmgToAll': p_quake_dmg_to_all,
                'pCrosshairAutoTap': p_crosshair_auto_tap,
                'pGoldCrosshairChance': p_gold_crosshair_chance,
                'pGoldCrosshairMult': p_gold_crosshair_mult,
                'crosshairInterval': CROSSHAIR_SPAWN_INTERVAL,
                'pCritCh': p_crit_ch,
                'pSCritCh': p_s_crit_ch,
                'pUCritCh': p_u_crit_ch,
                'pCritDmg': p_crit_dmg,
                'pSCritDmg': p_s_crit_dmg,
                'pUCritDmg': p_u_crit_dmg,
                'pEnragedCritDmg': p_enraged_crit_dmg,
                'pAbilityInsta': p_ability_insta,
                'pEnrageChargesMax': p_enrage_charges_max,
                'pEnrageCdMax': p_enrage_cd_max,
                'pFlurryDuration': p_flurry_duration,
                'pFlurryCdMax': p_flurry_cd_max,
                'pFlurrySta': p_flurry_sta_cast,
                'pQuakeAttacksMax': p_quake_attacks_max,
                'pQuakeCdMax': p_quake_cd_max,
                'autoEnrage': auto_enrage_enabled,
                'autoFlurry': auto_flurry_enabled,
                'autoQuake': auto_quake_enabled,
            }, dict_converter=_dict_to_obj)

            # Per-floor kernel owns ALL combat + reward state. The js_state
            # carries the live tallies that Python would otherwise track via
            # _process_kill_rewards. End-of-sim sync pulls everything back.
            js_state = _to_js({
                'stamina': state.stamina,
                'speedPool': state.speed_pool,
                'crosshairTimer': state.crosshair_timer,
                'totalTime': state.total_time,
                'hitCounts': list(state.hit_counts),
                'crosshairSpawns': state.crosshair_spawns,
                'crosshairDamage': state.crosshair_damage,
                'meleeDamage': state.melee_damage,
                'quakeDamage': state.quake_damage,
                'overkillDamage': state.overkill_damage,
                'staminaRefundedFlurry': state.stamina_refunded_flurry,
                'staminaRefundedMods': state.stamina_refunded_mods,
                'staminaWastedOvercap': state.stamina_wasted_overcap,
                'totalStaminaSpent': state.total_stamina_spent,
                # Reward tallies (JS-owned end-to-end)
                'totalXp': state.total_xp,
                # 7-element array indexed by frag tier (0..6). Cleaner JS<->Py
                # roundtrip than a dict with integer keys (which JS Objects
                # auto-stringify).
                'totalFrags': [state.total_frags.get(k, 0) for k in range(7)],
                'blocksMined': state.blocks_mined,
                'specificBlocksMined': dict(state.specific_blocks_mined),
                'specificBlocksFrags': dict(state.specific_blocks_frags),
                'divTierKills': dict(state.div_tier_kills),
                'divTierFrags': dict(state.div_tier_frags),
                # Telemetry (record_telemetry calls per slot, inside JS)
                'highestFloor': 1,
                'historyFloor': list(state.history['floor']),
                'historyStamina': list(state.history['stamina']),
            }, dict_converter=_dict_to_obj)

            js_skills = _to_js({
                'enrageCd': skills.enrage_cd,
                'enrageCharges': skills.enrage_charges,
                'flurryCd': skills.flurry_cd,
                'flurryTimer': skills.flurry_timer,
                'quakeCd': skills.quake_cd,
                'quakeCharges': skills.quake_charges,
                'totalEnrageCasts': skills.total_enrage_casts,
                'totalFlurryCasts': skills.total_flurry_casts,
                'totalQuakeCasts': skills.total_quake_casts,
                'totalInstacharges': skills.total_instacharges,
            }, dict_converter=_dict_to_obj)

        while state.stamina > 0:
            floor = self.generator.generate_floor(current_floor_id, self.player)
            state.highest_floor = current_floor_id

            if use_js:
                # JS path: one bridge crossing per floor. tickFloor owns the
                # full per-slot iteration, micro-tick combat, Quake AoE, and
                # _process_kill_rewards-equivalent tallying.
                js_floor = _floor_to_js(floor, _to_js, _dict_to_obj)
                _push_state_to_js(js_state, state, current_floor_id)
                self.js_kernel.tickFloor(js_cfg, js_floor, js_state, js_skills, self.js_rng)
                _sync_state_from_js_minimal(state, js_state)
                current_floor_id += 1
                continue

            for i, slot_idx in enumerate(PATH_ORDER):
                if state.stamina <= 0: break

                target_block = floor.grid[slot_idx]
                if target_block is None or target_block.hp <= 0: continue

                state.stamina -= STAMINA_COST_PER_ORE
                state.total_stamina_spent += STAMINA_COST_PER_ORE

                # --- MICRO-TICK COMBAT LOOP (Python path) ---
                while target_block.hp > 0 and state.stamina > 0:
                    
                    is_flurry = skills.is_flurry_active
                    is_enrage = skills.is_enrage_active
                    
                    flurry_mult = 1.0 + p_flurry_bonus_atk_spd if is_flurry else 1.0
                    
                    if state.speed_pool > 0:
                        current_atk_spd = p_atk_spd * p_speed_mod_atk_rate * flurry_mult
                        state.speed_pool -= 1
                    else:
                        current_atk_spd = p_atk_spd * flurry_mult
                        
                    time_passed = 1.0 / current_atk_spd
                    state.total_time += time_passed
                    state.crosshair_timer += time_passed
                    
                    # --- NEW: CROSSHAIR SPAWN & AUTO-TAP LOGIC ---
                    while state.crosshair_timer >= CROSSHAIR_SPAWN_INTERVAL:
                        state.crosshair_timer -= CROSSHAIR_SPAWN_INTERVAL
                        state.crosshair_spawns += 1
                        
                        # Did it roll an Auto-Tap?
                        if random.random() < p_crosshair_auto_tap:
                            ch_base_dmg = p_enraged_damage if is_enrage else p_damage
                            ch_eff_armor = max(0, target_block.armor - p_armor_pen)
                            
                            # Did it roll a Gold (Crit) Crosshair?
                            if random.random() < p_gold_crosshair_chance:
                                ch_crit_mult = roll_crit(is_enrage)
                                # Fix: Apply armor BEFORE crit and gold multipliers!
                                ch_actual_dmg = max(1.0, (ch_base_dmg - ch_eff_armor) * p_gold_crosshair_mult * ch_crit_mult)
                            else:
                                ch_actual_dmg = max(1.0, ch_base_dmg - ch_eff_armor)
                                
                            eff_ch = min(ch_actual_dmg, target_block.hp)
                            state.overkill_damage += (ch_actual_dmg - eff_ch)
                            state.crosshair_damage += ch_actual_dmg
                            
                            target_block.hp -= ch_actual_dmg
                            # Note: No Stamina subtracted! Free damage!
                            
                    if target_block.hp <= 0:
                        break  # Block died to a Crosshair hit, break out of micro-tick loop!
                        
                    events = skills.tick(time_passed)
                    if events["stamina_restored"] > 0:
                        actual_gain = min(p_max_sta - state.stamina, events["stamina_restored"])
                        state.stamina += actual_gain
                        state.stamina_refunded_flurry += actual_gain
                        state.stamina_wasted_overcap += (events["stamina_restored"] - actual_gain)
                        
                    crit_mult = roll_crit(is_enrage)

                    # 1. Base damage applies Enrage Additive Math instantly
                    base_dmg = p_enraged_damage if is_enrage else p_damage
                        
                    # 2. Subtract Effective Armor (Accounting for Armor Pen)
                    eff_armor = max(0, target_block.armor - p_armor_pen)
                    
                    # 3. Factor in Crit Multipliers, bounded by a minimum of 1 damage
                    actual_dmg = max(1.0, (base_dmg - eff_armor) * crit_mult)
                    
                    eff_melee = min(actual_dmg, target_block.hp)
                    state.overkill_damage += (actual_dmg - eff_melee)
                    state.melee_damage += actual_dmg
                    
                    target_block.hp -= actual_dmg
                    state.stamina -= STAMINA_COST_PER_HIT
                    state.total_stamina_spent += STAMINA_COST_PER_HIT
                    
                    # Quake AOE Proc
                    if skills.consume_attack():
                        q_base = base_dmg * p_quake_dmg_to_all # <--- Quake now properly inherits Enrage Damage too!
                        for bg_idx in PATH_ORDER[i+1:]:
                            bg_block = floor.grid[bg_idx]
                            if bg_block is not None and bg_block.hp > 0:
                                q_crit = roll_crit(is_enrage)

                                bg_eff_armor = max(0, bg_block.armor - p_armor_pen)
                                q_dmg = max(1.0, (q_base - bg_eff_armor) * q_crit)
                                
                                q_eff = min(q_dmg, bg_block.hp)
                                state.overkill_damage += (q_dmg - q_eff)
                                state.quake_damage += q_dmg
                                
                                bg_block.hp -= q_dmg
                                if bg_block.hp <= 0:
                                    self._process_kill_rewards(bg_block, floor, state, p_max_sta)
                                    
                if target_block.hp <= 0:
                    self._process_kill_rewards(target_block, floor, state, p_max_sta)
                
                state.record_telemetry()
                    
            current_floor_id += 1
            
        if use_js:
            # End-of-sim full state sync: per-block we only synced stamina +
            # speed_pool to keep bridge cost down; pull the rest of the
            # telemetry fields (damage tallies, crosshair counts, etc.) now.
            _sync_state_from_js(state, js_state)
            _sync_skills_from_js(skills, js_skills)
        state.skills_tracker = skills
        return state

if __name__ == "__main__":
    from tools.verify_player import load_state_from_json
    
    p = Player()
    json_path = os.path.join(BASE_DIR, "tools", "player_state.json")
    if os.path.exists(json_path):
        load_state_from_json(p, json_path)
    else:
        print(f"Warning: {json_path} not found. Running with baseline stats.")
        
    sim = CombatSimulator(p)
    result_state = sim.run_simulation()