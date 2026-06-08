# Testing Infrastructure Setup - Complete

**Date:** June 7, 2026  
**Status:** ✅ Fully Implemented & Passing

---

## Summary

Successfully set up comprehensive testing and CI infrastructure for the IoM Arch Optimizer project with:

- ✅ **Vitest** test framework installed and configured  
- ✅ **6 passing tests** for game constants  
- ✅ **GitHub Actions CI** running 4 validation steps  
- ✅ **Parallel test execution** built-in (Vitest default)  
- ✅ **Zero vulnerabilities** after security fixes

---

## What Was Added

### 1. Test Framework

**Installed packages:**
```bash
npm install -D vitest@4.1.8 @vitest/ui@4.1.8 jsdom @testing-library/react @testing-library/jest-dom
```

**Configuration files:**
- `vitest.config.js` - Test runner configuration
- `src/tests/setup.js` - Global test setup (mocks Web Workers, IndexedDB)

**Test scripts in `package.json`:**
```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:ui": "vitest --ui",
  "test:coverage": "vitest run --coverage"
}
```

### 2. Test Coverage

**Files:** 6 test files
- `src/tests/game_data.test.js` - Game constants (6 tests)
- `src/tests/calculateUpgradeCost.test.js` - Cost calculation (18 tests)
- `src/tests/capEnforcement.test.js` - Cap enforcement functions (23 tests)
- `src/tests/ascensionLocks.test.js` - Ascension locks & requirements (28 tests)
- `src/tests/blockAndCurrency.test.js` - Block/currency data (13 tests)
- `src/tests/infernalBonuses.test.js` - Infernal card bonuses (19 tests)

**Coverage:**
- ✅ All constants (UPGRADE_NAMES, INTERNAL_UPGRADE_CAPS, CARD_TYPES, etc.)
- ✅ calculateUpgradeCost function (18 tests - all edge cases)
- ✅ enforceUpgradeCap & enforceAllUpgradeCaps (23 tests - critical)
- ✅ ASC1_LOCKED_UPGS & ASC2_LOCKED_UPGS validation (28 tests)
- ✅ UPGRADE_LEVEL_REQS (arch unlock logic)
- ✅ BLOCK_MIN_FLOORS (floor appearance logic)
- ✅ INFERNAL_CARD_BONUSES (bonus structure & values - 19 tests)
- ✅ CURRENCY_TYPES, FRAG_NAMES, FRAG_ICONS

**game_data.js Coverage:** ~93% functional coverage (13 of 14 exports tested)

**Test Results:**
```
Test Files  6 passed (6)
     Tests  107 passed (107)
  Duration  1.28s
```

### 3. Enhanced CI Workflow

**File:** `.github/workflows/ci.yml`

**New validation steps:**
1. ✅ **ESLint** - Code quality checks
2. ✅ **Python syntax** - Validates `.py` files compile
3. ✅ **JavaScript tests** - Runs Vitest suite
4. ✅ **WASM binary comparison** - Verifies reproducibility

**CI Build Steps (in order):**
```
1. Checkout code
2. Setup Node.js (v20)
3. Install dependencies (npm ci)
4. Run linter ← NEW
5. Validate Python syntax ← NEW
6. Run JavaScript tests ← NEW
7. Build project
8. [Conditional: WASM] Setup Rust
9. [Conditional: WASM] Build WASM from source
10. [Conditional: WASM] Compare to committed binary ← ENHANCED
11. [Conditional: WASM] Run 84 Rust tests
```

**Estimated CI time:**
- Python-only PRs: ~40 seconds (+10s for new steps)
- WASM PRs: ~2-3 minutes (unchanged)

---

## Test Execution

### Local Development

```bash
# Run tests once
npm test

# Watch mode (auto-rerun on file changes)
npm run test:watch

# Visual UI (browser-based)
npm run test:ui

# With coverage report
npm run test:coverage
```

### CI Execution

Tests run automatically on:
- Push to `main` or `dev` branches
- Pull requests targeting `main` or `dev`

CI fails if any of these fail:
- Linting errors
- Python syntax errors
- Test failures
- Build failures
- Rust test failures (WASM PRs only)

---

## Test Parallelization

**Built-in by default** - Vitest runs tests in parallel using worker threads.

**Configuration:** (vitest.config.js)
- Tests execute in isolated environments
- No explicit parallelization config needed
- Scales automatically to available CPU cores

**Performance:**
- 6 tests complete in <10ms (actual test execution)
- Most time spent in setup (474ms for jsdom environment)
- Adding more tests will scale efficiently

---

## What to Test Next

### Priority 1: Critical Business Logic

**Recommended:** `src/utils/optimizer.js`
- Grid generation algorithm
- Candidate selection logic
- Budget calculations
- Stat allocation validation

**Example tests:**
```javascript
describe('Optimizer Grid Generation', () => {
  it('should generate valid stat combinations within budget');
  it('should respect stat caps');
  it('should not generate duplicate candidates');
});
```

### Priority 2: State Management

**Recommended:** `src/store.js`
- State setters/getters
- Profile management (create, load, save, delete)
- JSON import/export
- Upgrade level validation

**Example tests:**
```javascript
describe('Store - Profile Management', () => {
  it('should create new profile with current state');
  it('should load profile and restore state');
  it('should detect unsaved changes');
});
```

### Priority 3: Pathfinder Logic

**Recommended:** `src/utils/pathfinder_engine.js`
- Level progression decisions
- Upgrade purchase logic
- Yield comparisons
- Build optimization

---

## Testing Best Practices

### DO:
✅ Test business logic, not implementation details  
✅ Use descriptive test names  
✅ Test edge cases (0, negative, max values)  
✅ Keep tests fast (<100ms each)  
✅ Mock external dependencies (Web Workers, IndexedDB)

### DON'T:
❌ Test library code (React, Zustand internals)  
❌ Test UI rendering (unless writing component tests)  
❌ Run slow integration tests in every test run  
❌ Test implementation details that might change  
❌ Skip tests with `.skip()` - fix or remove them

---

## Security Fixes

### Vitest Vulnerabilities (Resolved)

**Issue:** Initial install had 5 vulnerabilities (2 moderate, 1 high, 2 critical)

**Fix:** Ran `npm audit fix --force`

**Result:**
- Updated to vitest@4.1.8 and @vitest/ui@4.1.8
- **0 vulnerabilities** remaining
- All tests passing

---

## File Structure

```
IoM-Arch-Optimizer-Web/
├── .github/workflows/
│   └── ci.yml                      ← Enhanced with tests
├── src/
│   ├── tests/                            ← All tests live here
│   │   ├── setup.js                      ← Global test setup
│   │   ├── game_data.test.js             ← 6 tests (constants)
│   │   ├── calculateUpgradeCost.test.js  ← 18 tests (cost function)
│   │   ├── capEnforcement.test.js        ← 23 tests (critical caps)
│   │   ├── ascensionLocks.test.js        ← 28 tests (unlock logic)
│   │   └── blockAndCurrency.test.js      ← 13 tests (data structures)
│   ├── game_data.js                      ← Application code (85% covered)
│   ├── store.js                    ← Application code (TODO: Add tests)
│   ├── utils/
│   │   ├── optimizer.js            ← TODO: Add tests
│   │   └── pathfinder_engine.js    ← TODO: Add tests
│   └── ...
├── vitest.config.js                ← Test configuration
├── package.json                    ← Test scripts added
├── WASM_BUILD_GUIDE.md             ← WASM documentation
└── TESTING_SETUP.md                ← This file
```

---

## Quick Reference

### Run Tests
```bash
npm test                  # Run once
npm run test:watch        # Watch mode
npm run test:ui           # Visual UI
```

### Write New Tests
```javascript
// src/tests/your-feature.test.js
import { describe, it, expect } from 'vitest';
import { yourFunction } from '../your-feature.js';

describe('Your Feature', () => {
  it('should do something', () => {
    expect(yourFunction()).toBe(expectedValue);
  });
});
```

### Debug Failing Tests
```bash
# Run with --reporter=verbose
npx vitest --reporter=verbose

# Run single test file
npx vitest src/game_data.test.js

# Update snapshots
npx vitest -u
```

---

## CI Badge (Optional)

Add to README.md:
```markdown
[![CI](https://github.com/your-username/IoM-Arch-Optimizer-Web/actions/workflows/ci.yml/badge.svg)](https://github.com/your-username/IoM-Arch-Optimizer-Web/actions/workflows/ci.yml)
```

---

## Next Steps

1. ✅ **Done:** Test framework setup
2. ✅ **Done:** CI integration  
3. ✅ **Done:** Game constants tests (6 tests)
4. ✅ **Done:** calculateUpgradeCost tests (18 tests)
5. ✅ **Done:** Cap enforcement tests (23 tests)
6. ✅ **Done:** Ascension locks & unlock requirements (28 tests)
7. ✅ **Done:** Block/currency data structures (13 tests)
8. ✅ **Done:** game_data.js comprehensive coverage (107 tests, 93% coverage)
9. ⏳ **Next:** Write tests for `store.js` (state management)
10. ⏳ **Next:** Write tests for `optimizer.js` (optimization logic)
11. ⏳ **Next:** Write tests for `pathfinder_engine.js` (progression logic)
12. 💭 **Future:** Component tests (React Testing Library)
13. 💭 **Future:** E2E tests (Playwright)

---

## Questions?

- **"Why 6 tests?"** - Started with critical constants. More tests coming.
- **"Why not test React components?"** - Business logic first, UI later.
- **"Can I skip tests?"** - No, CI will fail. Fix or remove broken tests.
- **"How do I test async code?"** - Use `async`/`await` in test functions.
- **"What about code coverage?"** - Run `npm run test:coverage` to generate report.

---

**Status:** Testing infrastructure is production-ready. Add more tests as you develop new features.
