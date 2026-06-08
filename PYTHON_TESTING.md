# Python Testing Setup

## Overview

Python test suite for the IoM Arch Optimizer simulation engine using pytest.

- **Framework**: pytest 8.2.2 with coverage and parallel execution
- **Test Files**: 3 (154 tests)  
- **Coverage**: 91% of core modules (player, block, skills)
- **Execution Time**: ~0.38 seconds
- **Python Version**: 3.14+ required

## Quick Start

```bash
# Create virtual environment (one-time setup)
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt

# Run all Python tests
source .venv/bin/activate
pytest

# Run specific test file
pytest tests/core/test_player.py

# Run with coverage report
pytest --cov --cov-report=html
open coverage_html/index.html

# Run tests matching pattern
pytest -k "infernal"

# Run only critical tests
pytest -m critical

# Run with parallel execution (faster)
pytest -n auto
```

## Test Files

## Test Files

### `tests/core/test_player.py` (77 tests, 91% coverage)

Tests for `public/core/player.py` - Player stat calculations and upgrade management.

**Test Classes:**
1. **TestPlayerInitialization** (4 tests)
   - Default values, upgrade/external/card initialization

2. **TestUpgradeCaps** (6 tests) - `[CRITICAL]` `[VALIDATION]`
   - Upgrade level cap enforcement
   - Gem upgrade dynamic caps (arch_level + 4)
   - Negative level clamping

3. **TestCardBonuses** (6 tests) - `[FORMULAS]`
   - Card level multipliers (HP, XP, Loot)
   - Polymorph bonus calculation (level 3+ cards)
   - Tier 4 Asc2 gating

4. **TestInfernalMultiplier** (7 tests) - `[FORMULAS]`
   - Arch infernal card counting
   - Total infernal cards bonus (0.2% per card)
   - Hades idol bonus (0.0045% per level)
   - Combined multiplier calculation

5. **TestInfernalCaching** (6 tests)
   - Pre-computation of all 28 block type bonuses
   - Cache invalidation with Asc1/Asc2
   - inf() method cache lookup

6. **TestGameMakerRounding** (4 tests)
   - GameMaker-specific rounding (0.5 always rounds up)
   - Ceiling/floor drift modes
   - Banker's rounding for UI display

7. **TestAscensionGating** (6 tests) - `[CRITICAL]` `[VALIDATION]`
   - Asc1-locked upgrades (12, 17, 24, etc.)
   - Asc2-locked upgrades (19, 27, 34, etc.)
   - Div/Corr stat gating

8. **TestExternalUpgrades** (5 tests) - `[FORMULAS]`
   - Hestia idol, Axolotl skin, Geoduck
   - Arch ability card level-specific bonuses
   - Archaeology bundle minimum value

9. **TestCombatStats** (8 tests) - `[FORMULAS]`
   - max_sta calculation (base, with Agility)
   - damage calculation (base, with Strength, with flat upgrades)
   - armor_pen calculation (base, with Perception)

10. **TestCritSystem** (9 tests) - `[FORMULAS]`
    - crit_chance (base, with upgrades, with Luck)
    - crit_dmg_mult (base)
    - super_crit_chance and super_crit_dmg_mult
    - ultra_crit_chance and ultra_crit_dmg_mult

11. **TestProgressionRewards** (4 tests) - `[FORMULAS]`
    - exp_gain_mult (base, with upgrades)
    - frag_loot_gain_mult (base, with Hestia idol)

12. **TestModifierSystem** (8 tests) - `[FORMULAS]`
    - exp_mod_chance and exp_mod_gain
    - loot_mod_chance and loot_mod_gain
    - speed_mod_chance and speed_mod_gain
    - stamina_mod_chance and stamina_mod_gain

13. **TestAbilityCooldowns** (10 tests) - `[FORMULAS]`
    - enrage_cooldown (base, with reduction)
    - flurry_cooldown (base)
    - quake_cooldown (base)
    - enrage_charges and quake_attacks

**Untested Areas in player.py** (9% not covered):
- Edge case: Level 4 arch ability card with infernal bonus (line 197)
- Exception handlers for invalid cell names (lines 206, 211)
- inf() fallback calculation without cache (lines 324-335)
- enraged_damage @property (lines 379-389)
- enraged_crit_dmg_mult details (lines 419-421)
- super_crit_dmg_mult edge cases (lines 429-431)
- ultra_crit_dmg_mult edge cases (lines 439-440)

### `tests/core/test_block.py` (41 tests, 86% coverage)

Tests for `public/core/block.py` - Block (ore) generation and scaling.

**Test Classes:**
1. **TestFloorScalingLookupTables** (8 tests)
   - Pre-computed HP/armor multipliers (floors 1-300)
   - Floor 150 armor bug, Floor 300 double-trigger bug

2. **TestBlockInitialization** (3 tests)
   - Invalid block ID validation
   - Basic properties, ID/floor storage

3. **TestBlockBaseStats** (3 tests)
   - Base stats from configuration for all block types

4. **TestFloorScaling** (7 tests)
   - HP/armor scaling at floors 100, 150, 200, 300+
   - GameMaker bugs (armor skip, double-trigger)

5. **TestCardBonuses** (6 tests)
   - Card level 1/2/3 HP reduction and XP/Loot multipliers
   - Polymorph bonus calculations

6. **TestXPCalculation** (4 tests)
   - XP rounding rules (<100: 0.001, >100: integer)

7. **TestFragmentCalculation** (4 tests)
   - Fragment yield and rounding (0.001 precision)

8. **TestCachedPlayerMultipliers** (3 tests)
   - Performance optimization with cached values

9. **TestEdgeCases** (6 tests)
   - Floors 1-500, all 28 block types, boundary conditions

**Untested Areas in block.py** (14% not covered):
- Line 25: sys.path manipulation (infrastructure)
- Lines 141-156: Manual test script (`if __name__ == "__main__"`)

### `tests/core/test_skills.py` (36 tests, 94% coverage)

Tests for `public/core/skills.py` - Skill manager for ability cooldowns and mechanics.

**Test Classes:**
1. **TestSkillManagerInitialization** (5 tests)
   - Initialization with/without skill cache
   - Auto-cast flags from upgrade 8 levels

2. **TestCooldownTimers** (6 tests)
   - Enrage/Flurry/Quake cooldown decay
   - Flurry timer stops at zero

3. **TestAutoCastEnrage** (3 tests)
   - Auto-cast when enabled/disabled/on-cooldown

4. **TestAutoCastFlurry** (3 tests)
   - Auto-cast mechanics, stamina restoration on cast

5. **TestAutoCastQuake** (2 tests)
   - Auto-cast when enabled/disabled

6. **TestAbilityInstacharge** (3 tests)
   - RNG cooldown reset, counter increment, chain limit (100)

7. **TestChargeConsumption** (5 tests)
   - Enrage/Quake charge decay on attack
   - Quake trigger detection

8. **TestActiveStateProperties** (6 tests)
   - is_enrage_active, is_flurry_active, is_quake_active

9. **TestEdgeCases** (3 tests)
   - Multiple abilities in same tick
   - Flurry timer accumulation, lifetime stats

**Untested Areas in skills.py** (6% not covered):
- Lines 130-132, 145-147: Flurry/Quake instacharge RNG branches

## Coverage Details

| File | Statements | Covered | Coverage | Notes |
|------|-----------|---------|----------|-------|
| `public/core/player.py` | 290 | 264 | 91% | ✅ Core logic tested |
| `public/core/block.py` | 76 | 65 | 86% | ✅ Core logic tested |
| `public/core/skills.py` | 99 | 93 | 94% | ✅ Core logic tested |
| `public/engine/combat_loop.py` | 205 | 0 | 0% | ⏸️ Not yet tested |
| `public/engine/floor_map.py` | 94 | 0 | 0% | ⏸️ Not yet tested |

**Core Modules Coverage:** 91% (422/465 statements)  
**Overall Coverage:** 55% (422/764 statements)

## Configuration Files

### `pytest.ini`

Main pytest configuration file with:
- Test discovery patterns (`test_*.py`)
- Coverage settings (80% threshold, HTML reports)
- Test markers (unit, integration, slow, critical, validation, formulas)
- Output formatting (-v, -ra, --durations=10)

### `requirements-dev.txt`

Python development dependencies:
- pytest 8.2.2 (test framework)
- pytest-cov 5.0.0 (coverage reporting)
- pytest-xdist 3.6.1 (parallel test execution)
- ruff 0.4.8 (fast Python linter)

### `.venv/` (virtual environment)

Local Python virtual environment (not committed to git).

## Test Markers

Tests are tagged with markers for easy filtering:

```bash
# Run only unit tests
pytest -m unit

# Run only critical tests (must always pass)
pytest -m critical

# Run validation tests (input validation, edge cases)
pytest -m validation

# Run formula tests (game calculation accuracy)
pytest -m formulas

# Run fast tests (exclude slow tests)
pytest -m "not slow"

# Combine markers
pytest -m "critical and not slow"
```

## Best Practices

### Test Isolation

Each test creates a fresh `Player()` object to avoid state pollution:

```python
def test_upgrade_cap_enforcement(self):
    p = Player()  # Fresh instance for this test
    p.set_upgrade_level(3, 100)
    assert p.upgrade_levels[3] <= 50
```

### Formula Validation

Use `pytest.approx()` for floating point comparisons:

```python
assert p.infernal_multiplier == pytest.approx(1.08)
assert p.w('W4') == pytest.approx(0.01, abs=1e-6)
```

### Marker Usage

Tag tests appropriately:

```python
@pytest.mark.critical  # Must always pass
@pytest.mark.validation  # Input validation
def test_upgrade_cap_enforcement(self):
    ...
```

### Test Organization

Group related tests into classes:

```python
class TestUpgradeCaps:
    """Test upgrade level cap enforcement"""
    
    def test_upgrade_cap_enforcement(self):
        ...
    
    def test_gem_upgrade_dynamic_caps(self):
        ...
```

## CI Integration

### GitHub Actions

Add to `.github/workflows/ci.yml`:

```yaml
- name: Set up Python
  uses: actions/setup-python@v4
  with:
    python-version: '3.14'

- name: Install Python dependencies
  run: |
    python -m pip install --upgrade pip
    pip install -r requirements-dev.txt

- name: Run Python tests
  run: |
    pytest --cov --cov-report=term
```

## Writing New Tests

### Template

```python
import pytest
from core.player import Player

class TestMyFeature:
    """Test description"""
    
    @pytest.mark.unit
    @pytest.mark.formulas
    def test_my_calculation(self):
        """Test description"""
        p = Player()
        p.arch_level = 50
        p.asc1_unlocked = True
        
        result = p.some_property
        
        assert result == pytest.approx(expected_value)
```

### What to Test

✅ **Do Test:**
- Game formula accuracy (stat calculations, bonuses)
- Input validation (cap enforcement, negative values)
- Edge cases (Asc1/Asc2 unlocks, special upgrade behaviors)
- State transitions (card upgrades, infernal multipliers)

❌ **Don't Test:**
- Simple getters/setters (tested implicitly)
- Print statements or logging
- Identical formulas already tested elsewhere

## FAQs

### Why is coverage only 55%?

We've completed comprehensive testing of the core modules (player, block, skills at 91% combined), but haven't started testing the engine modules yet:
- block.py (ore generation and scaling)
- skills.py (ability cooldowns)
- combat_loop.py (combat simulation)
- floor_map.py (floor progression)

### How fast should tests run?

Current test suite runs in **~0.38 seconds** (154 tests: 77 player + 41 block + 36 skills). Target: <1 second for 200+ tests.

### Why are some Player properties not tested?

The remaining 9% untested includes:
- Edge cases requiring complex setup (level 4 arch ability card)
- Exception handlers (defensive programming, unlikely to execute)
- Fallback calculation paths (backwards compatibility)
- enraged_damage and enraged_crit_dmg_mult (variants of tested formulas)
- super_crit and ultra_crit edge cases (already tested for 0 chance)

These are either low-impact edge cases or variants of already-tested formulas.

### Can I run tests in parallel?

Yes! Use `pytest -n auto` to run tests in parallel across all CPU cores.

### What's the difference between JavaScript and Python tests?

- **JavaScript tests** (Vitest): 238 tests for UI logic, state management, game data
- **Python tests** (pytest): 154 tests for simulation engine calculations (player, block, skills)
- Both use similar markers (unit, critical, validation, formulas)
- Both target ~90% coverage for business logic
- **Total:** 392 tests across both languages

### Should I use unittest or pytest?

Use **pytest**. It's more modern, has better fixtures, cleaner syntax, and better error messages than unittest.

## Next Steps

1. ✅ **player.py tests complete** (77 tests, 91% coverage)
2. ✅ **block.py tests complete** (41 tests, 86% coverage)
3. ✅ **skills.py tests complete** (36 tests, 94% coverage)
4. ⏸️ **floor_map.py tests** (ore spawning, boss floors, restrictions)
5. ⏸️ **combat_loop.py tests** (combat simulation - may be integration tests)

**Estimated effort:** 1-2 days per module (floor_map), 2-3 days for combat_loop.

## Related Documentation

- `TESTING_SETUP.md` - JavaScript testing documentation (Vitest)
- `REACT_TESTING_OPTIONS.md` - React component testing strategies
- `COMPLETE_COVERAGE_ANALYSIS.md` - Full codebase coverage analysis
