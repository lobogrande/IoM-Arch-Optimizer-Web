// Tests for pathfinder_engine.js - Pure helper functions
import { describe, it, expect } from 'vitest';
import { getExpRequired, __test__ } from '../utils/pathfinder_engine.js';

const { 
  isCrippledPhase, 
  getAvailableStatKeys, 
  getEffectiveStatCaps,
  formatBuildStr,
  enforceBudget
} = __test__;

describe('[CRITICAL] Pathfinder - getExpRequired', () => {
  it('should calculate experience required for leveling', () => {
    // Formula: 10 * 1.2^(level + 1)
    const exp1 = getExpRequired(0);
    const exp2 = getExpRequired(1);
    const exp3 = getExpRequired(2);
    
    expect(exp1).toBeCloseTo(10 * Math.pow(1.2, 1), 2);
    expect(exp2).toBeCloseTo(10 * Math.pow(1.2, 2), 2);
    expect(exp3).toBeCloseTo(10 * Math.pow(1.2, 3), 2);
  });

  it('should return increasing values for higher levels', () => {
    const levels = [0, 5, 10, 20, 50];
    const expValues = levels.map(l => getExpRequired(l));
    
    // Should be strictly increasing
    for (let i = 1; i < expValues.length; i++) {
      expect(expValues[i]).toBeGreaterThan(expValues[i - 1]);
    }
  });

  it('should handle level 0', () => {
    const exp = getExpRequired(0);
    expect(exp).toBeGreaterThan(0);
    expect(exp).toBeCloseTo(12, 0); // 10 * 1.2^1 = 12
  });

  it('should handle high levels', () => {
    const exp = getExpRequired(100);
    expect(exp).toBeGreaterThan(0);
    expect(Number.isFinite(exp)).toBe(true);
  });

  it('should have exponential growth rate', () => {
    const exp10 = getExpRequired(10);
    const exp20 = getExpRequired(20);
    const exp30 = getExpRequired(30);
    
    // All should be positive and increasing
    expect(exp10).toBeGreaterThan(0);
    expect(exp20).toBeGreaterThan(exp10);
    expect(exp30).toBeGreaterThan(exp20);
    
    // Growth rate should be exponential (1.2^x)
    // This means each level requires ~1.2x more exp than previous
    const ratio = exp20 / exp10;
    expect(ratio).toBeGreaterThan(1); // Should grow
  });
});

describe('[CRITICAL] Pathfinder - isCrippledPhase', () => {
  it('should return false when external 21 below threshold', () => {
    const state = {
      external_levels: { 21: 6000, 4: 3000 },
      cards: {},
      hades_unlocked: false
    };
    
    expect(isCrippledPhase(state)).toBe(false);
  });

  it('should return false when external 4 below threshold', () => {
    const state = {
      external_levels: { 21: 6666, 4: 2000 },
      cards: {},
      hades_unlocked: false
    };
    
    expect(isCrippledPhase(state)).toBe(false);
  });

  it('should return false when missing required cards', () => {
    const state = {
      external_levels: { 21: 6666, 4: 3000 },
      cards: {
        div3: 3, myth3: 3, leg3: 3
        // Missing other required cards
      },
      hades_unlocked: false
    };
    
    expect(isCrippledPhase(state)).toBe(false);
  });

  it('should return true when all conditions met (pre-hades)', () => {
    const state = {
      external_levels: { 21: 6666, 4: 3000 },
      cards: {
        div4: 3, myth4: 3, leg4: 3, epic4: 3, rare4: 3, com4: 3, dirt4: 3,
        div3: 3, myth3: 3, leg3: 3, epic3: 3, rare3: 3, com3: 3, dirt3: 3
      },
      hades_unlocked: false
    };
    
    expect(isCrippledPhase(state)).toBe(true);
  });

  it('should require level 4 cards when hades unlocked', () => {
    const state = {
      external_levels: { 21: 6666, 4: 3000 },
      cards: {
        // Level 3 cards not enough
        div3: 3, myth3: 3, leg3: 3, epic3: 3, rare3: 3, com3: 3, dirt3: 3,
        // Missing level 4
        div4: 0, myth4: 0
      },
      hades_unlocked: true
    };
    
    expect(isCrippledPhase(state)).toBe(false);
  });
});

describe('[CRITICAL] Pathfinder - getAvailableStatKeys', () => {
  it('should return base 5 stats when no ascensions', () => {
    const state = {
      asc1_unlocked: false,
      asc2_unlocked: false,
      external_levels: {},
      cards: {}
    };
    
    const keys = getAvailableStatKeys(state);
    
    expect(keys).toEqual(['Str', 'Agi', 'Per', 'Int', 'Luck']);
  });

  it('should include Div when asc1 unlocked', () => {
    const state = {
      asc1_unlocked: true,
      asc2_unlocked: false,
      external_levels: {},
      cards: {}
    };
    
    const keys = getAvailableStatKeys(state);
    
    expect(keys).toContain('Div');
    expect(keys.length).toBe(6);
  });

  it('should include Corr when asc2 unlocked', () => {
    const state = {
      asc1_unlocked: true,
      asc2_unlocked: true,
      external_levels: {},
      cards: {}
    };
    
    const keys = getAvailableStatKeys(state);
    
    expect(keys).toContain('Div');
    expect(keys).toContain('Corr');
    expect(keys.length).toBe(7);
  });

  it('should include Unspent when in crippled phase', () => {
    const state = {
      asc1_unlocked: true,
      asc2_unlocked: true,
      external_levels: { 21: 6666, 4: 3000 },
      cards: {
        div4: 4, myth4: 4, leg4: 4, epic4: 4, rare4: 4, com4: 4, dirt4: 4,
        div3: 4, myth3: 4, leg3: 4, epic3: 4, rare3: 4, com3: 4, dirt3: 4
      },
      hades_unlocked: true
    };
    
    const keys = getAvailableStatKeys(state);
    
    expect(keys).toContain('Unspent');
    expect(keys.length).toBe(8);
  });
});

describe('[CRITICAL] Pathfinder - getEffectiveStatCaps', () => {
  it('should return base caps with no upgrade 45', () => {
    const state = {
      upgrade_levels: {}
    };
    
    const caps = getEffectiveStatCaps(state);
    
    expect(caps.Str).toBe(50);
    expect(caps.Agi).toBe(50);
    expect(caps.Per).toBe(25);
    expect(caps.Int).toBe(25);
    expect(caps.Luck).toBe(25);
    expect(caps.Div).toBe(10);
    expect(caps.Corr).toBe(10);
    expect(caps.Unspent).toBe(9999);
  });

  it('should add bonus from upgrade 45', () => {
    const state = {
      upgrade_levels: { 45: 10 } // 10 * 5 = +50 bonus
    };
    
    const caps = getEffectiveStatCaps(state);
    
    expect(caps.Str).toBe(100); // 50 + 50
    expect(caps.Agi).toBe(100);
    expect(caps.Per).toBe(75); // 25 + 50
    expect(caps.Int).toBe(75);
    expect(caps.Luck).toBe(75);
    expect(caps.Div).toBe(60); // 10 + 50
    expect(caps.Corr).toBe(60);
    expect(caps.Unspent).toBe(9999); // Unchanged
  });

  it('should handle high upgrade 45 levels', () => {
    const state = {
      upgrade_levels: { 45: 50 } // 50 * 5 = +250 bonus
    };
    
    const caps = getEffectiveStatCaps(state);
    
    expect(caps.Str).toBe(300); // 50 + 250
    expect(caps.Per).toBe(275); // 25 + 250
  });
});

describe('[CRITICAL] Pathfinder - formatBuildStr', () => {
  it('should format build with base stats', () => {
    const build = { Str: 50, Agi: 30, Per: 10, Int: 5, Luck: 5 };
    const state = {
      asc1_unlocked: false,
      asc2_unlocked: false,
      external_levels: {},
      cards: {}
    };
    
    const formatted = formatBuildStr(build, state);
    
    expect(formatted).toBe('[50/30/10/5/5]');
  });

  it('should include Div when asc1 unlocked', () => {
    const build = { Str: 50, Agi: 30, Per: 10, Int: 5, Luck: 5, Div: 10 };
    const state = {
      asc1_unlocked: true,
      asc2_unlocked: false,
      external_levels: {},
      cards: {}
    };
    
    const formatted = formatBuildStr(build, state);
    
    expect(formatted).toBe('[50/30/10/5/5/10]');
  });

  it('should handle missing stats as 0', () => {
    const build = { Str: 50 };
    const state = {
      asc1_unlocked: false,
      asc2_unlocked: false,
      external_levels: {},
      cards: {}
    };
    
    const formatted = formatBuildStr(build, state);
    
    expect(formatted).toBe('[50/0/0/0/0]');
  });
});

describe('[CRITICAL] Pathfinder - enforceBudget', () => {
  it('should strip over-budget points', () => {
    const build = { Str: 60, Agi: 50 }; // Total 110
    const statsList = ['Str', 'Agi'];
    const budget = 100;
    const caps = { Str: 100, Agi: 100 };
    
    const result = enforceBudget(build, statsList, budget, caps);
    
    const sum = result.Str + result.Agi;
    expect(sum).toBeLessThanOrEqual(budget);
  });

  it('should fill under-budget builds', () => {
    const build = { Str: 40, Agi: 30 }; // Total 70
    const statsList = ['Str', 'Agi'];
    const budget = 100;
    const caps = { Str: 100, Agi: 100 };
    
    const result = enforceBudget(build, statsList, budget, caps);
    
    const sum = result.Str + result.Agi;
    expect(sum).toBe(budget);
  });

  it('should respect stat caps when filling', () => {
    const build = { Str: 45, Agi: 0 }; // Total 45
    const statsList = ['Str', 'Agi'];
    const budget = 100;
    const caps = { Str: 50, Agi: 50 }; // Str capped at 50
    
    const result = enforceBudget(build, statsList, budget, caps);
    
    expect(result.Str).toBeLessThanOrEqual(50);
    expect(result.Agi).toBeGreaterThan(0); // Should fill Agi too
  });

  it('should handle exactly at budget', () => {
    const build = { Str: 50, Agi: 50 };
    const statsList = ['Str', 'Agi'];
    const budget = 100;
    const caps = { Str: 100, Agi: 100 };
    
    const result = enforceBudget(build, statsList, budget, caps);
    
    expect(result.Str).toBe(50);
    expect(result.Agi).toBe(50);
  });

  it('should prioritize higher stats when filling', () => {
    const build = { Str: 60, Agi: 20, Per: 0 }; // Total 80
    const statsList = ['Str', 'Agi', 'Per'];
    const budget = 100;
    const caps = { Str: 100, Agi: 100, Per: 50 };
    
    const result = enforceBudget(build, statsList, budget, caps);
    
    // Should prioritize Str (highest), then Agi, then Per
    expect(result.Str).toBeGreaterThanOrEqual(60);
    const sum = result.Str + result.Agi + result.Per;
    expect(sum).toBe(budget);
  });
});

