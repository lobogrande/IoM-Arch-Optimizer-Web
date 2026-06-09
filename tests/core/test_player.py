"""
Tests for core/player.py - Player stat calculations and upgrade management.

Covers:
- Upgrade level setting with cap enforcement
- Gem upgrade caps (arch_level + 4)
- External upgrade calculations
- Card bonus calculations (HP, XP, Loot multipliers)
- Infernal multiplier and card bonus caching
- Stat formulas (damage, crit, armor pen, etc.)
- Ascension unlock gating
- GameMaker rounding behavior
"""

import pytest
import sys
import os

# Add public directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../public'))

from core.player import Player, INTERNAL_UPGRADE_CAPS


class TestPlayerInitialization:
    """Test Player object initialization"""
    
    @pytest.mark.unit
    def test_default_initialization(self):
        """Player should initialize with default values"""
        p = Player()
        assert p.arch_level == 1
        assert p.asc1_unlocked == False
        assert p.asc2_unlocked == False
        assert p.current_max_floor == 100
        assert p.base_damage_const == 10
        assert len(p.base_stats) == 7
        assert all(p.base_stats[stat] == 0 for stat in ['Str', 'Agi', 'Per', 'Int', 'Luck', 'Div', 'Corr'])
    
    @pytest.mark.unit
    def test_upgrade_levels_initialized(self):
        """All upgrade levels should be initialized to 0"""
        p = Player()
        assert len(p.upgrade_levels) == len(Player.UPGRADE_DEF)
        assert all(lvl == 0 for lvl in p.upgrade_levels.values())
    
    @pytest.mark.unit
    def test_external_levels_initialized(self):
        """All external upgrade levels should be initialized to 0"""
        p = Player()
        assert len(p.external_levels) == len(Player.EXTERNAL_DEF)
        assert all(lvl == 0 for lvl in p.external_levels.values())
    
    @pytest.mark.unit
    def test_cards_initialized(self):
        """All card levels should be initialized to 0"""
        p = Player()
        # 7 ore types × 4 tiers = 28 cards
        assert len(p.cards) == 28
        assert all(lvl == 0 for lvl in p.cards.values())


class TestUpgradeCaps:
    """Test upgrade level cap enforcement"""
    
    @pytest.mark.critical
    @pytest.mark.validation
    def test_upgrade_cap_enforcement(self):
        """Upgrade levels should be clamped to INTERNAL_UPGRADE_CAPS"""
        p = Player()
        
        # Upgrade 3 has cap of 50
        p.set_upgrade_level(3, 100)
        assert p.upgrade_levels[3] <= 50
        
        # Upgrade 12 has cap of 5
        p.set_upgrade_level(12, 25)
        assert p.upgrade_levels[12] == 5
    
    @pytest.mark.critical
    @pytest.mark.validation
    def test_gem_upgrade_dynamic_caps(self):
        """Gem upgrades (3, 4, 5) should be capped at arch_level + 4"""
        p = Player()
        p.arch_level = 10
        
        # At arch_level 10, gem cap should be 14
        p.set_upgrade_level(3, 50)
        assert p.upgrade_levels[3] == 14  # min(50, 10+4)
        
        p.set_upgrade_level(4, 30)
        assert p.upgrade_levels[4] == 14  # min(25, 10+4)
        
        p.set_upgrade_level(5, 30)
        assert p.upgrade_levels[5] == 14  # min(25, 10+4)
    
    @pytest.mark.validation
    def test_gem_upgrade_respects_internal_cap(self):
        """Gem upgrades should never exceed INTERNAL_UPGRADE_CAPS"""
        p = Player()
        p.arch_level = 100  # Very high arch level
        
        # Even with arch_level 100, gem upgrades still capped at their internal max
        p.set_upgrade_level(3, 200)
        assert p.upgrade_levels[3] == 50  # min(50, 104) = 50
        
        p.set_upgrade_level(4, 200)
        assert p.upgrade_levels[4] == 25  # min(25, 104) = 25
    
    @pytest.mark.validation
    def test_negative_upgrade_level_clamped(self):
        """Negative upgrade levels should be clamped to 0"""
        p = Player()
        p.set_upgrade_level(10, -5)
        assert p.upgrade_levels[10] == 0
    
    @pytest.mark.validation
    def test_zero_upgrade_level_allowed(self):
        """Zero upgrade levels should be valid"""
        p = Player()
        p.set_upgrade_level(15, 10)
        p.set_upgrade_level(15, 0)
        assert p.upgrade_levels[15] == 0


class TestCardBonuses:
    """Test card level and bonus calculations"""
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_card_level_0_no_bonus(self):
        """Level 0 cards should give 1.0x multipliers (no bonus)"""
        p = Player()
        p.asc1_unlocked = True
        p.set_card_level('dirt1', 0)
        
        hp_mult, exp_mult, loot_mult = p.get_card_bonuses('dirt1')
        assert hp_mult == 1.0
        assert exp_mult == 1.0
        assert loot_mult == 1.0
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_card_level_1_bonuses(self):
        """Level 1 cards should give 0.9 HP, 1.1 XP/Loot"""
        p = Player()
        p.asc1_unlocked = True
        p.set_card_level('com2', 1)
        
        hp_mult, exp_mult, loot_mult = p.get_card_bonuses('com2')
        assert hp_mult == 0.90
        assert exp_mult == 1.10
        assert loot_mult == 1.10
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_card_level_2_bonuses(self):
        """Level 2 cards should give 0.8 HP, 1.2 XP/Loot"""
        p = Player()
        p.asc1_unlocked = True
        p.set_card_level('rare3', 2)
        
        hp_mult, exp_mult, loot_mult = p.get_card_bonuses('rare3')
        assert hp_mult == 0.80
        assert exp_mult == 1.20
        assert loot_mult == 1.20
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_card_level_3_polymorph_bonus(self):
        """Level 3 cards should use polymorph formula (0.35 + F41)"""
        p = Player()
        p.asc1_unlocked = True
        p.set_upgrade_level(41, 0)  # F41 = 0
        p.set_card_level('epic1', 3)
        
        hp_mult, exp_mult, loot_mult = p.get_card_bonuses('epic1')
        poly_bonus = 0.35  # 0.35 + 0.0
        assert hp_mult == 1.0 - poly_bonus  # 0.65
        assert exp_mult == 1.0 + poly_bonus  # 1.35
        assert loot_mult == 1.0 + poly_bonus  # 1.35
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_card_level_3_with_upgrade_41(self):
        """Level 3 cards with upgrade 41 should have higher polymorph bonus"""
        p = Player()
        p.asc1_unlocked = True
        p.set_upgrade_level(41, 1)  # F41 = 0.15
        p.set_card_level('leg2', 3)
        
        hp_mult, exp_mult, loot_mult = p.get_card_bonuses('leg2')
        poly_bonus = 0.35 + 0.15  # = 0.50
        assert hp_mult == pytest.approx(0.50)
        assert exp_mult == pytest.approx(1.50)
        assert loot_mult == pytest.approx(1.50)
    
    @pytest.mark.validation
    def test_tier4_cards_require_asc2(self):
        """Tier 4 cards should give no bonus without Asc2"""
        p = Player()
        p.asc1_unlocked = True
        p.asc2_unlocked = False
        p.set_card_level('myth4', 3)
        
        hp_mult, exp_mult, loot_mult = p.get_card_bonuses('myth4')
        assert hp_mult == 1.0
        assert exp_mult == 1.0
        assert loot_mult == 1.0


class TestInfernalMultiplier:
    """Test infernal card mechanics and multiplier calculations"""
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_infernal_multiplier_without_asc1(self):
        """Infernal multiplier should be 1.0 without Asc1"""
        p = Player()
        p.asc1_unlocked = False
        assert p.infernal_multiplier == 1.0
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_infernal_multiplier_with_asc1_no_cards(self):
        """Infernal multiplier should be 1.0 with Asc1 but no infernal cards"""
        p = Player()
        p.asc1_unlocked = True
        assert p.infernal_multiplier == 1.0
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_arch_infernal_cards_count(self):
        """arch_infernal_cards should count level 4 cards"""
        p = Player()
        p.asc1_unlocked = True
        p.set_card_level('dirt1', 4)
        p.set_card_level('com2', 4)
        p.set_card_level('rare3', 3)  # Not level 4
        
        assert p.arch_infernal_cards == 2
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_infernal_multiplier_with_arch_cards(self):
        """Infernal multiplier should apply 4% per arch infernal card"""
        p = Player()
        p.asc1_unlocked = True
        p.set_card_level('dirt1', 4)
        p.set_card_level('com1', 4)
        
        # 1.0 + (0.04 * 2) = 1.08
        assert p.infernal_multiplier == pytest.approx(1.08)
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_infernal_multiplier_with_total_cards(self):
        """Infernal multiplier should apply 0.2% per total infernal card"""
        p = Player()
        p.asc1_unlocked = True
        p.total_infernal_cards = 10
        
        # 1.0 + (0.002 * 10) = 1.02
        assert p.infernal_multiplier == pytest.approx(1.02)
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_infernal_multiplier_with_hades_idol(self):
        """Infernal multiplier should apply Hades idol bonus (0.0045% per level)"""
        p = Player()
        p.asc1_unlocked = True
        p.set_external_level(21, 1000)  # Hades idol level 1000
        
        hades_bonus = 1000 * 0.000045  # = 0.045
        expected = 1.0 * (1.0 + hades_bonus)  # 1.045
        assert p.infernal_multiplier == pytest.approx(expected)
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_infernal_multiplier_combined(self):
        """Infernal multiplier should combine all bonuses correctly"""
        p = Player()
        p.asc1_unlocked = True
        p.set_card_level('dirt1', 4)  # 1 arch infernal
        p.total_infernal_cards = 5
        p.set_external_level(21, 100)  # Hades level 100
        
        arch_bonus = 1.0 + (0.04 * 1) + (0.002 * 5)  # 1.05
        hades_bonus = 1.0 + (100 * 0.000045)  # 1.0045
        expected = arch_bonus * hades_bonus  # 1.054725
        assert p.infernal_multiplier == pytest.approx(expected, abs=1e-6)


class TestInfernalCaching:
    """Test infernal bonus caching system"""
    
    @pytest.mark.unit
    def test_cache_not_initialized_by_default(self):
        """Infernal cache should be None until explicitly cached"""
        p = Player()
        assert p._infernal_cache is None
    
    @pytest.mark.unit
    def test_cache_all_zeros_without_asc1(self):
        """Infernal cache should be all zeros without Asc1"""
        p = Player()
        p.asc1_unlocked = False
        p._cache_infernal_bonuses()
        
        assert len(p._infernal_cache) == 28
        assert all(bonus == 0.0 for bonus in p._infernal_cache.values())
    
    @pytest.mark.unit
    def test_cache_zero_for_non_level4_cards(self):
        """Infernal cache should be 0 for cards not at level 4"""
        p = Player()
        p.asc1_unlocked = True
        p.set_card_level('dirt1', 3)  # Not level 4
        p._cache_infernal_bonuses()
        
        assert p._infernal_cache['dirt1'] == 0.0
    
    @pytest.mark.unit
    def test_cache_applies_multiplier_for_level4_cards(self):
        """Infernal cache should apply multiplier for level 4 cards"""
        p = Player()
        p.asc1_unlocked = True
        p.set_card_level('dirt1', 4)
        p.total_infernal_cards = 0
        p._cache_infernal_bonuses()
        
        # dirt1 base = 0.1, mult = 1.0 + 0.04 = 1.04
        expected = 0.1 * 1.04
        assert p._infernal_cache['dirt1'] == pytest.approx(expected)
    
    @pytest.mark.unit
    def test_cache_respects_asc2_for_tier4(self):
        """Infernal cache should be 0 for tier 4 blocks without Asc2"""
        p = Player()
        p.asc1_unlocked = True
        p.asc2_unlocked = False
        p.set_card_level('dirt4', 4)
        p._cache_infernal_bonuses()
        
        assert p._infernal_cache['dirt4'] == 0.0
    
    @pytest.mark.unit
    def test_inf_method_uses_cache(self):
        """inf() method should use cached values when available"""
        p = Player()
        p.asc1_unlocked = True
        p.set_card_level('com2', 4)
        p._cache_infernal_bonuses()
        
        cached_value = p._infernal_cache['com2']
        assert p.inf('com2') == cached_value


class TestGameMakerRounding:
    """Test GameMaker-specific rounding behavior"""
    
    @pytest.mark.unit
    def test_gm_int_drift_0_rounds_half_up(self):
        """GameMaker round: 0.5 should round up (not banker's rounding)"""
        p = Player()
        assert p._gm_int(2.5, drift=0) == 3.0
        assert p._gm_int(3.5, drift=0) == 4.0
        assert p._gm_int(2.4, drift=0) == 2.0
    
    @pytest.mark.unit
    def test_gm_int_drift_1_ceiling(self):
        """GameMaker round with drift=1 should ceiling"""
        p = Player()
        assert p._gm_int(2.1, drift=1) == 3.0
        assert p._gm_int(2.9, drift=1) == 3.0
        assert p._gm_int(2.0, drift=1) == 2.0
    
    @pytest.mark.unit
    def test_gm_int_drift_negative1_floor(self):
        """GameMaker round with drift=-1 should floor"""
        p = Player()
        assert p._gm_int(2.1, drift=-1) == 2.0
        assert p._gm_int(2.9, drift=-1) == 2.0
        assert p._gm_int(3.0, drift=-1) == 3.0
    
    @pytest.mark.unit
    def test_gm_mult_bankers_rounding(self):
        """_gm_mult should use Python's round() for UI display"""
        p = Player()
        # Python 3's round() uses banker's rounding (round half to even)
        # But floating point representation can cause unexpected results
        assert p._gm_mult(2.5, 0) == 2.0  # Banker's: round to even
        assert p._gm_mult(3.5, 0) == 4.0  # Banker's: round to even
        assert p._gm_mult(2.75, 1) == 2.8  # Normal rounding


class TestAscensionGating:
    """Test upgrade gating behind Asc1/Asc2 unlocks"""
    
    @pytest.mark.critical
    @pytest.mark.validation
    def test_upgrade_u_locks_asc1_upgrades(self):
        """u() should return 0 for Asc1-locked upgrades"""
        p = Player()
        p.asc1_unlocked = False
        p.set_upgrade_level(12, 5)  # Asc1-locked
        
        assert p.u('F12') == 0.0
    
    @pytest.mark.critical
    @pytest.mark.validation
    def test_upgrade_u_allows_asc1_upgrades_when_unlocked(self):
        """u() should return values for Asc1 upgrades when unlocked"""
        p = Player()
        p.asc1_unlocked = True
        p.set_upgrade_level(12, 5)
        
        assert p.u('F12') > 0.0
    
    @pytest.mark.critical
    @pytest.mark.validation
    def test_upgrade_u_locks_asc2_upgrades(self):
        """u() should return 0 for Asc2-locked upgrades"""
        p = Player()
        p.asc1_unlocked = True
        p.asc2_unlocked = False
        p.set_upgrade_level(19, 10)  # Asc2-locked
        
        assert p.u('F19') == 0.0
    
    @pytest.mark.validation
    def test_external_w_locks_asc1_externals(self):
        """w() should return 0 for Asc1-locked external upgrades"""
        p = Player()
        p.asc1_unlocked = False
        p.set_external_level(4, 100)  # Hestia idol
        
        assert p.w('W4') == 0.0
    
    @pytest.mark.validation
    def test_stat_locks_div_without_asc1(self):
        """stat() should return 0 for Div without Asc1"""
        p = Player()
        p.asc1_unlocked = False
        p.base_stats['Div'] = 50
        
        assert p.stat('Div') == 0.0
    
    @pytest.mark.validation
    def test_stat_locks_corr_without_asc2(self):
        """stat() should return 0 for Corr without Asc2"""
        p = Player()
        p.asc1_unlocked = True
        p.asc2_unlocked = False
        p.base_stats['Corr'] = 30
        
        assert p.stat('Corr') == 0.0


class TestExternalUpgrades:
    """Test external upgrade (Hestia, Geoduck, etc.) calculations"""
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_hestia_idol_w4(self):
        """Hestia idol (W4) should be lvl * 0.0001"""
        p = Player()
        p.asc1_unlocked = True
        p.set_external_level(4, 100)
        
        assert p.w('W4') == pytest.approx(0.01)  # 100 * 0.0001
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_axolotl_skin_w5(self):
        """Axolotl skin (W5) should be (1 + lvl) * 0.03"""
        p = Player()
        p.set_external_level(5, 5)
        
        assert p.w('W5') == pytest.approx(0.18)  # (1 + 5) * 0.03
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_geoduck_capped_asc1(self):
        """Geoduck (W8) should be capped at 0.50 without Asc2"""
        p = Player()
        p.asc1_unlocked = True
        p.asc2_unlocked = False
        p.set_external_level(8, 1000)  # Very high level
        
        assert p.w('W8') <= 0.50
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_geoduck_capped_asc2(self):
        """Geoduck (W8) should be capped at 0.75 with Asc2"""
        p = Player()
        p.asc1_unlocked = True
        p.asc2_unlocked = True
        p.set_external_level(8, 1000)  # Very high level
        
        assert p.w('W8') <= 0.75
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_arch_ability_card_w20_levels(self):
        """Arch ability card (W20) should have specific values per level"""
        p = Player()
        
        p.set_external_level(20, 0)
        assert p.w('W20') == 0.0
        
        p.set_external_level(20, 1)
        assert p.w('W20') == -0.03
        
        p.set_external_level(20, 2)
        assert p.w('W20') == -0.06
        
        p.set_external_level(20, 3)
        assert p.w('W20') == -0.10
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_archaeology_bundle_w15_minimum(self):
        """Archaeology bundle (W15) should have minimum of 1.0"""
        p = Player()
        p.set_external_level(15, 0)
        
        assert p.w('W15') == 1.0  # max(1.0, 0 * 1.25)


class TestCombatStats:
    """Test combat stat calculations (damage, max_sta, armor_pen)"""
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_max_sta_base_calculation(self):
        """Test max stamina with base upgrades only"""
        p = Player()
        p.asc1_unlocked = True
        
        # Base: 100 + upgrades
        base_max_sta = p.max_sta
        assert base_max_sta == 100.0  # No upgrades yet
        
        # Add F14 upgrade (Gem Stamina)
        p.set_upgrade_level(14, 10)  # +20 sta
        assert p.max_sta == pytest.approx(120.0)
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_max_sta_with_agility(self):
        """Test max stamina scales with Agility stat"""
        p = Player()
        p.asc1_unlocked = True
        p.base_stats['Agi'] = 10
        
        # 100 + (10 * 5) = 150
        assert p.max_sta == pytest.approx(150.0)
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_damage_base_calculation(self):
        """Test base damage with no upgrades"""
        p = Player()
        p.asc1_unlocked = True
        
        # base_damage_const = 10, no upgrades
        damage = p.damage
        assert damage == pytest.approx(10.0)
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_damage_with_strength(self):
        """Test damage scales with Strength stat"""
        p = Player()
        p.asc1_unlocked = True
        p.base_stats['Str'] = 10
        
        # base_calc: 0
        # stat_calc1: 10 * (1 + 0) = 10
        # stat_calc2: 0
        # base_damage_const: 10
        # mult1: 1 + 0 + 0 + (10 * 0.01) + 0 = 1.1
        # mult2: 0.06 * 0 = 0
        # bb_mult: 1.0
        # (0 + 10 + 0 + 10) * (1.1 + 0) * 1.0 = 22
        assert p.damage == pytest.approx(22.0)
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_damage_with_flat_upgrades(self):
        """Test damage with flat damage upgrades"""
        p = Player()
        p.asc1_unlocked = True
        p.set_upgrade_level(9, 25)   # F9 = 25 flat damage
        p.set_upgrade_level(15, 20)  # F15 = 40 flat damage (20 * 2.0)
        
        # 10 + 25 + 40 = 75
        assert p.damage == pytest.approx(75.0)
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_armor_pen_base(self):
        """Test armor penetration with no upgrades"""
        p = Player()
        p.asc1_unlocked = True
        
        assert p.armor_pen == pytest.approx(0.0)
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_armor_pen_with_perception(self):
        """Test armor pen scales with Perception stat"""
        p = Player()
        p.asc1_unlocked = True
        p.base_stats['Per'] = 10
        
        # 10 * 2 = 20
        assert p.armor_pen == pytest.approx(20.0)


class TestCritSystem:
    """Test critical hit system calculations"""
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_crit_chance_base(self):
        """Test base crit chance with no upgrades"""
        p = Player()
        p.asc1_unlocked = True
        
        assert p.crit_chance == pytest.approx(0.0)
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_crit_chance_with_upgrade(self):
        """Test crit chance with upgrade 13"""
        p = Player()
        p.asc1_unlocked = True
        p.set_upgrade_level(13, 10)  # F13 = 0.025
        
        assert p.crit_chance == pytest.approx(0.025)
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_crit_chance_with_luck(self):
        """Test crit chance scales with Luck stat"""
        p = Player()
        p.asc1_unlocked = True
        p.base_stats['Luck'] = 10
        
        # 0.02 * 10 = 0.2
        assert p.crit_chance == pytest.approx(0.2)
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_crit_dmg_mult_base(self):
        """Test base crit damage multiplier"""
        p = Player()
        p.asc1_unlocked = True
        
        # 1.5 * 1.0 = 1.5
        assert p.crit_dmg_mult == pytest.approx(1.5)
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_super_crit_chance_base(self):
        """Test super crit chance with no upgrades"""
        p = Player()
        p.asc1_unlocked = True
        
        assert p.super_crit_chance == pytest.approx(0.0)
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_super_crit_dmg_mult_when_zero_chance(self):
        """Test super crit damage is 0 when chance is 0"""
        p = Player()
        p.asc1_unlocked = True
        
        assert p.super_crit_dmg_mult == pytest.approx(0.0)
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_ultra_crit_chance_base(self):
        """Test ultra crit chance with no upgrades"""
        p = Player()
        p.asc1_unlocked = True
        
        assert p.ultra_crit_chance == pytest.approx(0.0)
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_ultra_crit_dmg_mult_when_zero_chance(self):
        """Test ultra crit damage is 0 when chance is 0"""
        p = Player()
        p.asc1_unlocked = True
        
        assert p.ultra_crit_dmg_mult == pytest.approx(0.0)


class TestProgressionRewards:
    """Test experience and fragment gain calculations"""
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_exp_gain_mult_base(self):
        """Test base experience gain multiplier"""
        p = Player()
        p.asc1_unlocked = True
        
        # Base is 1.0
        assert p.exp_gain_mult == pytest.approx(1.0)
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_exp_gain_mult_with_upgrade(self):
        """Test exp gain with upgrade 11"""
        p = Player()
        p.asc1_unlocked = True
        p.set_upgrade_level(11, 25)  # F11 = 0.5
        
        # 1 + 0.5 = 1.5
        assert p.exp_gain_mult == pytest.approx(1.5)
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_frag_loot_gain_mult_base(self):
        """Test base fragment loot gain multiplier"""
        p = Player()
        p.asc1_unlocked = True
        
        # val = 1.0
        # val *= (1 + 0) * (1 + 0.03) * (1 + 0)  # W5 defaults to (1+0)*0.03 = 0.03
        # val *= 1.0 * 1.0 * 1.0 * 1.0
        # = 1.03
        assert p.frag_loot_gain_mult == pytest.approx(1.03)
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_frag_loot_gain_mult_with_hestia(self):
        """Test fragment gain with Hestia idol"""
        p = Player()
        p.asc1_unlocked = True
        p.set_external_level(4, 100)  # W4 = 0.01
        
        # val = 1.0
        # val *= (1 + 0.01) * (1 + 0.03) * (1 + 0)
        # = 1.0 * 1.01 * 1.03 * 1.0 = 1.0403
        assert p.frag_loot_gain_mult == pytest.approx(1.04, abs=0.01)


class TestModifierSystem:
    """Test modifier chance and gain calculations"""
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_exp_mod_chance_base(self):
        """Test base exp mod chance"""
        p = Player()
        p.asc1_unlocked = True
        
        assert p.exp_mod_chance == pytest.approx(0.0)
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_exp_mod_gain_base(self):
        """Test base exp mod gain"""
        p = Player()
        p.asc1_unlocked = True
        
        # 3.0 * 1.0 = 3.0
        assert p.exp_mod_gain == pytest.approx(3.0)
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_loot_mod_chance_base(self):
        """Test base loot mod chance"""
        p = Player()
        p.asc1_unlocked = True
        
        assert p.loot_mod_chance == pytest.approx(0.0)
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_loot_mod_gain_base(self):
        """Test base loot mod gain"""
        p = Player()
        p.asc1_unlocked = True
        
        # 2.0 * 1.0 = 2.0
        assert p.loot_mod_gain == pytest.approx(2.0)
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_speed_mod_chance_base(self):
        """Test base speed mod chance"""
        p = Player()
        p.asc1_unlocked = True
        
        assert p.speed_mod_chance == pytest.approx(0.0)
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_speed_mod_gain_base(self):
        """Test base speed mod gain"""
        p = Player()
        p.asc1_unlocked = True
        
        # 10.0 * 1.0 = 10.0 (GM rounding)
        assert p.speed_mod_gain == pytest.approx(10.0)
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_stamina_mod_chance_base(self):
        """Test base stamina mod chance"""
        p = Player()
        p.asc1_unlocked = True
        
        assert p.stamina_mod_chance == pytest.approx(0.0)
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_stamina_mod_gain_base(self):
        """Test base stamina mod gain"""
        p = Player()
        p.asc1_unlocked = True
        
        # 3.0 * 1.0 = 3.0
        assert p.stamina_mod_gain == pytest.approx(3.0)


class TestAbilityCooldowns:
    """Test ability cooldown calculations"""
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_enrage_cooldown_base(self):
        """Test base enrage cooldown"""
        p = Player()
        p.asc1_unlocked = True
        
        # 60 * 1.0 = 60 (ceiling)
        assert p.enrage_cooldown == pytest.approx(60.0)
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_enrage_cooldown_with_reduction(self):
        """Test enrage cooldown with upgrades"""
        p = Player()
        p.asc1_unlocked = True
        p.set_upgrade_level(18, 10)  # H18 = -10
        
        # (60 - 10) * 1.0 = 50
        assert p.enrage_cooldown == pytest.approx(50.0)
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_flurry_cooldown_base(self):
        """Test base flurry cooldown"""
        p = Player()
        p.asc1_unlocked = True
        
        # 120 * 1.0 = 120
        assert p.flurry_cooldown == pytest.approx(120.0)
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_quake_cooldown_base(self):
        """Test base quake cooldown"""
        p = Player()
        p.asc1_unlocked = True
        
        # 180 * 1.0 = 180
        assert p.quake_cooldown == pytest.approx(180.0)
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_enrage_charges(self):
        """Test enrage charges calculation"""
        p = Player()
        p.asc1_unlocked = True
        
        # 5 + W9 (0 default)
        assert p.enrage_charges == 5
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_quake_attacks(self):
        """Test quake attacks calculation"""
        p = Player()
        p.asc1_unlocked = True
        
        # 5 + F31 (0) + W9 (0)
        assert p.quake_attacks == 5


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
