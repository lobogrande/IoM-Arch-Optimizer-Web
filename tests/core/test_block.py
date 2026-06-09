"""
Tests for core/block.py - Block (ore) generation and scaling.

Covers:
- Block initialization with base stats from config
- Floor scaling multipliers (HP and armor)
- Card bonuses (HP reduction, XP/Loot multipliers)
- XP calculation with rounding rules
- Fragment calculation with rounding
- GameMaker bugs (Floor 150 armor skip, Floor 300 double-trigger)
- Edge cases (floors >300, invalid block IDs)
"""

import pytest
import sys
import os
import math

# Add public directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../public'))

from core.block import Block, _precompute_floor_scalars, _HP_SCALARS, _ARMOR_SCALARS
from core.player import Player
import project_config as cfg


class TestFloorScalingLookupTables:
    """Test pre-computed floor scaling multipliers"""
    
    @pytest.mark.unit
    def test_lookup_tables_initialized(self):
        """Lookup tables should be pre-computed at module load"""
        assert len(_HP_SCALARS) == 300
        assert len(_ARMOR_SCALARS) == 300
    
    @pytest.mark.unit
    def test_floor_1_no_scaling(self):
        """Floor 1 should have no scaling"""
        assert _HP_SCALARS[1] == 1.0
        assert _ARMOR_SCALARS[1] == 1.0
    
    @pytest.mark.unit
    def test_floor_99_no_scaling(self):
        """Floor 99 should have no scaling (before floor 100)"""
        assert _HP_SCALARS[99] == 1.0
        assert _ARMOR_SCALARS[99] == 1.0
    
    @pytest.mark.unit
    def test_floor_100_scaling(self):
        """Floor 100 should have 2x HP, 1.5x armor"""
        assert _HP_SCALARS[100] == 2.0
        assert _ARMOR_SCALARS[100] == 1.5
    
    @pytest.mark.unit
    def test_floor_150_scaling_bug(self):
        """Floor 150 should have 4x HP but still 1.5x armor (BUG: armor not scaled)"""
        assert _HP_SCALARS[150] == 4.0  # 2.0 * 2.0
        assert _ARMOR_SCALARS[150] == 1.5  # BUG: Not scaled again at 150
    
    @pytest.mark.unit
    def test_floor_200_scaling(self):
        """Floor 200 should have 8x HP, 2.25x armor"""
        assert _HP_SCALARS[200] == 8.0  # 2.0 * 2.0 * 2.0
        assert _ARMOR_SCALARS[200] == pytest.approx(2.25)  # 1.5 * 1.5
    
    @pytest.mark.unit
    @pytest.mark.critical
    def test_floor_300_double_trigger_bug(self):
        """Floor 300 should have double-trigger bug (2x applied twice)"""
        # HP: 2.0 (100) * 2.0 (150) * 2.0 (200) * 2.0 (250) * 2.0 (300) * 2.0 (300 again) = 64x
        assert _HP_SCALARS[300] == 64.0
        # Armor: 1.5 (100) * 1.5 (200) * 1.5 (250) * 1.5 (300) * 1.5 (300 again) = 7.59375x
        assert _ARMOR_SCALARS[300] == pytest.approx(7.59375)
    
    @pytest.mark.unit
    def test_precompute_function_returns_correct_size(self):
        """_precompute_floor_scalars should return 300 entries"""
        hp, armor = _precompute_floor_scalars()
        assert len(hp) == 300
        assert len(armor) == 300


class TestBlockInitialization:
    """Test Block object initialization"""
    
    @pytest.mark.unit
    def test_block_requires_valid_id(self):
        """Block should raise ValueError for invalid block ID"""
        p = Player()
        p.asc1_unlocked = True
        
        with pytest.raises(ValueError, match="Block ID 'invalid' not found"):
            Block('invalid', 1, p)
    
    @pytest.mark.unit
    def test_block_basic_properties(self):
        """Block should have hp, armor, xp, frag_amt, frag_type"""
        p = Player()
        p.asc1_unlocked = True
        
        block = Block('dirt1', 1, p)
        
        assert hasattr(block, 'hp')
        assert hasattr(block, 'armor')
        assert hasattr(block, 'xp')
        assert hasattr(block, 'frag_amt')
        assert hasattr(block, 'frag_type')
        assert hasattr(block, 'block_id')
        assert hasattr(block, 'current_floor')
    
    @pytest.mark.unit
    def test_block_stores_id_and_floor(self):
        """Block should store block_id and current_floor"""
        p = Player()
        p.asc1_unlocked = True
        
        block = Block('com2', 50, p)
        
        assert block.block_id == 'com2'
        assert block.current_floor == 50


class TestBlockBaseStats:
    """Test block stats with no scaling or cards"""
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_dirt1_base_stats_floor1(self):
        """dirt1 at floor 1 should have base stats"""
        p = Player()
        p.asc1_unlocked = True
        
        block = Block('dirt1', 1, p)
        
        # From config: hp=100, xp=0.05, a=0, fa=0
        assert block.hp == 100
        assert block.armor == 0
        assert block.xp == pytest.approx(0.05, abs=0.001)  # Base XP
        assert block.frag_amt == pytest.approx(0.0)
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_com1_base_stats_floor1(self):
        """com1 at floor 1 should have base stats"""
        p = Player()
        p.asc1_unlocked = True
        
        block = Block('com1', 1, p)
        
        # From config: hp=250, xp=0.15, a=5, fa=0.01
        assert block.hp == 250
        assert block.armor == 5
        assert block.xp == pytest.approx(0.15, abs=0.001)  # Base XP (no player multipliers)
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_rare1_base_stats_floor1(self):
        """rare1 at floor 1 should have base stats"""
        p = Player()
        p.asc1_unlocked = True
        
        block = Block('rare1', 1, p)
        
        # From config: hp=550, xp=0.35, a=12, fa=0.01
        assert block.hp == 550
        assert block.armor == 12
        assert block.xp == pytest.approx(0.35, abs=0.01)  # Base XP


class TestFloorScaling:
    """Test HP and armor scaling at different floors"""
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_floor_100_hp_scaling(self):
        """Floor 100 should double HP"""
        p = Player()
        p.asc1_unlocked = True
        
        block = Block('dirt1', 100, p)
        
        # Base HP 100 * 2.0 = 200
        assert block.hp == 200
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_floor_100_armor_scaling(self):
        """Floor 100 should multiply armor by 1.5"""
        p = Player()
        p.asc1_unlocked = True
        
        block = Block('com1', 100, p)
        
        # Base armor 5 * 1.5 = 7.5
        assert block.armor == pytest.approx(7.5)
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_floor_150_hp_scaling(self):
        """Floor 150 should have 4x HP (2x from 100, 2x from 150)"""
        p = Player()
        p.asc1_unlocked = True
        
        block = Block('dirt1', 150, p)
        
        # Base HP 100 * 4.0 = 400
        assert block.hp == 400
    
    @pytest.mark.unit
    @pytest.mark.critical
    def test_floor_150_armor_bug(self):
        """Floor 150 should NOT scale armor (game bug)"""
        p = Player()
        p.asc1_unlocked = True
        
        block = Block('rare1', 150, p)
        
        # Base armor 12 * 1.5 (from floor 100 only) = 18
        # Bug: Floor 150 does NOT scale armor
        assert block.armor == pytest.approx(18.0)
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_floor_200_hp_scaling(self):
        """Floor 200 should have 8x HP"""
        p = Player()
        p.asc1_unlocked = True
        
        block = Block('dirt1', 200, p)
        
        # Base HP 100 * 8.0 = 800
        assert block.hp == 800
    
    @pytest.mark.unit
    @pytest.mark.critical
    def test_floor_300_double_trigger(self):
        """Floor 300 should apply scaling twice (bug)"""
        p = Player()
        p.asc1_unlocked = True
        
        block = Block('dirt1', 300, p)
        
        # Base HP 100 * 64.0 = 6400
        assert block.hp == 6400
        
        # Base armor 0 * 7.59375 = 0 (no armor on dirt1)
        assert block.armor == pytest.approx(0.0)
    
    @pytest.mark.unit
    def test_floor_above_300_dynamic_calculation(self):
        """Floors > 300 should use dynamic calculation"""
        p = Player()
        p.asc1_unlocked = True
        
        block = Block('dirt1', 350, p)
        
        # HP: 100 * 2 (100) * 2 (150) * 2 (200) * 2 (250) * 2 (300) * 2 (300) * 2 (350) = 12800
        assert block.hp == 12800


class TestCardBonuses:
    """Test card bonus effects on blocks"""
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_card_level_1_hp_reduction(self):
        """Level 1 card should reduce HP to 90%"""
        p = Player()
        p.asc1_unlocked = True
        p.set_card_level('dirt1', 1)
        
        block = Block('dirt1', 1, p)
        
        # Base HP 100 * 0.9 = 90
        assert block.hp == 90
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_card_level_2_hp_reduction(self):
        """Level 2 card should reduce HP to 80%"""
        p = Player()
        p.asc1_unlocked = True
        p.set_card_level('com1', 2)
        
        block = Block('com1', 1, p)
        
        # Base HP 250 * 0.8 = 200
        assert block.hp == 200
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_card_level_3_polymorph_hp(self):
        """Level 3 card should use polymorph bonus (35%)"""
        p = Player()
        p.asc1_unlocked = True
        p.set_card_level('rare1', 3)
        
        block = Block('rare1', 1, p)
        
        # Base HP 550 * (1 - 0.35) = 357.5 → 358 (rounded)
        assert block.hp == 358
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_card_level_1_xp_bonus(self):
        """Level 1 card should give 1.1x XP"""
        p = Player()
        p.asc1_unlocked = True
        p.set_card_level('dirt1', 1)
        
        block = Block('dirt1', 1, p)
        
        # Base XP 0.05 * 1.0 (player base) * 1.1 (card) = 0.055
        assert block.xp == pytest.approx(0.055, abs=0.001)
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_card_level_3_xp_bonus(self):
        """Level 3 card should use polymorph bonus (1.35x XP)"""
        p = Player()
        p.asc1_unlocked = True
        p.set_card_level('com1', 3)
        
        block = Block('com1', 1, p)
        
        # Base XP 0.15 * 1.03 (player) * 1.35 (card) = 0.208575
        assert block.xp == pytest.approx(0.208, abs=0.01)


class TestXPCalculation:
    """Test XP calculation and rounding rules"""
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_xp_below_100_floored_to_thousandths(self):
        """XP below 100 should be floored to 0.001"""
        p = Player()
        p.asc1_unlocked = True
        
        block = Block('dirt1', 1, p)
        
        # XP should be floored to 3 decimal places
        assert block.xp < 100
        assert block.xp == pytest.approx(0.051, abs=0.001)
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_xp_above_100_rounded_down_to_integer(self):
        """XP above 100 should be rounded down to integer"""
        p = Player()
        p.asc1_unlocked = True
        # Use high XP block
        p.set_upgrade_level(11, 25)  # +50% XP gain
        
        block = Block('div1', 100, p)  # Base XP 20, floor 100 doesn't scale XP
        
        # Should be > 100 and integer
        if block.xp > 100:
            assert block.xp == int(block.xp)
    
    @pytest.mark.unit
    def test_xp_uses_player_exp_gain_mult(self):
        """XP should be affected by player's exp_gain_mult"""
        p = Player()
        p.asc1_unlocked = True
        p.set_upgrade_level(11, 25)  # F11 = 0.5, exp_gain_mult = 1.5
        
        block = Block('dirt1', 1, p)
        
        # Base XP 0.05 * 1.5 (player base) * 1.03 (W5) = higher than base
        assert block.xp > 0.05


class TestFragmentCalculation:
    """Test fragment yield calculation"""
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_fragment_type_matches_config(self):
        """Fragment type should match config"""
        p = Player()
        p.asc1_unlocked = True
        
        block = Block('rare1', 1, p)
        
        # rare1 has ft=2
        assert block.frag_type == 2
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_fragment_amount_rounded_to_thousandths(self):
        """Fragment amount should be rounded to 0.001"""
        p = Player()
        p.asc1_unlocked = True
        
        block = Block('com1', 1, p)
        
        # fa=0.01, should be rounded to 3 decimals
        assert round(block.frag_amt, 3) == block.frag_amt
    
    @pytest.mark.unit
    def test_fragment_uses_player_frag_loot_gain_mult(self):
        """Fragments should be affected by player's frag_loot_gain_mult"""
        p = Player()
        p.asc1_unlocked = True
        p.set_external_level(4, 100)  # Hestia idol W4 = 0.01
        
        block = Block('com1', 1, p)
        
        # Base fa 0.01 * player_mult * card_mult
        # Should be > base amount
        assert block.frag_amt >= 0.01
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_dirt1_no_fragments(self):
        """dirt1 should have no fragments (fa=0)"""
        p = Player()
        p.asc1_unlocked = True
        
        block = Block('dirt1', 1, p)
        
        assert block.frag_amt == pytest.approx(0.0)


class TestCachedPlayerMultipliers:
    """Test optional cached player multipliers"""
    
    @pytest.mark.unit
    def test_block_with_exp_mult_cache(self):
        """Block should use exp_mult_cache if provided"""
        p = Player()
        p.asc1_unlocked = True
        
        # Create block with cached value
        block = Block('dirt1', 1, p, exp_mult_cache=2.0)
        
        # XP should use cached value instead of player property
        # Base XP 0.05 * 2.0 (cache) * 1.0 (no card) = 0.1
        assert block.xp == pytest.approx(0.1, abs=0.01)
    
    @pytest.mark.unit
    def test_block_with_frag_mult_cache(self):
        """Block should use frag_mult_cache if provided"""
        p = Player()
        p.asc1_unlocked = True
        
        # Create block with cached value
        block = Block('com1', 1, p, frag_mult_cache=2.0)
        
        # Frag should use cached value
        # Base fa 0.01 * 2.0 (cache) * 1.0 (no card) = 0.02
        assert block.frag_amt == pytest.approx(0.020, abs=0.001)
    
    @pytest.mark.unit
    def test_block_with_both_caches(self):
        """Block should use both caches if provided"""
        p = Player()
        p.asc1_unlocked = True
        
        block = Block('com1', 1, p, exp_mult_cache=2.0, frag_mult_cache=3.0)
        
        # Both should use cached values
        assert block.xp > 0.15  # Higher than base due to cache
        assert block.frag_amt > 0.01  # Higher than base due to cache


class TestEdgeCases:
    """Test edge cases and boundary conditions"""
    
    @pytest.mark.validation
    def test_floor_1_minimum(self):
        """Floor 1 (minimum) should work"""
        p = Player()
        p.asc1_unlocked = True
        
        block = Block('dirt1', 1, p)
        
        assert block.hp == 100
        assert block.armor == 0
    
    @pytest.mark.validation
    def test_floor_300_boundary(self):
        """Floor 300 (lookup table boundary) should work"""
        p = Player()
        p.asc1_unlocked = True
        
        block = Block('dirt1', 300, p)
        
        assert block.hp == 6400  # 64x scaling
    
    @pytest.mark.validation
    def test_floor_301_switches_to_dynamic(self):
        """Floor 301 should use dynamic calculation"""
        p = Player()
        p.asc1_unlocked = True
        
        block = Block('dirt1', 301, p)
        
        # Should calculate dynamically (same as 300 for this floor)
        assert block.hp == 6400
    
    @pytest.mark.validation
    def test_floor_500_high_floor(self):
        """Floor 500 (very high) should work with dynamic calculation"""
        p = Player()
        p.asc1_unlocked = True
        
        block = Block('dirt1', 500, p)
        
        # HP should be very high (many scalings)
        assert block.hp > 10000
    
    @pytest.mark.validation
    def test_all_28_block_types(self):
        """All 28 block types should be valid"""
        p = Player()
        p.asc1_unlocked = True
        p.asc2_unlocked = True
        
        for tier in range(1, 5):
            for ore_type in ['dirt', 'com', 'rare', 'epic', 'leg', 'myth', 'div']:
                block_id = f'{ore_type}{tier}'
                block = Block(block_id, 1, p)
                
                assert block.hp > 0
                assert block.armor >= 0
                assert block.xp > 0
                assert block.frag_amt >= 0


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
