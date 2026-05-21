# ==============================================================================
# Script: core/skills.py
# Version: 1.1.0 (Phase 4 Optimization: Property Caching)
# Description: State-tracker for Enrage, Flurry, and Quake. Handles continuous 
#              cooldown timers, active duration timers, charge consumption, 
#              auto-casting, and the Ability Instacharge RNG loops.
#
# Phase 4 Enhancement: Accepts pre-cached skill properties to eliminate
#                     repeated @property lookups during skill activation cascades
# ==============================================================================

import random

class SkillManager:
    def __init__(self, player, skill_cache=None):
        """
        Initializes the skill trackers. 
        Takes the Player object and optional skill_cache dict with pre-computed values.
        
        skill_cache format (if provided):
        {
            'ability_insta': float,
            'enrage_charges': int,
            'enrage_cd': float,
            'flurry_duration': float,
            'flurry_cd': float,
            'flurry_sta_cast': float,
            'quake_attacks': int,
            'quake_cd': float,
            'auto_enrage': bool,
            'auto_flurry': bool,
            'auto_quake': bool
        }
        """
        self.player = player
        
        # Current State Timers & Counters
        self.enrage_cd = 0.0
        self.enrage_charges = 0
        
        self.flurry_cd = 0.0
        self.flurry_timer = 0.0
        
        self.quake_cd = 0.0
        self.quake_charges = 0
        
        # Lifetime stats (Useful for optimizers/analytics later)
        self.total_enrage_casts = 0
        self.total_flurry_casts = 0
        self.total_quake_casts = 0
        self.total_instacharges = 0
        
        # ======================================================================
        # PHASE 4 OPTIMIZATION: Cache skill properties to eliminate property lookups
        # ======================================================================
        if skill_cache:
            # Use pre-cached values (fast path for simulation hot loop)
            self.ability_insta_charge = skill_cache['ability_insta']
            self.enrage_charges_max = skill_cache['enrage_charges']
            self.enrage_cd_max = skill_cache['enrage_cd']
            self.flurry_duration_max = skill_cache['flurry_duration']
            self.flurry_cd_max = skill_cache['flurry_cd']
            self.flurry_sta_cast = skill_cache['flurry_sta_cast']
            self.quake_attacks_max = skill_cache['quake_attacks']
            self.quake_cd_max = skill_cache['quake_cd']
            self.auto_enrage_enabled = skill_cache['auto_enrage']
            self.auto_flurry_enabled = skill_cache['auto_flurry']
            self.auto_quake_enabled = skill_cache['auto_quake']
        else:
            # Fallback: Read from player properties (slow path for standalone testing)
            self.ability_insta_charge = player.ability_insta_charge
            self.enrage_charges_max = player.enrage_charges
            self.enrage_cd_max = player.enrage_cooldown
            self.flurry_duration_max = player.flurry_duration
            self.flurry_cd_max = player.flurry_cooldown
            self.flurry_sta_cast = player.flurry_sta_on_cast
            self.quake_attacks_max = player.quake_attacks
            self.quake_cd_max = player.quake_cooldown
            upg8 = player.upgrade_levels.get(8, 0)
            self.auto_enrage_enabled = upg8 >= 1
            self.auto_flurry_enabled = upg8 >= 2
            self.auto_quake_enabled = upg8 >= 3

    def tick(self, dt):
        """
        Advances time by 'dt' (delta time) seconds.
        Handles cooldowns, Flurry's duration, and Auto-Casting.
        Returns a dictionary of events (e.g., flat stamina restored by Flurry).
        """
        events = {"stamina_restored": 0.0}
        
        # 1. Advance all active timers
        if self.enrage_cd > 0: self.enrage_cd -= dt
        if self.flurry_cd > 0: self.flurry_cd -= dt
        if self.quake_cd > 0: self.quake_cd -= dt
        
        if self.flurry_timer > 0: 
            self.flurry_timer -= dt
            if self.flurry_timer < 0: 
                self.flurry_timer = 0.0

        # 2. Auto-Cast: Enrage (Uses cached flag instead of dict lookup)
        chain = 0
        if self.auto_enrage_enabled:
            while self.enrage_cd <= 0 and chain < 100:
                self.enrage_charges += self.enrage_charges_max
                self.enrage_cd = self.enrage_cd_max
                self.total_enrage_casts += 1
                
                # Roll for Ability Instacharge (Uses cached value)
                if random.random() < self.ability_insta_charge:
                    self.enrage_cd = 0.0
                    self.total_instacharges += 1
                    chain += 1
                else:
                    break

        # 3. Auto-Cast: Flurry (Uses cached flag instead of dict lookup)
        chain = 0
        if self.auto_flurry_enabled:
            while self.flurry_cd <= 0 and chain < 100:
                self.flurry_timer += self.flurry_duration_max
                self.flurry_cd = self.flurry_cd_max
                self.total_flurry_casts += 1
                
                # Flurry grants flat stamina on cast (Uses cached value)
                events["stamina_restored"] += self.flurry_sta_cast
                
                if random.random() < self.ability_insta_charge:
                    self.flurry_cd = 0.0
                    self.total_instacharges += 1
                    chain += 1
                else:
                    break

        # 4. Auto-Cast: Quake (Uses cached flag instead of dict lookup)
        chain = 0
        if self.auto_quake_enabled:
            while self.quake_cd <= 0 and chain < 100:
                self.quake_charges += self.quake_attacks_max
                self.quake_cd = self.quake_cd_max
                self.total_quake_casts += 1
                
                if random.random() < self.ability_insta_charge:
                    self.quake_cd = 0.0
                    self.total_instacharges += 1
                    chain += 1
                else:
                    break

        return events

    def consume_attack(self):
        """
        Called by the Combat Loop every time the player lands a hit.
        Decrements active skill charges.
        Returns True if a Quake AoE splash attack should trigger.
        """
        quake_triggered = False
        
        if self.enrage_charges > 0:
            self.enrage_charges -= 1
            
        if self.quake_charges > 0:
            self.quake_charges -= 1
            quake_triggered = True
            
        return quake_triggered

    # --------------------------------------------------------------------------
    # ACTIVE STATE PROPERTIES (Polled by the Combat Loop)
    # --------------------------------------------------------------------------
    @property
    def is_enrage_active(self):
        return self.enrage_charges > 0
        
    @property
    def is_flurry_active(self):
        return self.flurry_timer > 0

    @property
    def is_quake_active(self):
        return self.quake_charges > 0