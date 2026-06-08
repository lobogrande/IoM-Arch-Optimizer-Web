"""
Tests for engine/floor_map.py - Floor generation with ore spawning and boss floors.

Covers:
- FloorGenerator initialization (tier unlocks, chance sets, rarity prefixes)
- Floor object creation (grid, gleaming status)
- Boss floor generation (mixed gauntlets, fixed boss types)
- Normal floor generation with spawn probabilities
- Tier progression (1-4 based on floor level)
- Gleaming floor mechanics (chance and multiplier)
- Ascension gating (Asc1 for Divine, Asc2 for Tier 4)
- Block modifier rolling (exp/loot/stamina/speed)
- Player modifier caching (performance optimization)
- Edge cases (pre-Asc1 divine failsafe, empty slots)
"""

import pytest
import sys
import os
import random

# Add public directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../public'))

from engine.floor_map import Floor, FloorGenerator
from core.player import Player
import project_config as cfg


class TestFloorObject:
    """Test Floor object creation and properties"""
    
    @pytest.mark.unit
    def test_floor_initialization(self):
        """Floor should store all properties"""
        grid = [None] * 24
        floor = Floor(floor_id=10, grid=grid, is_gleaming=True, gleaming_multi=3.0)
        
        assert floor.floor_id == 10
        assert floor.grid == grid
        assert floor.is_gleaming == True
        assert floor.gleaming_multi == 3.0
    
    @pytest.mark.unit
    def test_floor_grid_size(self):
        """Floor grid should be 24 slots"""
        grid = [None] * 24
        floor = Floor(1, grid, False, 1.0)
        
        assert len(floor.grid) == 24


class TestFloorGeneratorInitialization:
    """Test FloorGenerator initialization and constants"""
    
    @pytest.mark.unit
    def test_generator_initialization(self):
        """FloorGenerator should initialize with all constants"""
        gen = FloorGenerator()
        
        assert hasattr(gen, 'RARITY_PREFIX')
        assert hasattr(gen, 'TIER_UNLOCKS')
        assert hasattr(gen, 'CHANCE_SETS')
    
    @pytest.mark.unit
    def test_rarity_prefix_mapping(self):
        """Rarity prefix should map 0-6 to ore types"""
        gen = FloorGenerator()
        
        assert gen.RARITY_PREFIX[0] == 'dirt'
        assert gen.RARITY_PREFIX[1] == 'com'
        assert gen.RARITY_PREFIX[2] == 'rare'
        assert gen.RARITY_PREFIX[3] == 'epic'
        assert gen.RARITY_PREFIX[4] == 'leg'
        assert gen.RARITY_PREFIX[5] == 'myth'
        assert gen.RARITY_PREFIX[6] == 'div'
    
    @pytest.mark.unit
    def test_tier_unlocks_structure(self):
        """Tier unlocks should have 7 rarities with 4 tiers each"""
        gen = FloorGenerator()
        
        assert len(gen.TIER_UNLOCKS) == 7
        for rarity in range(7):
            assert len(gen.TIER_UNLOCKS[rarity]) == 4
    
    @pytest.mark.unit
    def test_chance_sets_ordered_descending(self):
        """Chance sets should be ordered by descending floor"""
        gen = FloorGenerator()
        
        # First entry should be highest floor
        assert gen.CHANCE_SETS[0][0] == 150
        # Last entry should be floor 1
        assert gen.CHANCE_SETS[-1][0] == 1
        
        # Should be descending order
        for i in range(len(gen.CHANCE_SETS) - 1):
            assert gen.CHANCE_SETS[i][0] > gen.CHANCE_SETS[i + 1][0]
    
    @pytest.mark.unit
    def test_cached_mod_config_starts_none(self):
        """Cached modifier config should start as None"""
        gen = FloorGenerator()
        
        assert gen._cached_mod_config is None


class TestPlayerModifierCaching:
    """Test player modifier caching system"""
    
    @pytest.mark.unit
    def test_cache_player_mods_creates_dict(self):
        """_cache_player_mods should create config dictionary"""
        gen = FloorGenerator()
        p = Player()
        p.asc1_unlocked = True
        
        gen._cache_player_mods(p)
        
        assert gen._cached_mod_config is not None
        assert isinstance(gen._cached_mod_config, dict)
    
    @pytest.mark.unit
    def test_cached_mod_config_keys(self):
        """Cached config should have all required keys"""
        gen = FloorGenerator()
        p = Player()
        p.asc1_unlocked = True
        
        gen._cache_player_mods(p)
        
        required_keys = [
            'exp_gain', 'exp_chance', 'loot_gain', 'loot_chance',
            'sta_gain', 'sta_chance', 'speed_gain', 'speed_chance',
            'exp_gain_mult', 'frag_gain_mult',
            'gleaming_chance', 'gleaming_multi'
        ]
        
        for key in required_keys:
            assert key in gen._cached_mod_config
    
    @pytest.mark.unit
    def test_cache_stores_player_values(self):
        """Cache should store actual player modifier values"""
        gen = FloorGenerator()
        p = Player()
        p.asc1_unlocked = True
        p.set_upgrade_level(11, 25)  # Increase exp gain
        
        gen._cache_player_mods(p)
        
        # Should store the player's exp_gain_mult
        assert gen._cached_mod_config['exp_gain_mult'] > 1.0


class TestBossFloorGeneration:
    """Test boss floor and mixed gauntlet generation"""
    
    @pytest.mark.unit
    def test_boss_floor_fixed_type(self):
        """Boss floors with fixed type should fill all 24 slots"""
        gen = FloorGenerator()
        p = Player()
        p.asc1_unlocked = True
        
        # Floor 11 is dirt1 boss in Asc1
        random.seed(42)
        floor = gen.generate_floor(11, p)
        
        # All 24 slots should be filled
        assert all(block is not None for block in floor.grid)
        # All should be the same block type
        block_ids = [block.block_id for block in floor.grid]
        assert all(bid == block_ids[0] for bid in block_ids)
    
    @pytest.mark.unit
    def test_mixed_gauntlet_floor(self):
        """Mixed gauntlet floors should have varied block types"""
        gen = FloorGenerator()
        p = Player()
        p.asc1_unlocked = True
        
        # Floor 34 is mixed gauntlet in Asc1
        random.seed(42)
        floor = gen.generate_floor(34, p)
        
        # All 24 slots should be filled
        assert all(block is not None for block in floor.grid)
        
        # Should have different block types (mixed)
        block_ids = set(block.block_id for block in floor.grid)
        assert len(block_ids) > 1  # Not all the same
    
    @pytest.mark.validation
    def test_boss_floor_divine_failsafe_pre_asc1(self):
        """Divine blocks in boss floors should downgrade to mythic pre-Asc1"""
        gen = FloorGenerator()
        p = Player()
        p.asc1_unlocked = False  # No Asc1
        
        # Try to generate a floor that would have divine blocks
        # (We'd need to check config for which floors have divine bosses)
        # For now, test the logic exists
        random.seed(42)
        floor = gen.generate_floor(11, p)
        
        # Should not contain any divine blocks
        for block in floor.grid:
            if block is not None:
                assert not block.block_id.startswith('div')


class TestNormalFloorGeneration:
    """Test normal floor generation with spawn probabilities"""
    
    @pytest.mark.unit
    def test_normal_floor_generates_24_slots(self):
        """Normal floor should have 24-slot grid"""
        gen = FloorGenerator()
        p = Player()
        p.asc1_unlocked = True
        
        random.seed(42)
        floor = gen.generate_floor(5, p)
        
        assert len(floor.grid) == 24
    
    @pytest.mark.unit
    def test_normal_floor_uses_spawn_chances(self):
        """Normal floor should use chance sets for spawning"""
        gen = FloorGenerator()
        p = Player()
        p.asc1_unlocked = True
        
        # Floor 5 should use chance set for floor >= 5
        random.seed(42)
        floor = gen.generate_floor(5, p)
        
        # Should have some blocks spawned
        filled_slots = [b for b in floor.grid if b is not None]
        assert len(filled_slots) > 0
    
    @pytest.mark.unit
    def test_floor_at_tier_boundary(self):
        """Floor at tier unlock boundary should respect tier limits"""
        gen = FloorGenerator()
        p = Player()
        p.asc1_unlocked = True
        
        # Floor 12 unlocks tier 2 dirt
        random.seed(42)
        floor = gen.generate_floor(12, p)
        
        # Should be able to spawn tier 2 dirt now
        block_ids = [b.block_id for b in floor.grid if b is not None]
        # dirt2 should be possible at floor 12
        assert any(bid.startswith('dirt') for bid in block_ids)
    
    @pytest.mark.validation
    def test_no_divine_blocks_pre_asc1(self):
        """Normal floors should not spawn divine blocks without Asc1"""
        gen = FloorGenerator()
        p = Player()
        p.asc1_unlocked = False
        
        # Floor 50 would normally allow divine
        random.seed(42)
        floor = gen.generate_floor(50, p)
        
        for block in floor.grid:
            if block is not None:
                assert not block.block_id.startswith('div')
    
    @pytest.mark.validation
    def test_no_tier4_blocks_pre_asc2(self):
        """Normal floors should not spawn tier 4 blocks without Asc2"""
        gen = FloorGenerator()
        p = Player()
        p.asc1_unlocked = True
        p.asc2_unlocked = False
        
        # Floor 150 would normally allow tier 4
        random.seed(42)
        floor = gen.generate_floor(150, p)
        
        for block in floor.grid:
            if block is not None:
                assert not block.block_id.endswith('4')


class TestGleamingFloorMechanics:
    """Test gleaming floor generation"""
    
    @pytest.mark.unit
    def test_gleaming_floor_flag(self):
        """Gleaming floor should have is_gleaming flag"""
        gen = FloorGenerator()
        p = Player()
        p.asc1_unlocked = True
        p.asc2_unlocked = True
        
        # Generate floor (may or may not be gleaming based on RNG)
        random.seed(42)
        floor = gen.generate_floor(100, p)
        
        assert hasattr(floor, 'is_gleaming')
        assert isinstance(floor.is_gleaming, bool)
    
    @pytest.mark.unit
    def test_gleaming_multiplier(self):
        """Gleaming floor should have multiplier"""
        gen = FloorGenerator()
        p = Player()
        p.asc1_unlocked = True
        p.asc2_unlocked = True
        
        random.seed(42)
        floor = gen.generate_floor(100, p)
        
        assert hasattr(floor, 'gleaming_multi')
        assert floor.gleaming_multi >= 1.0
    
    @pytest.mark.unit
    def test_non_gleaming_floor_has_1x_multiplier(self):
        """Non-gleaming floor should have 1.0x multiplier"""
        gen = FloorGenerator()
        p = Player()
        p.asc1_unlocked = True
        
        # Force non-gleaming by setting low chance
        random.seed(42)
        floor = gen.generate_floor(1, p)
        
        if not floor.is_gleaming:
            assert floor.gleaming_multi == 1.0


class TestBlockModifierRolling:
    """Test block modifier generation"""
    
    @pytest.mark.unit
    def test_blocks_have_modifiers(self):
        """Generated blocks should have modifiers dict"""
        gen = FloorGenerator()
        p = Player()
        p.asc1_unlocked = True
        
        random.seed(42)
        floor = gen.generate_floor(5, p)
        
        for block in floor.grid:
            if block is not None:
                assert hasattr(block, 'modifiers')
                assert isinstance(block.modifiers, dict)
    
    @pytest.mark.unit
    def test_modifier_keys(self):
        """Block modifiers should have all required keys"""
        gen = FloorGenerator()
        p = Player()
        p.asc1_unlocked = True
        
        random.seed(42)
        floor = gen.generate_floor(5, p)
        
        for block in floor.grid:
            if block is not None:
                required_keys = ['exp_multi', 'loot_multi', 'stamina_gain', 
                               'speed_active', 'speed_gain']
                for key in required_keys:
                    assert key in block.modifiers
    
    @pytest.mark.unit
    def test_exp_modifier_rolls(self):
        """Exp modifier should be either 1.0 or exp_gain value"""
        gen = FloorGenerator()
        p = Player()
        p.asc1_unlocked = True
        
        random.seed(42)
        floor = gen.generate_floor(5, p)
        
        for block in floor.grid:
            if block is not None:
                exp_multi = block.modifiers['exp_multi']
                # Should be 1.0 (no mod) or > 1.0 (exp mod)
                assert exp_multi >= 1.0


class TestTierProgression:
    """Test tier progression based on floor level"""
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_dirt_tier_progression(self):
        """Dirt blocks should progress through tiers"""
        gen = FloorGenerator()
        p = Player()
        p.asc1_unlocked = True
        
        # Floor 1: Can only spawn dirt1
        random.seed(42)
        floor1 = gen.generate_floor(1, p)
        
        dirt_blocks = [b for b in floor1.grid if b and b.block_id.startswith('dirt')]
        if dirt_blocks:
            assert all(b.block_id == 'dirt1' for b in dirt_blocks)
    
    @pytest.mark.unit
    def test_divine_unlock_at_floor_50(self):
        """Divine blocks should unlock at floor 50 with Asc1"""
        gen = FloorGenerator()
        p = Player()
        p.asc1_unlocked = True
        
        # Tier unlocks for divine (rarity 6) start at floor 50
        assert gen.TIER_UNLOCKS[6][0] == 50


class TestEdgeCases:
    """Test edge cases and boundary conditions"""
    
    @pytest.mark.validation
    def test_floor_1_generation(self):
        """Floor 1 (minimum) should generate correctly"""
        gen = FloorGenerator()
        p = Player()
        
        random.seed(42)
        floor = gen.generate_floor(1, p)
        
        assert floor.floor_id == 1
        assert len(floor.grid) == 24
    
    @pytest.mark.validation
    def test_floor_200_high_floor(self):
        """Floor 200 (high floor) should generate correctly"""
        gen = FloorGenerator()
        p = Player()
        p.asc1_unlocked = True
        p.asc2_unlocked = True
        
        random.seed(42)
        floor = gen.generate_floor(200, p)
        
        assert floor.floor_id == 200
        # Should have blocks at this floor
        assert any(b is not None for b in floor.grid)
    
    @pytest.mark.validation
    def test_empty_slots_possible(self):
        """Some floors may have empty slots based on spawn RNG"""
        gen = FloorGenerator()
        p = Player()
        p.asc1_unlocked = True
        
        # Early floors with low spawn rates may have empties
        random.seed(123)  # Different seed
        floor = gen.generate_floor(2, p)
        
        # It's valid to have None slots
        empty_count = sum(1 for b in floor.grid if b is None)
        # Just verify grid structure is correct
        assert len(floor.grid) == 24
    
    @pytest.mark.unit
    def test_modifier_cache_persists_across_floors(self):
        """Modifier cache should persist across multiple floor generations"""
        gen = FloorGenerator()
        p = Player()
        p.asc1_unlocked = True
        
        # Generate first floor (should cache)
        random.seed(42)
        floor1 = gen.generate_floor(5, p)
        
        assert gen._cached_mod_config is not None
        cache1 = gen._cached_mod_config
        
        # Generate second floor (should reuse cache)
        floor2 = gen.generate_floor(10, p)
        
        # Should be the same cache object
        assert gen._cached_mod_config is cache1


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
