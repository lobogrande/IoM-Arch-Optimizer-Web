# Testing Infrastructure - IoM Arch Optimizer

> **Note:** This document covers **JavaScript testing**. For Python testing, see `PYTHON_TESTING.md`.

**Last Updated:** June 7, 2026  
**Status:** ✅ Production Ready  
**JavaScript Tests:** 238 passing  
**Python Tests:** 235 passing (77 player + 41 block + 36 skills + 30 floor_map + 51 combat_loop)  
**Execution Time:** ~3 seconds (JS) + ~0.5 seconds (Python)  

---

## Summary

### JavaScript Tests (Vitest)

Comprehensive test suite covering core business logic with 238 tests across 12 test files.

**Test Coverage:**
- **game_data.js:** 107 tests (93% coverage) - Game constants and calculations
- **store.js:** 44 tests (70% coverage) - State management
- **optimizer.js:** 62 tests (95% coverage) - Optimization algorithms ✅ COMPLETE
- **pathfinder_engine.js:** 25 tests (30% coverage) - Progression helpers

**Key Features:**
- ✅ Fast execution (~3 seconds for 238 tests)
- ✅ CI-friendly (no external dependencies, mocked workers)
- ✅ Parallel execution with isolation safety
- ✅ Zero vulnerabilities
- ✅ Input validation for defense in depth

### Python Tests (pytest)

Test suite for simulation engine with 235 tests covering core and engine modules.

**Test Coverage:**
- **player.py:** 77 tests (97% coverage) - Player stats, upgrades, cards, combat formulas
- **block.py:** 41 tests (86% coverage) - Ore generation, floor scaling, card bonuses
- **skills.py:** 36 tests (94% coverage) - Ability cooldowns, auto-cast, instacharge
- **floor_map.py:** 30 tests (78% coverage) - Floor generation, boss floors, spawn rates
- **combat_loop.py:** 51 tests (90% coverage) - Combat simulation, skills, advanced mechanics

**Key Features:**
- ✅ Fast execution (~0.5 seconds for 235 tests)
- ✅ Comprehensive formula validation (damage, crit, modifiers, cooldowns)
- ✅ GameMaker bug testing (Floor 150 armor skip, Floor 300 double-trigger)
- ✅ Cap enforcement and ascension gating tests

**See `PYTHON_TESTING.md` for full Python test documentation.**

---

## Quick Start

```bash
# Run all tests
npm test

# Watch mode (auto-rerun on changes)
npm run test:watch

# Visual UI (browser-based)
npm run test:ui

# With coverage report
npm run test:coverage
```

---

## Test Files

### Core Game Logic (107 tests)
| File | Tests | Coverage | What It Tests |
|------|-------|----------|---------------|
| `game_data.test.js` | 6 | Constants | Game constants (upgrade count, stat names, external groups) |
| `calculateUpgradeCost.test.js` | 18 | Cost calculation | Upgrade cost formula, edge cases |
| `capEnforcement.test.js` | 23 | Cap logic | Upgrade level caps, ascension dependencies |
| `ascensionLocks.test.js` | 28 | Lock validation | Ascension unlock requirements, minimum levels |
| `blockAndCurrency.test.js` | 13 | Data structures | Block/currency lookups, error handling |
| `infernalBonuses.test.js` | 19 | Bonus calculation | Infernal card bonuses, tier validation |

### State Management (44 tests)
| File | Tests | Coverage | What It Tests |
|------|-------|----------|---------------|
| `storeProfiles.test.js` | 15 | Profile CRUD | Create, load, save, rename, delete + edge cases |
| `storeSetters.test.js` | 29 | State setters | Base stats, upgrades, cards, settings + validation |

### Optimization Engine (62 tests) ✅ COMPLETE
| File | Tests | Coverage | What It Tests |
|------|-------|----------|---------------|
| `optimizer.test.js` | 27 | Pure functions | Grid generation, counting, budget enforcement |
| `engineWorkerPool.test.js` | 18 | Worker pool | Initialization, queuing, state sync (mocked) |
| `runOptimizationPhase.test.js` | 17 | Orchestration | Successive halving, timeouts, metrics (mocked) |

### Progression Engine (25 tests)
| File | Tests | Coverage | What It Tests |
|------|-------|----------|---------------|
| `pathfinderEngine.test.js` | 25 | Helper functions | Experience, stat caps, budget enforcement, crippled phase |

---

## Test Results

```
Test Files  12 passed (12)
     Tests  238 passed (238)
  Duration  3.06s
```

---

## What's Tested

### ✅ game_data.js (93% coverage)
- Game constants (upgrade counts, stat names)
- Cost calculation formulas
- Upgrade cap enforcement (single + batch)
- Ascension lock validation
- Block/currency data structures
- Infernal card bonus calculations

**Note:** All functions are exported and tested. The 7% untested is just the static data structures themselves (which don't need tests).

---

### ✅ store.js (70% coverage)
**Tested:**
- Profile management (CRUD operations + edge cases for non-existent profiles)
- Base stat setters (all 7 stats)
- Upgrade level setters (with cap enforcement integration)
- Card level setters
- Settings setters with validation (arch_level ≥1, floors ≥1, boolean coercion)
- Ascension sanitization (asc1/asc2 cascading locks)
- External upgrade group setters
- resetState function

**What's NOT tested (intentionally):**
- `loadStateFromJson` (complex 100+ line legacy parser, low priority)
- UI state setters (trivial one-liners: `setActiveTab`, etc.)
- `saveRoiToCurrentRun` (niche ROI feature, requires complex setup)
- Sandbox/duel setters (duplicate patterns of base setters)

**Validation Added:** `setSetting()` now validates inputs:
- `arch_level`: Parsed to int, min 1 (no max)
- `current_max_floor`: Parsed to int, min 1
- `starting_speed_pool`: Parsed to int, min 0
- Boolean fields: Type coerced to `true`/`false`

---

### ✅ optimizer.js (95% coverage - COMPLETE)
**Pure Functions (27 tests):**
- `generateDistributions` - Backtracking grid generation
- `countDistributions` - Fast combination counting
- `getExpectedRuns` - Successive halving calculation
- `getOptimalStepProfile` - Auto-scaler with adaptive sizing
- `topUpBuild` - Budget enforcement and cap respect

**Worker Pool Infrastructure (18 tests):**
- `EngineWorkerPool` class - Worker lifecycle, queuing, state sync
- Uses mocked workers (no real Pyodide/Python needed)
- Tests initialization, task execution, error handling, cleanup

**Orchestration (17 tests):**
- `runOptimizationPhase` - Successive halving, progress tracking, timeouts
- Uses mocked worker pool for fast execution
- Tests all code paths including edge cases

**Why Mocked:** Real workers require Pyodide (2-5s boot), not CI-friendly. Mocks test orchestration logic, not simulation math (tested in Python).

---

### ✅ pathfinder_engine.js (30% coverage)
**Tested (25 tests):**
- `getExpRequired` - Experience requirement formula
- `isCrippledPhase` - Ascension 2 macro-stepper detection
- `getAvailableStatKeys` - Dynamic stat list based on ascensions
- `getEffectiveStatCaps` - Stat caps with upgrade 45 bonuses
- `formatBuildStr` - Build formatting for logs
- `enforceBudget` - Budget enforcement and stat filling

**Note:** Helpers exported via `__test__` object (doesn't affect application code)

**What's NOT tested:**
- `runPathfinderSimulation` (1400+ line main loop)
- `getShadowFragYields` (requires worker pool)
- Would need integration tests or extensive mocking

---

## What's Still Untested

### High-Value (Future Work):
1. **pathfinder_engine.js main loop** (1400 lines)
   - Requires worker pool integration
   - Would need integration/E2E tests

### Low-Priority (Intentionally Skipped):
1. **Web Workers** (~500 lines total)
   - Thin glue code wrapping Python engine
   - Requires Pyodide runtime (slow, flaky in CI)
   - Failures are immediately obvious (app doesn't work)
   
2. **React Components** (~4500 lines)
   - UI rendering and event handlers
   - Lower risk than business logic
   - Bugs are visually obvious
   - Would need React Testing Library

---

## Testing Best Practices

### DO:
- ✅ Test business logic, not implementation details
- ✅ Use descriptive test names
- ✅ Test edge cases (0, negative, max values, null/undefined)
- ✅ Keep tests fast (<100ms each)
- ✅ Mock external dependencies (Web Workers, IndexedDB)
- ✅ Use `describe.sequential()` for shared singleton state (Zustand store)

### DON'T:
- ❌ Test library code (React, Zustand internals)
- ❌ Test UI rendering without purpose
- ❌ Run slow integration tests in every test run
- ❌ Test implementation details that might change
- ❌ Skip tests with `.skip()` - fix or remove them

---

## Test Organization

All tests live in `src/tests/`:

```
src/tests/
├── setup.js                      ← Global setup (mocks workers, IndexedDB)
├── game_data.test.js             ← 6 tests
├── calculateUpgradeCost.test.js  ← 18 tests
├── capEnforcement.test.js        ← 23 tests
├── ascensionLocks.test.js        ← 28 tests
├── blockAndCurrency.test.js      ← 13 tests
├── infernalBonuses.test.js       ← 19 tests
├── storeProfiles.test.js         ← 15 tests
├── storeSetters.test.js          ← 29 tests
├── optimizer.test.js             ← 27 tests
├── engineWorkerPool.test.js      ← 18 tests (mocked workers)
├── runOptimizationPhase.test.js  ← 17 tests (mocked pool)
└── pathfinderEngine.test.js      ← 25 tests
```

---

## Configuration

### vitest.config.js
- **Framework:** Vitest 4.1.8
- **Environment:** jsdom (for browser globals)
- **Setup:** `src/tests/setup.js` (mocks workers, IndexedDB)
- **Include:** `src/tests/**/*.{test,spec}.{js,jsx}`
- **Timeout:** 10 seconds (for slow tests)

### Test Scripts (package.json)
```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:ui": "vitest --ui",
  "test:coverage": "vitest run --coverage"
}
```

---

## CI Integration

Tests run automatically on:
- Push to `main` or `dev` branches
- Pull requests targeting `main` or `dev`

**CI Steps:**
1. Checkout code
2. Setup Node.js (v20)
3. Install dependencies (`npm ci`)
4. Run linter
5. Validate Python syntax
6. **Run tests** ← 238 tests in ~3 seconds
7. Build project
8. [Conditional: WASM] WASM validation

**CI-Friendly:** All tests pass in ~3 seconds with no external dependencies.

---

## Writing New Tests

### Template:
```javascript
// src/tests/yourFeature.test.js
import { describe, it, expect } from 'vitest';
import { yourFunction } from '../yourFeature.js';

describe('Your Feature', () => {
  it('should do something specific', () => {
    const result = yourFunction(input);
    expect(result).toBe(expected);
  });
});
```

### For Zustand Store Tests:
```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import useStore from '../store.js';

describe.sequential('Store Feature', () => {
  beforeEach(() => {
    useStore.getState().resetState();
  });

  it('should update state correctly', () => {
    const store = useStore.getState();
    store.setSomething(value);
    expect(useStore.getState().something).toBe(value);
  });
});
```

**Note:** Use `describe.sequential()` for store tests to prevent parallel execution conflicts with singleton.

---

## Debugging Tests

```bash
# Run with verbose output
npx vitest --reporter=verbose

# Run single test file
npx vitest src/tests/optimizer.test.js

# Run tests matching pattern
npx vitest --grep "should calculate"

# Update snapshots
npx vitest -u
```

---

## Security

**Vitest Vulnerabilities:** ✅ Resolved

- Initial install: 5 vulnerabilities (2 moderate, 1 high, 2 critical)
- Fixed with: `npm audit fix --force`
- Current state: **0 vulnerabilities**
- Version: vitest@4.1.8, @vitest/ui@4.1.8

---

## FAQs

**Q: Why not 100% coverage?**  
A: We focus on high-value business logic. UI code (React components) and thin wrappers (web workers) are lower priority.

**Q: Why mock workers?**  
A: Real workers require Pyodide (2-5s boot), making tests slow and flaky. Mocks test orchestration logic, which is what matters for CI.

**Q: Can I skip tests?**  
A: No. CI will fail. Fix or remove broken tests instead.

**Q: How do I test async code?**  
A: Use `async`/`await` in test functions:
```javascript
it('should handle async operation', async () => {
  const result = await asyncFunction();
  expect(result).toBeDefined();
});
```

**Q: What about code coverage reports?**  
A: Run `npm run test:coverage` to generate HTML report.

---

## Next Steps

### Immediate:
- ✅ All critical business logic tested
- ✅ CI integration complete
- ✅ Fast, reliable test suite

### Optional Future Work:
1. **Integration tests** for pathfinder main loop (requires worker pool)
2. **Component tests** for critical React components (React Testing Library)
3. **E2E tests** for full user workflows (Playwright)

---

**Status:** ✅ Production-ready test infrastructure. Core business logic heavily tested. Add more tests as you develop new features.
