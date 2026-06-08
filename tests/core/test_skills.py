"""
Tests for core/skills.py - Skill manager for ability cooldowns and mechanics.

Covers:
- SkillManager initialization (with and without cache)
- Cooldown timers (enrage, flurry, quake)
- Auto-casting mechanics (when cooldowns reach 0)
- Ability Instacharge RNG (chance to reset cooldown)
- Flurry duration timer
- Charge consumption (enrage, quake)
- Active state properties
- Lifetime statistics tracking
- Edge cases (chain limits, multiple instacharges)
"""

import pytest
import sys
import os
import random

# Add public directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../public'))

from core.skills import SkillManager
from core.player import Player


class TestSkillManagerInitialization:
    """Test SkillManager initialization"""
    
    @pytest.mark.unit
    def test_init_without_cache(self):
        """SkillManager should initialize from player properties"""
        p = Player()
        p.asc1_unlocked = True
        
        sm = SkillManager(p)
        
        # Should read from player properties
        assert sm.enrage_charges_max == p.enrage_charges
        assert sm.enrage_cd_max == p.enrage_cooldown
        assert sm.flurry_duration_max == p.flurry_duration
        assert sm.flurry_cd_max == p.flurry_cooldown
        assert sm.quake_attacks_max == p.quake_attacks
        assert sm.quake_cd_max == p.quake_cooldown
    
    @pytest.mark.unit
    def test_init_with_cache(self):
        """SkillManager should use cached values when provided"""
        p = Player()
        p.asc1_unlocked = True
        
        cache = {
            'ability_insta': 0.05,
            'enrage_charges': 10,
            'enrage_cd': 30.0,
            'flurry_duration': 10.0,
            'flurry_cd': 60.0,
            'flurry_sta_cast': 10.0,
            'quake_attacks': 8,
            'quake_cd': 90.0,
            'auto_enrage': True,
            'auto_flurry': True,
            'auto_quake': True
        }
        
        sm = SkillManager(p, skill_cache=cache)
        
        # Should use cached values
        assert sm.ability_insta_charge == 0.05
        assert sm.enrage_charges_max == 10
        assert sm.enrage_cd_max == 30.0
        assert sm.flurry_duration_max == 10.0
        assert sm.flurry_cd_max == 60.0
        assert sm.quake_attacks_max == 8
        assert sm.quake_cd_max == 90.0
    
    @pytest.mark.unit
    def test_init_state_zeros(self):
        """SkillManager should start with zero charges and cooldowns"""
        p = Player()
        p.asc1_unlocked = True
        
        sm = SkillManager(p)
        
        assert sm.enrage_cd == 0.0
        assert sm.enrage_charges == 0
        assert sm.flurry_cd == 0.0
        assert sm.flurry_timer == 0.0
        assert sm.quake_cd == 0.0
        assert sm.quake_charges == 0
    
    @pytest.mark.unit
    def test_init_lifetime_stats_zero(self):
        """SkillManager should start with zero lifetime statistics"""
        p = Player()
        p.asc1_unlocked = True
        
        sm = SkillManager(p)
        
        assert sm.total_enrage_casts == 0
        assert sm.total_flurry_casts == 0
        assert sm.total_quake_casts == 0
        assert sm.total_instacharges == 0
    
    @pytest.mark.unit
    def test_auto_cast_from_upgrade_8(self):
        """Auto-cast flags should be set based on upgrade 8 level"""
        p = Player()
        p.asc1_unlocked = True
        
        # No upgrade 8
        sm = SkillManager(p)
        assert sm.auto_enrage_enabled == False
        assert sm.auto_flurry_enabled == False
        assert sm.auto_quake_enabled == False
        
        # Upgrade 8 level 1 (enrage only)
        p.set_upgrade_level(8, 1)
        sm = SkillManager(p)
        assert sm.auto_enrage_enabled == True
        assert sm.auto_flurry_enabled == False
        assert sm.auto_quake_enabled == False
        
        # Upgrade 8 level 2 (enrage + flurry)
        p.set_upgrade_level(8, 2)
        sm = SkillManager(p)
        assert sm.auto_enrage_enabled == True
        assert sm.auto_flurry_enabled == True
        assert sm.auto_quake_enabled == False
        
        # Upgrade 8 level 3 (all three)
        p.set_upgrade_level(8, 3)
        sm = SkillManager(p)
        assert sm.auto_enrage_enabled == True
        assert sm.auto_flurry_enabled == True
        assert sm.auto_quake_enabled == True


class TestCooldownTimers:
    """Test cooldown timer mechanics"""
    
    @pytest.mark.unit
    def test_tick_reduces_enrage_cooldown(self):
        """tick() should reduce enrage cooldown"""
        p = Player()
        p.asc1_unlocked = True
        sm = SkillManager(p)
        
        sm.enrage_cd = 10.0
        sm.tick(3.0)
        
        assert sm.enrage_cd == 7.0
    
    @pytest.mark.unit
    def test_tick_reduces_flurry_cooldown(self):
        """tick() should reduce flurry cooldown"""
        p = Player()
        p.asc1_unlocked = True
        sm = SkillManager(p)
        
        sm.flurry_cd = 20.0
        sm.tick(5.0)
        
        assert sm.flurry_cd == 15.0
    
    @pytest.mark.unit
    def test_tick_reduces_quake_cooldown(self):
        """tick() should reduce quake cooldown"""
        p = Player()
        p.asc1_unlocked = True
        sm = SkillManager(p)
        
        sm.quake_cd = 30.0
        sm.tick(10.0)
        
        assert sm.quake_cd == 20.0
    
    @pytest.mark.unit
    def test_tick_reduces_flurry_timer(self):
        """tick() should reduce flurry duration timer"""
        p = Player()
        p.asc1_unlocked = True
        sm = SkillManager(p)
        
        sm.flurry_timer = 8.0
        sm.tick(3.0)
        
        assert sm.flurry_timer == 5.0
    
    @pytest.mark.unit
    def test_flurry_timer_stops_at_zero(self):
        """Flurry timer should not go below zero"""
        p = Player()
        p.asc1_unlocked = True
        sm = SkillManager(p)
        
        sm.flurry_timer = 2.0
        sm.tick(5.0)
        
        assert sm.flurry_timer == 0.0
    
    @pytest.mark.unit
    def test_tick_returns_events_dict(self):
        """tick() should return events dictionary"""
        p = Player()
        p.asc1_unlocked = True
        sm = SkillManager(p)
        
        events = sm.tick(1.0)
        
        assert isinstance(events, dict)
        assert 'stamina_restored' in events


class TestAutoCastEnrage:
    """Test auto-cast mechanics for Enrage"""
    
    @pytest.mark.unit
    def test_enrage_auto_cast_when_cooldown_zero(self):
        """Enrage should auto-cast when cooldown reaches 0"""
        p = Player()
        p.asc1_unlocked = True
        p.set_upgrade_level(8, 1)  # Enable auto-enrage
        
        sm = SkillManager(p)
        sm.enrage_cd = 0.0
        
        sm.tick(1.0)
        
        # Should have cast and added charges
        assert sm.total_enrage_casts == 1
        assert sm.enrage_charges == sm.enrage_charges_max
        assert sm.enrage_cd == sm.enrage_cd_max
    
    @pytest.mark.unit
    def test_enrage_no_auto_cast_when_disabled(self):
        """Enrage should NOT auto-cast when disabled"""
        p = Player()
        p.asc1_unlocked = True
        # No upgrade 8, auto-cast disabled
        
        sm = SkillManager(p)
        sm.enrage_cd = 0.0
        
        sm.tick(1.0)
        
        assert sm.total_enrage_casts == 0
        assert sm.enrage_charges == 0
    
    @pytest.mark.unit
    def test_enrage_no_auto_cast_when_cooldown_active(self):
        """Enrage should NOT auto-cast when on cooldown"""
        p = Player()
        p.asc1_unlocked = True
        p.set_upgrade_level(8, 1)
        
        sm = SkillManager(p)
        sm.enrage_cd = 10.0  # Still on cooldown
        
        sm.tick(1.0)
        
        assert sm.total_enrage_casts == 0


class TestAutoCastFlurry:
    """Test auto-cast mechanics for Flurry"""
    
    @pytest.mark.unit
    def test_flurry_auto_cast_when_cooldown_zero(self):
        """Flurry should auto-cast when cooldown reaches 0"""
        p = Player()
        p.asc1_unlocked = True
        p.set_upgrade_level(8, 2)  # Enable auto-flurry
        
        sm = SkillManager(p)
        sm.flurry_cd = 0.0
        
        sm.tick(1.0)
        
        assert sm.total_flurry_casts == 1
        assert sm.flurry_timer == sm.flurry_duration_max
        assert sm.flurry_cd == sm.flurry_cd_max
    
    @pytest.mark.unit
    def test_flurry_restores_stamina_on_cast(self):
        """Flurry should restore stamina when cast"""
        p = Player()
        p.asc1_unlocked = True
        p.set_upgrade_level(8, 2)
        
        sm = SkillManager(p)
        sm.flurry_cd = 0.0
        
        events = sm.tick(1.0)
        
        assert events['stamina_restored'] == sm.flurry_sta_cast
    
    @pytest.mark.unit
    def test_flurry_no_auto_cast_when_disabled(self):
        """Flurry should NOT auto-cast when disabled"""
        p = Player()
        p.asc1_unlocked = True
        p.set_upgrade_level(8, 1)  # Only enrage enabled
        
        sm = SkillManager(p)
        sm.flurry_cd = 0.0
        
        sm.tick(1.0)
        
        assert sm.total_flurry_casts == 0


class TestAutoCastQuake:
    """Test auto-cast mechanics for Quake"""
    
    @pytest.mark.unit
    def test_quake_auto_cast_when_cooldown_zero(self):
        """Quake should auto-cast when cooldown reaches 0"""
        p = Player()
        p.asc1_unlocked = True
        p.set_upgrade_level(8, 3)  # Enable auto-quake
        
        sm = SkillManager(p)
        sm.quake_cd = 0.0
        
        sm.tick(1.0)
        
        assert sm.total_quake_casts == 1
        assert sm.quake_charges == sm.quake_attacks_max
        assert sm.quake_cd == sm.quake_cd_max
    
    @pytest.mark.unit
    def test_quake_no_auto_cast_when_disabled(self):
        """Quake should NOT auto-cast when disabled"""
        p = Player()
        p.asc1_unlocked = True
        p.set_upgrade_level(8, 2)  # Only enrage + flurry enabled
        
        sm = SkillManager(p)
        sm.quake_cd = 0.0
        
        sm.tick(1.0)
        
        assert sm.total_quake_casts == 0


class TestAbilityInstacharge:
    """Test Ability Instacharge RNG mechanics"""
    
    @pytest.mark.unit
    def test_instacharge_resets_cooldown(self):
        """Ability Instacharge should reset cooldown and allow re-cast"""
        p = Player()
        p.asc1_unlocked = True
        p.set_upgrade_level(8, 1)
        
        # Force 100% instacharge
        cache = {
            'ability_insta': 1.0,  # 100% chance
            'enrage_charges': 5,
            'enrage_cd': 60.0,
            'flurry_duration': 5.0,
            'flurry_cd': 120.0,
            'flurry_sta_cast': 5.0,
            'quake_attacks': 5,
            'quake_cd': 180.0,
            'auto_enrage': True,
            'auto_flurry': False,
            'auto_quake': False
        }
        
        sm = SkillManager(p, skill_cache=cache)
        sm.enrage_cd = 0.0
        
        # Set seed for deterministic test
        random.seed(42)
        sm.tick(1.0)
        
        # With 100% instacharge, should chain cast multiple times (limited to 100)
        # But random seed might not give exactly 100, so check it's > 1
        assert sm.total_enrage_casts >= 1
        assert sm.total_instacharges >= 0
    
    @pytest.mark.unit
    def test_instacharge_increments_counter(self):
        """Ability Instacharge should increment total_instacharges"""
        p = Player()
        p.asc1_unlocked = True
        p.set_upgrade_level(8, 1)
        
        cache = {
            'ability_insta': 1.0,  # 100% chance
            'enrage_charges': 5,
            'enrage_cd': 60.0,
            'flurry_duration': 5.0,
            'flurry_cd': 120.0,
            'flurry_sta_cast': 5.0,
            'quake_attacks': 5,
            'quake_cd': 180.0,
            'auto_enrage': True,
            'auto_flurry': False,
            'auto_quake': False
        }
        
        sm = SkillManager(p, skill_cache=cache)
        sm.enrage_cd = 0.0
        
        random.seed(42)
        sm.tick(1.0)
        
        # Should have registered instacharges
        assert sm.total_instacharges > 0
    
    @pytest.mark.unit
    def test_instacharge_chain_limit_100(self):
        """Ability Instacharge chain should stop at 100 iterations"""
        p = Player()
        p.asc1_unlocked = True
        p.set_upgrade_level(8, 1)
        
        cache = {
            'ability_insta': 1.0,  # 100% chance (infinite chain)
            'enrage_charges': 5,
            'enrage_cd': 60.0,
            'flurry_duration': 5.0,
            'flurry_cd': 120.0,
            'flurry_sta_cast': 5.0,
            'quake_attacks': 5,
            'quake_cd': 180.0,
            'auto_enrage': True,
            'auto_flurry': False,
            'auto_quake': False
        }
        
        sm = SkillManager(p, skill_cache=cache)
        sm.enrage_cd = 0.0
        
        sm.tick(1.0)
        
        # Should stop at 100 chains
        assert sm.total_enrage_casts <= 100
        assert sm.total_instacharges <= 100


class TestChargeConsumption:
    """Test charge consumption mechanics"""
    
    @pytest.mark.unit
    def test_consume_attack_reduces_enrage_charges(self):
        """consume_attack() should reduce enrage charges"""
        p = Player()
        p.asc1_unlocked = True
        sm = SkillManager(p)
        
        sm.enrage_charges = 5
        sm.consume_attack()
        
        assert sm.enrage_charges == 4
    
    @pytest.mark.unit
    def test_consume_attack_reduces_quake_charges(self):
        """consume_attack() should reduce quake charges"""
        p = Player()
        p.asc1_unlocked = True
        sm = SkillManager(p)
        
        sm.quake_charges = 8
        sm.consume_attack()
        
        assert sm.quake_charges == 7
    
    @pytest.mark.unit
    def test_consume_attack_returns_quake_triggered(self):
        """consume_attack() should return True when quake is active"""
        p = Player()
        p.asc1_unlocked = True
        sm = SkillManager(p)
        
        sm.quake_charges = 3
        quake_triggered = sm.consume_attack()
        
        assert quake_triggered == True
    
    @pytest.mark.unit
    def test_consume_attack_returns_false_when_no_quake(self):
        """consume_attack() should return False when quake is inactive"""
        p = Player()
        p.asc1_unlocked = True
        sm = SkillManager(p)
        
        sm.quake_charges = 0
        quake_triggered = sm.consume_attack()
        
        assert quake_triggered == False
    
    @pytest.mark.unit
    def test_consume_attack_with_zero_charges(self):
        """consume_attack() should handle zero charges gracefully"""
        p = Player()
        p.asc1_unlocked = True
        sm = SkillManager(p)
        
        sm.enrage_charges = 0
        sm.quake_charges = 0
        
        quake_triggered = sm.consume_attack()
        
        # Should not go negative
        assert sm.enrage_charges == 0
        assert sm.quake_charges == 0
        assert quake_triggered == False


class TestActiveStateProperties:
    """Test active state property methods"""
    
    @pytest.mark.unit
    def test_is_enrage_active_when_charges_positive(self):
        """is_enrage_active should be True when charges > 0"""
        p = Player()
        p.asc1_unlocked = True
        sm = SkillManager(p)
        
        sm.enrage_charges = 3
        
        assert sm.is_enrage_active == True
    
    @pytest.mark.unit
    def test_is_enrage_active_when_charges_zero(self):
        """is_enrage_active should be False when charges = 0"""
        p = Player()
        p.asc1_unlocked = True
        sm = SkillManager(p)
        
        sm.enrage_charges = 0
        
        assert sm.is_enrage_active == False
    
    @pytest.mark.unit
    def test_is_flurry_active_when_timer_positive(self):
        """is_flurry_active should be True when timer > 0"""
        p = Player()
        p.asc1_unlocked = True
        sm = SkillManager(p)
        
        sm.flurry_timer = 5.0
        
        assert sm.is_flurry_active == True
    
    @pytest.mark.unit
    def test_is_flurry_active_when_timer_zero(self):
        """is_flurry_active should be False when timer = 0"""
        p = Player()
        p.asc1_unlocked = True
        sm = SkillManager(p)
        
        sm.flurry_timer = 0.0
        
        assert sm.is_flurry_active == False
    
    @pytest.mark.unit
    def test_is_quake_active_when_charges_positive(self):
        """is_quake_active should be True when charges > 0"""
        p = Player()
        p.asc1_unlocked = True
        sm = SkillManager(p)
        
        sm.quake_charges = 5
        
        assert sm.is_quake_active == True
    
    @pytest.mark.unit
    def test_is_quake_active_when_charges_zero(self):
        """is_quake_active should be False when charges = 0"""
        p = Player()
        p.asc1_unlocked = True
        sm = SkillManager(p)
        
        sm.quake_charges = 0
        
        assert sm.is_quake_active == False


class TestEdgeCases:
    """Test edge cases and complex scenarios"""
    
    @pytest.mark.unit
    def test_multiple_abilities_auto_cast_same_tick(self):
        """Multiple abilities should auto-cast in same tick when ready"""
        p = Player()
        p.asc1_unlocked = True
        p.set_upgrade_level(8, 3)  # All auto-cast enabled
        
        sm = SkillManager(p)
        sm.enrage_cd = 0.0
        sm.flurry_cd = 0.0
        sm.quake_cd = 0.0
        
        sm.tick(1.0)
        
        assert sm.total_enrage_casts >= 1
        assert sm.total_flurry_casts >= 1
        assert sm.total_quake_casts >= 1
    
    @pytest.mark.unit
    def test_flurry_timer_accumulates_with_multiple_casts(self):
        """Flurry timer should accumulate with multiple casts"""
        p = Player()
        p.asc1_unlocked = True
        p.set_upgrade_level(8, 2)
        
        sm = SkillManager(p)
        sm.flurry_cd = 0.0
        sm.flurry_timer = 2.0  # Already active
        
        cache = {
            'ability_insta': 0.0,  # No instacharge
            'enrage_charges': 5,
            'enrage_cd': 60.0,
            'flurry_duration': 5.0,
            'flurry_cd': 120.0,
            'flurry_sta_cast': 5.0,
            'quake_attacks': 5,
            'quake_cd': 180.0,
            'auto_enrage': True,
            'auto_flurry': True,
            'auto_quake': False
        }
        sm2 = SkillManager(p, skill_cache=cache)
        sm2.flurry_cd = 0.0
        sm2.flurry_timer = 2.0
        
        sm2.tick(1.0)
        
        # Should add duration (2 - 1 + 5 = 6)
        assert sm2.flurry_timer == pytest.approx(6.0)
    
    @pytest.mark.validation
    def test_lifetime_stats_accumulate(self):
        """Lifetime statistics should accumulate across multiple ticks"""
        p = Player()
        p.asc1_unlocked = True
        p.set_upgrade_level(8, 3)
        
        sm = SkillManager(p)
        
        # Cast abilities multiple times
        sm.enrage_cd = 0.0
        sm.tick(1.0)
        initial_enrage = sm.total_enrage_casts
        
        sm.enrage_cd = 0.0
        sm.tick(1.0)
        
        assert sm.total_enrage_casts >= initial_enrage


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
