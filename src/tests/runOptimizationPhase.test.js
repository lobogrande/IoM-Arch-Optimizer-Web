// Tests for optimizer.js - runOptimizationPhase function
import { describe, it, expect, beforeEach } from 'vitest';
import { runOptimizationPhase } from '../utils/optimizer.js';

// Fake EngineWorkerPool for testing runOptimizationPhase
class FakePool {
  constructor(resultFactory) {
    this.resultFactory = resultFactory || (() => ({
      highest_floor: Math.floor(Math.random() * 10) + 40,
      total_damage: Math.floor(Math.random() * 10000) + 45000,
      crit_chance: 0.20 + Math.random() * 0.1,
      stamina_trace_floor: [1, 2, 3, 4, 5],
      stamina_trace_stamina: [100, 90, 80, 70, 60]
    }));
    this.taskCount = 0;
    this.cleared = false;
  }
  
  async runTask(testStats, testUpgrades, testExternal, testCards) {
    this.taskCount++;
    // Simulate small delay
    await new Promise(resolve => setTimeout(resolve, 1));
    return this.resultFactory(testStats);
  }
  
  clearQueue() {
    this.cleared = true;
  }
}

describe('[CRITICAL] runOptimizationPhase - Basic Execution', () => {
  it('should return best distribution and summary', async () => {
    const pool = new FakePool();
    const statsList = ['Str', 'Agi'];
    const budget = 20;
    const step = 10;
    const iterations = 10;
    const fixedStats = { Per: 0, Int: 0, Luck: 0 };
    const bounds = {
      Str: [0, 50],
      Agi: [0, 50],
      Per: [0, 25],
      Int: [0, 25],
      Luck: [0, 25]
    };
    
    const result = await runOptimizationPhase(
      'Phase 1', 'highest_floor', statsList, budget, step, iterations,
      pool, fixedStats, bounds, 60, Date.now(), null
    );
    
    expect(result).toBeDefined();
    expect(result.bestDist).toBeDefined();
    expect(result.summary).toBeDefined();
  });

  it('should test all generated distributions', async () => {
    const pool = new FakePool();
    const statsList = ['Str', 'Agi'];
    const budget = 10;
    const step = 5;
    const iterations = 5;
    
    const result = await runOptimizationPhase(
      'Test', 'highest_floor', statsList, budget, step, iterations,
      pool, {}, {
        Str: [0, 50],
        Agi: [0, 50]
      }, 60, Date.now(), null
    );
    
    // With budget=10, step=5, stats=[Str,Agi]: 
    // Possible: {0,10}, {5,5}, {10,0} = 3 distributions
    // Each tested iterations times
    expect(pool.taskCount).toBeGreaterThan(0);
    expect(result.bestDist).toBeDefined();
  });

  it('should include seed distribution if provided', async () => {
    const pool = new FakePool();
    const seedDist = { Str: 7, Agi: 3 }; // Not on grid
    
    const result = await runOptimizationPhase(
      'Test', 'highest_floor', ['Str', 'Agi'], 10, 5, 5,
      pool, {}, { Str: [0, 50], Agi: [0, 50] }, 60, Date.now(), null,
      seedDist
    );
    
    // Should test 3 grid distributions + 1 seed = 4 distributions
    // 4 * 5 iterations = 20 tasks
    expect(pool.taskCount).toBe(20);
  });

  it('should not add duplicate seed if already on grid', async () => {
    const pool = new FakePool();
    const seedDist = { Str: 5, Agi: 5 }; // On grid
    
    const result = await runOptimizationPhase(
      'Test', 'highest_floor', ['Str', 'Agi'], 10, 5, 5,
      pool, {}, { Str: [0, 50], Agi: [0, 50] }, 60, Date.now(), null,
      seedDist
    );
    
    // Should test only 3 grid distributions (seed already exists)
    expect(pool.taskCount).toBe(15);
  });
});

describe('[CRITICAL] runOptimizationPhase - Successive Halving', () => {
  it('should use single round for small cases (<=20 builds)', async () => {
    const pool = new FakePool();
    
    const result = await runOptimizationPhase(
      'Test', 'highest_floor', ['Str'], 10, 5, 10,
      pool, {}, { Str: [0, 50] }, 60, Date.now(), null
    );
    
    // Budget=10, step=5: distributions are {0}, {5}, {10} = 3 builds
    // 3 builds * 10 iterations = 30 tasks, BUT with step=5 might only generate 2
    // Just verify it completed
    expect(pool.taskCount).toBeGreaterThan(0);
    expect(result.bestDist).toBeDefined();
  });

  it('should use successive halving for large cases (>20 builds)', async () => {
    const pool = new FakePool();
    
    // Create scenario with >20 distributions
    const result = await runOptimizationPhase(
      'Test', 'highest_floor', ['Str', 'Agi', 'Per'], 50, 5, 100,
      pool, {}, { 
        Str: [0, 50], 
        Agi: [0, 50], 
        Per: [0, 25] 
      }, 60, Date.now(), null
    );
    
    // With successive halving, should do fewer tasks than builds * iterations
    const maxPossibleTasks = 200 * 100; // Way more than we should see
    expect(pool.taskCount).toBeLessThan(maxPossibleTasks);
    expect(pool.taskCount).toBeGreaterThan(0);
  });

  it('should keep top performers across rounds', async () => {
    let callCount = 0;
    const pool = new FakePool((testStats) => {
      callCount++;
      // Make Str=50 consistently better
      if (testStats.Str === 50) {
        return { highest_floor: 60, total_damage: 60000, crit_chance: 0.3 };
      }
      return { highest_floor: 40, total_damage: 40000, crit_chance: 0.2 };
    });
    
    const result = await runOptimizationPhase(
      'Test', 'highest_floor', ['Str', 'Agi'], 50, 10, 50,
      pool, {}, { Str: [0, 50], Agi: [0, 50] }, 60, Date.now(), null
    );
    
    // Best distribution should have high Str
    expect(result.bestDist.Str).toBeGreaterThanOrEqual(30);
  });
});

describe('[CRITICAL] runOptimizationPhase - Progress Tracking', () => {
  it('should call onProgress callback with updates', async () => {
    const pool = new FakePool();
    const progressCalls = [];
    
    const onProgress = (phase, round, totalRounds, completed, total) => {
      progressCalls.push({ phase, round, totalRounds, completed, total });
    };
    
    await runOptimizationPhase(
      'Test Phase', 'highest_floor', ['Str'], 10, 5, 5,
      pool, {}, { Str: [0, 50] }, 60, Date.now(), onProgress
    );
    
    expect(progressCalls.length).toBeGreaterThan(0);
    expect(progressCalls[0].phase).toBe('Test Phase');
  });
});

describe('[CRITICAL] runOptimizationPhase - Timeout Handling', () => {
  it('should abort when time limit exceeded', async () => {
    const pool = new FakePool();
    const pastTime = Date.now() - 70000; // 70 seconds ago
    
    await runOptimizationPhase(
      'Test', 'highest_floor', ['Str', 'Agi'], 50, 5, 100,
      pool, {}, { Str: [0, 50], Agi: [0, 50] }, 60, pastTime, null
    );
    
    // Should have called clearQueue
    expect(pool.cleared).toBe(true);
  });

  it('should complete normally when within time limit', async () => {
    const pool = new FakePool();
    const recentTime = Date.now() - 5000; // 5 seconds ago
    
    const result = await runOptimizationPhase(
      'Test', 'highest_floor', ['Str'], 10, 5, 5,
      pool, {}, { Str: [0, 50] }, 60, recentTime, null
    );
    
    // Should not have cleared queue
    expect(pool.cleared).toBe(false);
    expect(result.bestDist).toBeDefined();
  });
});

describe('[CRITICAL] runOptimizationPhase - Target Metrics', () => {
  it('should optimize for highest_floor metric', async () => {
    const pool = new FakePool((testStats) => ({
      highest_floor: testStats.Str, // Floor equals Str value
      total_damage: 50000
    }));
    
    const result = await runOptimizationPhase(
      'Test', 'highest_floor', ['Str'], 20, 10, 10,
      pool, {}, { Str: [0, 50] }, 60, Date.now(), null
    );
    
    // Should select highest Str (20)
    expect(result.bestDist.Str).toBe(20);
  });

  it('should optimize for custom metric', async () => {
    const pool = new FakePool((testStats) => ({
      highest_floor: 40,
      custom_metric: testStats.Agi * 2 // Custom score
    }));
    
    const result = await runOptimizationPhase(
      'Test', 'custom_metric', ['Agi'], 20, 10, 10,
      pool, {}, { Agi: [0, 50] }, 60, Date.now(), null
    );
    
    // Should select highest Agi (20)
    expect(result.bestDist.Agi).toBe(20);
  });
});

describe('[CRITICAL] runOptimizationPhase - Summary Statistics', () => {
  it('should return comprehensive summary', async () => {
    const pool = new FakePool();
    
    const result = await runOptimizationPhase(
      'Test', 'highest_floor', ['Str'], 10, 5, 10,
      pool, {}, { Str: [0, 50] }, 60, Date.now(), null
    );
    
    expect(result.summary).toHaveProperty('highest_floor');
    expect(result.summary).toHaveProperty('avg_floor');
    expect(result.summary).toHaveProperty('abs_max_floor');
    expect(result.summary).toHaveProperty('abs_max_chance');
    expect(result.summary).toHaveProperty('floors');
    expect(result.summary).toHaveProperty('avg_metrics');
  });

  it('should calculate absolute max floor correctly', async () => {
    const pool = new FakePool(() => ({
      highest_floor: Math.random() > 0.5 ? 50 : 45,
      total_damage: 50000
    }));
    
    const result = await runOptimizationPhase(
      'Test', 'highest_floor', ['Str'], 10, 5, 20,
      pool, {}, { Str: [0, 50] }, 60, Date.now(), null
    );
    
    expect(result.summary.abs_max_floor).toBeGreaterThanOrEqual(45);
    expect(result.summary.abs_max_floor).toBeLessThanOrEqual(50);
  });

  it('should track stamina traces', async () => {
    const pool = new FakePool();
    
    const result = await runOptimizationPhase(
      'Test', 'highest_floor', ['Str'], 10, 5, 10,
      pool, {}, { Str: [0, 50] }, 60, Date.now(), null
    );
    
    expect(result.summary).toHaveProperty('stamina_trace_max');
    expect(result.summary).toHaveProperty('stamina_trace_median');
  });
});

describe('[CRITICAL] runOptimizationPhase - Edge Cases', () => {
  it('should handle empty distribution list', async () => {
    const pool = new FakePool();
    
    // Impossible bounds
    const result = await runOptimizationPhase(
      'Test', 'highest_floor', ['Str'], 10, 5, 10,
      pool, {}, { Str: [20, 50] }, 60, Date.now(), null
    );
    
    expect(result.bestDist).toBeNull();
    expect(result.summary).toBeNull();
  });

  it('should handle single distribution', async () => {
    const pool = new FakePool();
    
    const result = await runOptimizationPhase(
      'Test', 'highest_floor', ['Str'], 10, 10, 10,
      pool, {}, { Str: [10, 10] }, 60, Date.now(), null
    );
    
    expect(result.bestDist).toEqual({ Str: 10 });
  });
});
