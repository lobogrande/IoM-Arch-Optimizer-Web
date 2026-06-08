"""
Python test suite for IoM Arch Optimizer.

This test suite covers the Python simulation engine:
- core/player.py: Player stat calculations
- core/block.py: Block (ore) generation and scaling
- core/skills.py: Ability cooldowns and mechanics
- engine/combat_loop.py: Combat simulation
- engine/floor_map.py: Floor progression and ore spawning

Run tests:
    pytest                          # All tests
    pytest -m critical             # Critical tests only
    pytest -m "unit and not slow"  # Fast unit tests
    pytest -k "player"             # Tests matching "player"
    pytest tests/core/             # Core module tests only
    pytest --cov                   # With coverage report
    pytest -n auto                 # Parallel execution

Coverage:
    pytest --cov --cov-report=html
    open coverage_html/index.html
"""
