// Tests for optimizer.js - Pure utility functions
import { describe, it, expect } from 'vitest';
import {
  generateDistributions,
  countDistributions,
  getExpectedRuns,
  getOptimalStepProfile,
  topUpBuild
} from '../utils/optimizer.js';

describe('[CRITICAL] Optimizer - generateDistributions', () => {
  it('should generate all valid stat distributions within budget', () => {
    const statsList = ['Str', 'Agi'];
    const budget = 10;
    const step = 5;
    
    const distributions = generateDistributions(statsList, budget, step);
    
    // With step=5 and budget=10, valid distributions are:
    // {Str: 0, Agi: 10}, {Str: 5, Agi: 5}, {Str: 10, Agi: 0}
    expect(distributions.length).toBe(3);
    
    // Verify all distributions sum to budget
    distributions.forEach(dist => {
      const sum = statsList.reduce((acc, stat) => acc + dist[stat], 0);
      expect(sum).toBe(budget);
    });
  });

  it('should handle single stat case', () => {
    const statsList = ['Str'];
    const budget = 20;
    const step = 5;
    
    const distributions = generateDistributions(statsList, budget, step);
    
    // Single stat: all budget goes to that stat
    expect(distributions.length).toBe(1);
    expect(distributions[0]).toEqual({ Str: 20 });
  });

  it('should respect stat bounds (min/max)', () => {
    const statsList = ['Str', 'Agi'];
    const budget = 10;
    const step = 5;
    const bounds = {
      Str: [5, 10],  // Str must be between 5 and 10
      Agi: [0, 10]
    };
    
    const distributions = generateDistributions(statsList, budget, step, bounds);
    
    // Valid distributions with bounds:
    // {Str: 5, Agi: 5}, {Str: 10, Agi: 0}
    expect(distributions.length).toBe(2);
    
    distributions.forEach(dist => {
      expect(dist.Str).toBeGreaterThanOrEqual(5);
      expect(dist.Str).toBeLessThanOrEqual(10);
      expect(dist.Agi).toBeGreaterThanOrEqual(0);
      expect(dist.Agi).toBeLessThanOrEqual(10);
    });
  });

  it('should handle step size correctly', () => {
    const statsList = ['Str', 'Agi'];
    const budget = 20;
    const step = 10;
    
    const distributions = generateDistributions(statsList, budget, step);
    
    // With step=10 and budget=20:
    // {Str: 0, Agi: 20}, {Str: 10, Agi: 10}, {Str: 20, Agi: 0}
    expect(distributions.length).toBe(3);
    
    // Verify all values are multiples of step
    distributions.forEach(dist => {
      statsList.forEach(stat => {
        expect(dist[stat] % step).toBe(0);
      });
    });
  });

  it('should return empty array when bounds make distribution impossible', () => {
    const statsList = ['Str', 'Agi'];
    const budget = 10;
    const step = 5;
    const bounds = {
      Str: [6, 10],  // Min 6
      Agi: [6, 10]   // Min 6 - impossible with budget 10!
    };
    
    const distributions = generateDistributions(statsList, budget, step, bounds);
    
    expect(distributions.length).toBe(0);
  });

  it('should handle three-stat distributions', () => {
    const statsList = ['Str', 'Agi', 'Per'];
    const budget = 10;
    const step = 5;
    
    const distributions = generateDistributions(statsList, budget, step);
    
    expect(distributions.length).toBeGreaterThan(0);
    
    // Verify all distributions sum to budget
    distributions.forEach(dist => {
      const sum = dist.Str + dist.Agi + dist.Per;
      expect(sum).toBe(budget);
    });
  });
});

describe('[CRITICAL] Optimizer - countDistributions', () => {
  it('should match generateDistributions length', () => {
    const statsList = ['Str', 'Agi', 'Per'];
    const budget = 20;
    const step = 5;
    
    const distributions = generateDistributions(statsList, budget, step);
    const count = countDistributions(statsList, budget, step);
    
    expect(count).toBe(distributions.length);
  });

  it('should count with bounds correctly', () => {
    const statsList = ['Str', 'Agi'];
    const budget = 10;
    const step = 5;
    const bounds = {
      Str: [5, 10],
      Agi: [0, 10]
    };
    
    const distributions = generateDistributions(statsList, budget, step, bounds);
    const count = countDistributions(statsList, budget, step, bounds);
    
    expect(count).toBe(distributions.length);
    expect(count).toBe(2); // {Str: 5, Agi: 5}, {Str: 10, Agi: 0}
  });

  it('should return 0 when no valid distributions exist', () => {
    const statsList = ['Str', 'Agi'];
    const budget = 10;
    const step = 5;
    const bounds = {
      Str: [6, 10],
      Agi: [6, 10]
    };
    
    const count = countDistributions(statsList, budget, step, bounds);
    
    expect(count).toBe(0);
  });

  it('should handle large counts efficiently (no array allocation)', () => {
    const statsList = ['Str', 'Agi', 'Per', 'Int', 'Luck'];
    const budget = 100;
    const step = 5;
    
    // This would create a huge array if using generateDistributions
    // countDistributions should handle it efficiently
    const count = countDistributions(statsList, budget, step);
    
    expect(count).toBeGreaterThan(0);
    expect(typeof count).toBe('number');
  });
});

describe('[CRITICAL] Optimizer - getExpectedRuns', () => {
  it('should return builds * maxIter for small cases', () => {
    const builds = 20;
    const maxIter = 10;
    
    const expectedRuns = getExpectedRuns(builds, maxIter);
    
    // Small cases: no successive halving
    expect(expectedRuns).toBe(builds * maxIter);
    expect(expectedRuns).toBe(200);
  });

  it('should use successive halving for large cases', () => {
    const builds = 100;
    const maxIter = 100;
    
    const expectedRuns = getExpectedRuns(builds, maxIter);
    
    // With successive halving, runs < builds * maxIter
    expect(expectedRuns).toBeLessThan(builds * maxIter);
    expect(expectedRuns).toBeGreaterThan(0);
  });

  it('should calculate successive halving correctly', () => {
    const builds = 100;
    const maxIter = 100;
    
    // Manual calculation:
    // r1 = floor(100 * 0.15) = 15
    // r2 = floor(100 * 0.35) = 35
    // r3 = 100 - 15 - 35 = 50
    // Round 1: 100 builds * 15 iters = 1500
    // Round 2: floor(100 * 0.20) = 20 builds * 35 iters = 700
    // Round 3: floor(20 * 0.10) = 2 builds * 50 iters = 100 (but min 3!)
    //          max(3, 2) = 3 builds * 50 iters = 150
    // Total: 1500 + 700 + 150 = 2350
    
    const expectedRuns = getExpectedRuns(builds, maxIter);
    expect(expectedRuns).toBe(2350);
  });

  it('should handle edge case with 21 builds (triggers successive halving)', () => {
    const builds = 21;
    const maxIter = 11;
    
    const expectedRuns = getExpectedRuns(builds, maxIter);
    
    // Just over threshold: should use successive halving
    expect(expectedRuns).toBeLessThan(builds * maxIter);
  });

  it('should enforce minimum 3 builds in final round', () => {
    const builds = 50;
    const maxIter = 100;
    
    const expectedRuns = getExpectedRuns(builds, maxIter);
    
    // b3 = max(3, floor(floor(50 * 0.20) * 0.10))
    // b3 = max(3, floor(10 * 0.10)) = max(3, 1) = 3
    expect(expectedRuns).toBeGreaterThan(0);
  });
});

describe('[CRITICAL] Optimizer - topUpBuild', () => {
  it('should fill under-budget builds to exact budget', () => {
    const build = { Str: 5, Agi: 3, Per: 0 };  // Initialize Per to 0
    const statsList = ['Str', 'Agi', 'Per'];
    const totalBudget = 20;
    const effectiveCaps = { Str: 50, Agi: 50, Per: 25 };
    const bounds = {
      Str: [0, 50],
      Agi: [0, 50],
      Per: [0, 25]
    };
    
    const result = topUpBuild(build, statsList, totalBudget, effectiveCaps, bounds);
    
    // Should add missing 12 points
    const sum = result.Str + result.Agi + result.Per;
    expect(sum).toBe(totalBudget);
  });

  it('should respect effective caps when topping up', () => {
    const build = { Str: 40, Agi: 0 };
    const statsList = ['Str', 'Agi'];
    const totalBudget = 60;
    const effectiveCaps = { Str: 50, Agi: 50 }; // Str capped at 50
    const bounds = {
      Str: [0, 50],
      Agi: [0, 50]
    };
    
    const result = topUpBuild(build, statsList, totalBudget, effectiveCaps, bounds);
    
    // Should add 10 to Str (hitting cap), then 10 to Agi
    expect(result.Str).toBe(50);
    expect(result.Agi).toBe(10);
  });

  it('should skip locked stats (min === max)', () => {
    const build = { Str: 10, Agi: 5, Per: 0 };  // Initialize Per to 0
    const statsList = ['Str', 'Agi', 'Per'];
    const totalBudget = 30;
    const effectiveCaps = { Str: 50, Agi: 50, Per: 25 };
    const bounds = {
      Str: [10, 10],  // Locked at 10
      Agi: [0, 50],
      Per: [0, 25]
    };
    
    const result = topUpBuild(build, statsList, totalBudget, effectiveCaps, bounds);
    
    // Should not modify locked Str
    expect(result.Str).toBe(10);
    // Should add missing 15 points to Agi and/or Per
    const sum = result.Str + result.Agi + result.Per;
    expect(sum).toBe(totalBudget);
  });

  it('should prioritize stats with higher existing values', () => {
    const build = { Str: 20, Agi: 5, Per: 0 };
    const statsList = ['Str', 'Agi', 'Per'];
    const totalBudget = 40;
    const effectiveCaps = { Str: 50, Agi: 50, Per: 25 };
    const bounds = {
      Str: [0, 50],
      Agi: [0, 50],
      Per: [0, 25]
    };
    
    const result = topUpBuild(build, statsList, totalBudget, effectiveCaps, bounds);
    
    // Should prioritize Str (highest value), then Agi, then Per
    // Missing 15 points
    expect(result.Str).toBeGreaterThanOrEqual(20);
    const sum = result.Str + result.Agi + result.Per;
    expect(sum).toBe(totalBudget);
  });

  it('should handle already-full builds (no changes needed)', () => {
    const build = { Str: 10, Agi: 10 };
    const statsList = ['Str', 'Agi'];
    const totalBudget = 20;
    const effectiveCaps = { Str: 50, Agi: 50 };
    const bounds = {
      Str: [0, 50],
      Agi: [0, 50]
    };
    
    const result = topUpBuild(build, statsList, totalBudget, effectiveCaps, bounds);
    
    // Should not modify already-full build
    expect(result).toEqual(build);
  });

  it('should handle null build gracefully', () => {
    const result = topUpBuild(null, ['Str'], 20, { Str: 50 }, { Str: [0, 50] });
    
    expect(result).toBeNull();
  });

  it('should respect bounds maximum over effective caps', () => {
    const build = { Str: 10 };
    const statsList = ['Str'];
    const totalBudget = 50;
    const effectiveCaps = { Str: 100 }; // High cap
    const bounds = {
      Str: [0, 30]  // But user limited to 30
    };
    
    const result = topUpBuild(build, statsList, totalBudget, effectiveCaps, bounds);
    
    // Should respect bounds max (30), not effective cap (100)
    expect(result.Str).toBeLessThanOrEqual(30);
  });
});

describe('[CRITICAL] Optimizer - getOptimalStepProfile', () => {
  it('should return a valid profile within time budget', () => {
    const statsList = ['Str', 'Agi', 'Per', 'Int', 'Luck'];
    const budget = 100;
    const bounds = {
      Str: [0, 50],
      Agi: [0, 50],
      Per: [0, 25],
      Int: [0, 25],
      Luck: [0, 25]
    };
    const simsPerSecond = 15;
    const targetTimeSeconds = 60;
    
    const profile = getOptimalStepProfile(statsList, budget, bounds, simsPerSecond, targetTimeSeconds);
    
    expect(profile).not.toBeNull();
    expect(profile).toHaveProperty('step_1');
    expect(profile).toHaveProperty('step_2');
    expect(profile).toHaveProperty('step_3');
    expect(profile).toHaveProperty('p3_radius');
    expect(profile).toHaveProperty('eta_seconds');
    expect(profile.step_1).toBeGreaterThanOrEqual(3);
  });

  it('should prefer profiles with adequate candidate counts', () => {
    const statsList = ['Str', 'Agi'];
    const budget = 50;
    const bounds = {
      Str: [0, 50],
      Agi: [0, 50]
    };
    const simsPerSecond = 10;
    const targetTimeSeconds = 120;
    
    const profile = getOptimalStepProfile(statsList, budget, bounds, simsPerSecond, targetTimeSeconds);
    
    // Should have reasonable candidate count (not 1, not 100k)
    expect(profile.p1_candidates).toBeGreaterThan(0);
  });

  it('should return fallback profile if no option fits time budget', () => {
    const statsList = ['Str', 'Agi', 'Per', 'Int', 'Luck'];
    const budget = 100;
    const bounds = {
      Str: [0, 50],
      Agi: [0, 50],
      Per: [0, 25],
      Int: [0, 25],
      Luck: [0, 25]
    };
    const simsPerSecond = 1; // Very slow
    const targetTimeSeconds = 1; // Impossible budget
    
    const profile = getOptimalStepProfile(statsList, budget, bounds, simsPerSecond, targetTimeSeconds);
    
    // Should still return best available profile
    expect(profile).not.toBeNull();
    expect(profile.eta_seconds).toBeGreaterThan(targetTimeSeconds);
  });

  it('should handle locked stats (some stats have min === max)', () => {
    const statsList = ['Str', 'Agi', 'Per'];
    const budget = 50;
    const bounds = {
      Str: [20, 20],  // Locked
      Agi: [0, 50],
      Per: [0, 25]
    };
    const simsPerSecond = 15;
    const targetTimeSeconds = 60;
    
    const profile = getOptimalStepProfile(statsList, budget, bounds, simsPerSecond, targetTimeSeconds);
    
    // Should handle locked stats gracefully
    expect(profile).not.toBeNull();
  });

  it('should adapt step sizes for high-dimensional spaces (7+ stats)', () => {
    const statsList = ['Str', 'Agi', 'Per', 'Int', 'Luck', 'Div', 'Corr', 'Unspent'];
    const budget = 100;
    const bounds = {
      Str: [0, 50], Agi: [0, 50], Per: [0, 25], Int: [0, 25],
      Luck: [0, 25], Div: [0, 10], Corr: [0, 10], Unspent: [0, 9999]
    };
    const simsPerSecond = 15;
    const targetTimeSeconds = 120;
    
    const profile = getOptimalStepProfile(statsList, budget, bounds, simsPerSecond, targetTimeSeconds);
    
    // With 8 free variables, step_2 should be tighter (higher value relative to step_1)
    expect(profile).not.toBeNull();
    expect(profile.step_2).toBeGreaterThan(0);
  });
});
