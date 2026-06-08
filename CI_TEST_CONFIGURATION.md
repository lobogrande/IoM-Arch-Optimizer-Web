# Test Grouping and CI Configuration Guide

## Overview

Vitest supports powerful test filtering and grouping without external tools like Jenkins. Everything runs directly in GitHub Actions.

---

## Test Organization Strategies

### 1. File-Based Grouping (Current Approach)

Tests are already organized by module:

```
src/tests/
├── game_data.test.js           # Fast (6 tests, ~5ms)
├── calculateUpgradeCost.test.js # Fast (18 tests, ~10ms)
├── capEnforcement.test.js       # Fast (23 tests, ~12ms)
├── ascensionLocks.test.js       # Fast (28 tests, ~15ms)
└── blockAndCurrency.test.js     # Fast (13 tests, ~8ms)
```

**Run specific files:**
```bash
npx vitest src/tests/game_data.test.js
npx vitest src/tests/capEnforcement.test.js
```

---

### 2. Tag-Based Grouping (Recommended)

Add tags to test descriptions for fine-grained filtering:

```javascript
// CRITICAL tests - must pass for production
describe('[CRITICAL] enforceUpgradeCap', () => {
  it('should enforce caps', () => {
    // test
  });
});

// SLOW tests - take >1 second
describe('[SLOW] Pathfinder Engine', () => {
  it('should calculate optimal path', () => {
    // test
  });
});

// INTEGRATION tests - test multiple modules together  
describe('[INTEGRATION] Store + Optimizer', () => {
  it('should sync state correctly', () => {
    // test
  });
});
```

**Run by tag:**
```bash
npx vitest --grep="\\[CRITICAL\\]"      # Only critical tests
npx vitest --grep="\\[SLOW\\]"          # Only slow tests
npx vitest --grep="^(?!.*SLOW)"         # Exclude slow tests
```

---

### 3. Test Suites (test.each patterns)

Group similar tests with shared logic:

```javascript
describe('Cap Enforcement', () => {
  const testCases = [
    { upgId: 3, level: 100, expected: 50 },
    { upgId: 10, level: 50, expected: 25 },
    { upgId: 12, level: 10, expected: 5 },
  ];

  test.each(testCases)(
    'upgrade $upgId at level $level should cap to $expected',
    ({ upgId, level, expected }) => {
      expect(enforceUpgradeCap(upgId, level)).toBe(expected);
    }
  );
});
```

---

## CI Configuration Options

### Option 1: Fast CI (Current - Default)

**Goal:** Run all tests quickly on every commit

**Configuration:**
```yaml
# .github/workflows/ci.yml
- name: Run JavaScript tests
  run: npm test
```

**Pros:**
- Simple
- Fast (~1.3s for 88 tests)
- Catches regressions immediately

**Cons:**
- None currently (all tests are fast)

---

### Option 2: Tiered CI (For Future Slow Tests)

**Goal:** Fast feedback + comprehensive nightly tests

**Fast CI (on every PR):**
```yaml
- name: Run fast tests
  run: npx vitest --grep="^(?!.*SLOW)" --run
```

**Comprehensive CI (nightly/pre-release):**
```yaml
- name: Run all tests including slow ones
  run: npm test
  if: github.event_name == 'schedule' || contains(github.event.head_commit.message, '[full-test]')
```

---

### Option 3: Parallel CI Jobs

**Goal:** Run different test suites in parallel

```yaml
jobs:
  test-critical:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx vitest --grep="\\[CRITICAL\\]" --run
  
  test-integration:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx vitest --grep="\\[INTEGRATION\\]" --run
  
  test-unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx vitest --grep="^(?!.*(CRITICAL|INTEGRATION))" --run
```

**Pros:**
- Faster overall (parallel execution)
- Can fail fast on critical tests

**Cons:**
- More complex
- Uses more CI minutes

---

### Option 4: Conditional Test Running

**Goal:** Only run relevant tests based on what changed

```yaml
- name: Detect changes
  id: changes
  uses: dorny/paths-filter@v2
  with:
    filters: |
      game_data:
        - 'src/game_data.js'
      store:
        - 'src/store.js'
      optimizer:
        - 'src/utils/optimizer.js'

- name: Test game_data
  if: steps.changes.outputs.game_data == 'true'
  run: npx vitest src/tests/game_data.test.js src/tests/capEnforcement.test.js

- name: Test store
  if: steps.changes.outputs.store == 'true'
  run: npx vitest src/tests/store.test.js

- name: Test all (fallback)
  if: steps.changes.outputs.game_data != 'true' && steps.changes.outputs.store != 'true'
  run: npm test
```

---

## Recommended CI Strategy

For your project, I recommend:

### Phase 1: Current (Simple & Fast)
```yaml
- name: Run all tests
  run: npm test
```

**Why:** All 88 tests run in 1.3s. No need to complicate yet.

---

### Phase 2: When You Have Slow Tests

Add tags and split:

```yaml
# Fast tests on every commit
- name: Run fast tests
  run: npx vitest --grep="^(?!.*SLOW)" --run

# Full tests on main/release branches
- name: Run all tests
  if: github.ref == 'refs/heads/main' || startsWith(github.ref, 'refs/tags/')
  run: npm test
```

---

### Phase 3: Complex Test Suite

Use parallel jobs:

```yaml
jobs:
  test-unit:
    # Unit tests (fast)
  test-integration:
    # Integration tests (medium)
  test-e2e:
    # E2E tests (slow)
```

---

## Test Filtering Commands

### By File Pattern
```bash
npx vitest src/tests/game_data.test.js                    # Single file
npx vitest src/tests/cap*.test.js                         # Pattern match
npx vitest src/tests/{game_data,capEnforcement}.test.js  # Multiple files
```

### By Test Name
```bash
npx vitest -t "enforceUpgradeCap"              # Tests matching name
npx vitest -t "should enforce|should clamp"    # Regex pattern
```

### By Tag (requires tagged tests)
```bash
npx vitest --grep="\\[CRITICAL\\]"            # Only critical
npx vitest --grep="\\[UNIT\\]"                # Only unit tests
npx vitest --grep="^(?!.*SLOW)"               # Exclude slow tests
```

### By Coverage Threshold
```bash
npx vitest --coverage --coverage.lines=80     # Fail if <80% coverage
npx vitest --coverage --reporter=html         # HTML coverage report
```

---

## GitHub Actions Matrix Strategy

Run tests across multiple configurations:

```yaml
jobs:
  test:
    strategy:
      matrix:
        node-version: [18, 20, 22]
        os: [ubuntu-latest, windows-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
      - run: npm ci
      - run: npm test
```

**Not recommended for you:** Your app is browser-only, single Node version is fine.

---

## Watch Mode for Development

Vitest has excellent watch mode for local development:

```bash
npm run test:watch          # Re-run on file changes
npm run test:ui             # Visual browser UI
```

**Watch mode features:**
- Auto-runs related tests when files change
- Filters to specific files/tests
- Shows coverage in real-time
- Re-runs only failed tests

---

## Coverage Reporting in CI

### Generate Coverage Report
```yaml
- name: Run tests with coverage
  run: npx vitest --coverage

- name: Upload coverage to Codecov
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/coverage-final.json
```

### Enforce Coverage Thresholds
```javascript
// vitest.config.js
export default defineConfig({
  test: {
    coverage: {
      lines: 80,           // Require 80% line coverage
      functions: 75,       // Require 75% function coverage
      branches: 70,        // Require 70% branch coverage
      statements: 80,      // Require 80% statement coverage
    }
  }
});
```

---

## Custom Test Commands

Add to `package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest run --coverage",
    "test:critical": "vitest --grep=\"\\[CRITICAL\\]\" --run",
    "test:fast": "vitest --grep=\"^(?!.*SLOW)\" --run",
    "test:integration": "vitest --grep=\"\\[INTEGRATION\\]\" --run",
    "test:changed": "vitest related HEAD~1"
  }
}
```

---

## Summary

### Current Setup ✅
- **88 tests** in **1.3 seconds**
- All tests run on every commit
- Simple, fast, effective

### When to Add Complexity
- When tests exceed **5 seconds** total
- When you have **slow integration/E2E tests**
- When you need **test prioritization**

### No External Tools Needed
- ✅ All filtering happens in Vitest
- ✅ All CI runs in GitHub Actions
- ✅ No Jenkins, CircleCI, or other external services

**Recommendation:** Keep current simple approach until test suite grows significantly.
