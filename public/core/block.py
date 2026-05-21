# ==============================================================================
# Script: core/ore.py
# Version: 1.1.0 (Performance Enhancement: Floor Scaling Lookup Tables)
# Description: Generates a distinct Block object containing the final calculated 
#              HP, Armor, XP, and Loot yields based on the floor tier scaling 
#              and the player's card multipliers.
#
# Enhancement 1.1: Pre-computed floor scaling multipliers (floors 1-300)
#              Eliminates repeated calculation overhead (~3-5% speedup)
# ==============================================================================

import sys
import os
import math

# --- BULLETPROOF PATHING ---
# 1. Add the 07_Modeling_and_Simulation directory to path
SIM_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if SIM_DIR not in sys.path:
    sys.path.append(SIM_DIR)

# 2. Add the Project Root directory to path (for project_config.py)
ROOT_DIR = os.path.abspath(os.path.join(SIM_DIR, '..'))
if ROOT_DIR not in sys.path:
    sys.path.append(ROOT_DIR)

import project_config as cfg

# ==============================================================================
# PERFORMANCE ENHANCEMENT 1.1: Floor Scaling Lookup Tables
# ==============================================================================
# Pre-compute HP and Armor multipliers for floors 1-300
# This eliminates 10 conditional checks per block instantiation
# Memory cost: ~2.4KB (300 floors × 2 floats × 4 bytes)
# ==============================================================================

def _precompute_floor_scalars():
    """
    Pre-calculate floor scaling multipliers for floors 1-300.
    Preserves exact game bugs (Floor 150 armor skip, Floor 300 double-trigger).
    """
    hp_scalars = {}
    armor_scalars = {}
    
    for floor in range(1, 301):
        hp_mult = 1.0
        armor_mult = 1.0
        
        # Apply true GameMaker sequential scaling rules
        # NOTE: Implements exact GM bugs: Armor skipped at 150, double-trigger at 300!
        if floor >= 100: hp_mult *= 2; armor_mult *= 1.5
        if floor >= 150: hp_mult *= 2  # BUG: Armor not scaled here
        if floor >= 200: hp_mult *= 2; armor_mult *= 1.5
        if floor >= 250: hp_mult *= 2; armor_mult *= 1.5
        if floor >= 300: hp_mult *= 2; armor_mult *= 1.5
        if floor >= 300: hp_mult *= 2; armor_mult *= 1.5  # BUG: Double-trigger at 300
        
        hp_scalars[floor] = hp_mult
        armor_scalars[floor] = armor_mult
    
    return hp_scalars, armor_scalars

# Initialize lookup tables at module load time (one-time cost)
_HP_SCALARS, _ARMOR_SCALARS = _precompute_floor_scalars()

# ==============================================================================

class Block:
    def __init__(self, block_id, current_floor, player, exp_mult_cache=None, frag_mult_cache=None):
        self.block_id = block_id
        self.current_floor = current_floor
        
        # Pull Base Stats from configuration
        base = cfg.BLOCK_BASE_STATS.get(block_id, None)
        if not base:
            raise ValueError(f"Block ID '{block_id}' not found in project_config.py!")

        # Pull Card Multipliers from the Player engine
        hp_mult, exp_mult, loot_mult = player.get_card_bonuses(block_id)

        # 1. Determine Floor Scaling for HP and Armor (OPTIMIZED)
        raw_hp = base['hp']
        base_armor = base['a']
        
        # Use pre-computed lookup table for floors 1-300, fallback to dynamic for 300+
        if current_floor <= 300:
            hp_scalar = _HP_SCALARS[current_floor]
            armor_scalar = _ARMOR_SCALARS[current_floor]
            raw_hp *= hp_scalar
            self.armor = base_armor * armor_scalar
        else:
            # Dynamic calculation for floors > 300 (rare edge case)
            self.armor = base_armor
            if current_floor >= 100: raw_hp *= 2; self.armor *= 1.5
            if current_floor >= 150: raw_hp *= 2
            if current_floor >= 200: raw_hp *= 2; self.armor *= 1.5
            if current_floor >= 250: raw_hp *= 2; self.armor *= 1.5
            if current_floor >= 300: raw_hp *= 2; self.armor *= 1.5
            if current_floor >= 300: raw_hp *= 2; self.armor *= 1.5
            if current_floor >= 350: raw_hp *= 2; self.armor *= 1.5
            if current_floor >= 400: raw_hp *= 2; self.armor *= 1.5
            if current_floor >= 450: raw_hp *= 2; self.armor *= 1.5
            if current_floor >= 500: raw_hp *= 2; self.armor *= 1.5

        # Apply Card HP Reduction (Standard game rounding is usually nearest integer)
        self.hp = round(raw_hp * hp_mult)

        # 2. Calculate XP Yield
        base_xp = base['xp']
        # PHASE 14: Use cached value if provided, otherwise fallback to property
        p_exp_mult = exp_mult_cache if exp_mult_cache is not None else player.exp_gain_mult
        
        # Note: 'exp_mult' from cards already includes the (1 + X%) logic.
        raw_exp = base_xp * p_exp_mult * exp_mult
        
        # Excel: FLOOR(..., 0.001)
        floored_exp = math.floor((raw_exp + 1e-9) * 1000) / 1000.0
        
        # Excel: IF(exp>100, ROUNDDOWN(exp, 0), exp)
        if floored_exp > 100.0:
            self.xp = math.floor(floored_exp + 1e-9)
        else:
            self.xp = floored_exp

        # 3. Calculate Fragment Yield
        base_frag = base['fa']
        # PHASE 14: Use cached value if provided, otherwise fallback to property
        p_frag_mult = frag_mult_cache if frag_mult_cache is not None else player.frag_loot_gain_mult
        self.frag_type = base['ft']
        
        raw_frag = base_frag * p_frag_mult * loot_mult
        
        # Excel: ROUND(..., 3)
        self.frag_amt = math.floor((raw_frag + 1e-9) * 1000 + 0.5) / 1000.0


# ==============================================================================
# QUICK VERIFICATION TEST
# ==============================================================================
if __name__ == "__main__":
    from player import Player
    
    p = Player()
    # Let's give the player a Level 3 (Polychrome) Card for rare1
    p.set_card_level('rare1', 3)
    p.asc2_unlocked = False

    # Test Floor 50 (Base stats)
    block_f50 = Block('rare1', 50, p)
    print(f"--- RARE1 (Poly Card) @ Floor 50 ---")
    print(f"HP: {block_f50.hp} | Armor: {block_f50.armor} | XP: {block_f50.xp:.3f} | Loot: {block_f50.frag_amt:.3f}")

    # Test Floor 101 (Scaled stats)
    block_f101 = Block('rare1', 101, p)
    print(f"\n--- RARE1 (Poly Card) @ Floor 101 ---")
    print(f"HP: {block_f101.hp} | Armor: {block_f101.armor} | XP: {block_f101.xp:.3f} | Loot: {block_f101.frag_amt:.3f}")