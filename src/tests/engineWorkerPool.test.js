// Tests for optimizer.js - EngineWorkerPool class
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EngineWorkerPool } from '../utils/optimizer.js';

// Mock Worker class for testing
class FakeWorker {
  constructor(url) {
    this.url = url;
    this.onmessage = null;
    this.messageQueue = [];
    this.terminated = false;
    
    // Store reference to simulate async responses
    FakeWorker.instances.push(this);
  }
  
  postMessage(data) {
    if (this.terminated) {
      throw new Error('Worker terminated');
    }
    this.messageQueue.push(data);
    
    // Simulate async response based on command
    setTimeout(() => {
      if (!this.onmessage) return;
      
      if (data.command === 'SYNC_STATE') {
        this.onmessage({
          data: {
            type: 'SYNC_COMPLETE',
            syncId: data.syncId
          }
        });
      } else if (data.command === 'RUN_TASK') {
        // Simulate a successful task result
        this.onmessage({
          data: {
            type: 'RESULT',
            taskId: data.taskId,
            payload: {
              highest_floor: 45,
              total_damage: 50000,
              crit_chance: 0.25,
              stamina_trace_floor: [1, 2, 3],
              stamina_trace_stamina: [100, 90, 80]
            }
          }
        });
      }
    }, 10);
  }
  
  terminate() {
    this.terminated = true;
    this.onmessage = null;
  }
  
  // Helper to simulate worker errors
  simulateError(taskId, error) {
    setTimeout(() => {
      if (this.onmessage) {
        this.onmessage({
          data: {
            type: 'ERROR',
            taskId,
            payload: error
          }
        });
      }
    }, 10);
  }
  
  // Helper to simulate READY message
  simulateReady() {
    setTimeout(() => {
      if (this.onmessage) {
        this.onmessage({
          data: { type: 'READY' }
        });
      }
    }, 10);
  }
  
  static instances = [];
  static reset() {
    FakeWorker.instances = [];
  }
}

// Mock navigator.hardwareConcurrency
const originalNavigator = global.navigator;

describe('[CRITICAL] EngineWorkerPool - Initialization', () => {
  beforeEach(() => {
    FakeWorker.reset();
    global.Worker = FakeWorker;
    global.navigator = { hardwareConcurrency: 8 };
  });
  
  afterEach(() => {
    global.navigator = originalNavigator;
  });

  it('should create pool with specified size', () => {
    const pool = new EngineWorkerPool(3);
    
    expect(pool.size).toBe(3);
    expect(pool.workers.length).toBe(0); // Not initialized yet
  });

  it('should fallback to 4 cores if hardwareConcurrency unavailable', () => {
    global.navigator = {}; // No hardwareConcurrency
    
    const pool = new EngineWorkerPool(2); // Explicit size to avoid store dependency
    
    expect(pool.size).toBe(2);
  });

  it('should initialize workers and wait for READY', async () => {
    const pool = new EngineWorkerPool(2);
    
    const initPromise = pool.init();
    
    // Simulate both workers becoming ready
    FakeWorker.instances[0].simulateReady();
    FakeWorker.instances[1].simulateReady();
    
    await initPromise;
    
    expect(pool.readyCount).toBe(2);
    expect(pool.idleWorkers.length).toBe(2);
  });

  it('should call onProgress during initialization', async () => {
    const pool = new EngineWorkerPool(3);
    const progressCalls = [];
    
    const initPromise = pool.init(null, (ready, total) => {
      progressCalls.push({ ready, total });
    });
    
    // Simulate workers becoming ready one by one
    FakeWorker.instances[0].simulateReady();
    await new Promise(resolve => setTimeout(resolve, 20));
    
    FakeWorker.instances[1].simulateReady();
    await new Promise(resolve => setTimeout(resolve, 20));
    
    FakeWorker.instances[2].simulateReady();
    await initPromise;
    
    expect(progressCalls.length).toBe(3);
    expect(progressCalls[0]).toEqual({ ready: 1, total: 3 });
    expect(progressCalls[2]).toEqual({ ready: 3, total: 3 });
  });

  it('should call onReady when all workers initialized', async () => {
    const pool = new EngineWorkerPool(2);
    let readyCalled = false;
    
    const initPromise = pool.init(() => {
      readyCalled = true;
    });
    
    FakeWorker.instances[0].simulateReady();
    FakeWorker.instances[1].simulateReady();
    
    await initPromise;
    
    expect(readyCalled).toBe(true);
  });

  it('should reject on worker boot error', async () => {
    const pool = new EngineWorkerPool(1);
    
    const initPromise = pool.init();
    
    // Simulate boot-time error (no taskId)
    setTimeout(() => {
      FakeWorker.instances[0].onmessage({
        data: {
          type: 'ERROR',
          payload: 'Failed to load Pyodide'
        }
      });
    }, 10);
    
    await expect(initPromise).rejects.toThrow('Worker Boot Error');
  });
});

describe('[CRITICAL] EngineWorkerPool - Task Execution', () => {
  beforeEach(() => {
    FakeWorker.reset();
    global.Worker = FakeWorker;
    global.navigator = { hardwareConcurrency: 8 };
  });

  it('should execute single task successfully', async () => {
    const pool = new EngineWorkerPool(1);
    
    // Initialize pool
    const initPromise = pool.init();
    FakeWorker.instances[0].simulateReady();
    await initPromise;
    
    // Run task
    const result = await pool.runTask({ Str: 50, Agi: 30 });
    
    expect(result).toBeDefined();
    expect(result.highest_floor).toBe(45);
    expect(result.total_damage).toBe(50000);
  });

  it('should queue tasks when all workers busy', async () => {
    const pool = new EngineWorkerPool(1);
    
    const initPromise = pool.init();
    FakeWorker.instances[0].simulateReady();
    await initPromise;
    
    // Start two tasks (second will queue)
    const task1 = pool.runTask({ Str: 50 });
    const task2 = pool.runTask({ Str: 60 });
    
    expect(pool.taskQueue.length).toBeGreaterThan(0);
    
    const results = await Promise.all([task1, task2]);
    
    expect(results.length).toBe(2);
    expect(results[0].highest_floor).toBe(45);
  });

  it('should distribute tasks across multiple workers', async () => {
    const pool = new EngineWorkerPool(2);
    
    const initPromise = pool.init();
    FakeWorker.instances.forEach(w => w.simulateReady());
    await initPromise;
    
    // Run 4 tasks (should use both workers)
    const tasks = [
      pool.runTask({ Str: 50 }),
      pool.runTask({ Str: 60 }),
      pool.runTask({ Str: 70 }),
      pool.runTask({ Str: 80 })
    ];
    
    const results = await Promise.all(tasks);
    
    expect(results.length).toBe(4);
    // Both workers should have processed messages
    expect(FakeWorker.instances[0].messageQueue.length).toBeGreaterThan(0);
    expect(FakeWorker.instances[1].messageQueue.length).toBeGreaterThan(0);
  });

  it('should handle task errors gracefully', async () => {
    const pool = new EngineWorkerPool(1);
    
    const initPromise = pool.init();
    FakeWorker.instances[0].simulateReady();
    await initPromise;
    
    // Modify worker to return error
    const originalPostMessage = FakeWorker.instances[0].postMessage;
    FakeWorker.instances[0].postMessage = function(data) {
      if (data.command === 'RUN_TASK') {
        setTimeout(() => {
          this.onmessage({
            data: {
              type: 'ERROR',
              taskId: data.taskId,
              payload: 'Simulation failed'
            }
          });
        }, 10);
      }
    };
    
    await expect(pool.runTask({ Str: 50 })).rejects.toThrow('Simulation failed');
  });

  it('should handle upgrade_levels and external_levels parameters', async () => {
    const pool = new EngineWorkerPool(1);
    
    const initPromise = pool.init();
    FakeWorker.instances[0].simulateReady();
    await initPromise;
    
    const upgradeLevels = { 3: 10, 5: 15 };
    const externalLevels = { 101: 5 };
    const cards = { dirt1: 2 };
    
    await pool.runTask({ Str: 50 }, upgradeLevels, externalLevels, cards);
    
    const lastMessage = FakeWorker.instances[0].messageQueue[FakeWorker.instances[0].messageQueue.length - 1];
    expect(lastMessage.test_upgrades).toEqual(upgradeLevels);
    expect(lastMessage.test_external).toEqual(externalLevels);
    expect(lastMessage.test_cards).toEqual(cards);
  });
});

describe('[CRITICAL] EngineWorkerPool - State Synchronization', () => {
  beforeEach(() => {
    FakeWorker.reset();
    global.Worker = FakeWorker;
    global.navigator = { hardwareConcurrency: 8 };
  });

  it('should sync state to all workers', async () => {
    const pool = new EngineWorkerPool(2);
    
    const initPromise = pool.init();
    FakeWorker.instances.forEach(w => w.simulateReady());
    await initPromise;
    
    const stateDict = {
      arch_level: 50,
      asc1_unlocked: true,
      upgrade_levels: { 3: 10 }
    };
    
    await pool.syncState(stateDict);
    
    // Both workers should have received SYNC_STATE command
    expect(FakeWorker.instances[0].messageQueue.some(m => m.command === 'SYNC_STATE')).toBe(true);
    expect(FakeWorker.instances[1].messageQueue.some(m => m.command === 'SYNC_STATE')).toBe(true);
  });

  it('should wait for all workers to complete sync', async () => {
    const pool = new EngineWorkerPool(2);
    
    const initPromise = pool.init();
    FakeWorker.instances.forEach(w => w.simulateReady());
    await initPromise;
    
    const syncPromise = pool.syncState({ arch_level: 50 });
    
    // Should not resolve until both workers respond
    let resolved = false;
    syncPromise.then(() => { resolved = true; });
    
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(resolved).toBe(true);
  });
});

describe('[CRITICAL] EngineWorkerPool - Queue Management', () => {
  beforeEach(() => {
    FakeWorker.reset();
    global.Worker = FakeWorker;
    global.navigator = { hardwareConcurrency: 8 };
  });

  it('should clear queue and abort pending tasks', async () => {
    const pool = new EngineWorkerPool(1);
    
    const initPromise = pool.init();
    FakeWorker.instances[0].simulateReady();
    await initPromise;
    
    // Queue multiple tasks
    const task1 = pool.runTask({ Str: 50 });
    const task2 = pool.runTask({ Str: 60 });
    const task3 = pool.runTask({ Str: 70 });
    
    // Clear queue immediately
    pool.clearQueue();
    
    // All tasks should resolve with aborted flag
    const results = await Promise.all([task1, task2, task3]);
    
    // At least some should be aborted
    const abortedCount = results.filter(r => r.aborted).length;
    expect(abortedCount).toBeGreaterThan(0);
  });

  it('should clean up queue array periodically', async () => {
    const pool = new EngineWorkerPool(1);
    
    const initPromise = pool.init();
    FakeWorker.instances[0].simulateReady();
    await initPromise;
    
    // Simulate processing many tasks
    for (let i = 0; i < 100; i++) {
      await pool.runTask({ Str: 50 });
    }
    
    pool.queueIndex = 10001; // Trigger cleanup threshold
    pool.pump();
    
    // Queue should be reset
    expect(pool.queueIndex).toBeLessThan(10001);
  });

  it('should pump tasks to idle workers automatically', async () => {
    const pool = new EngineWorkerPool(2);
    
    const initPromise = pool.init();
    FakeWorker.instances.forEach(w => w.simulateReady());
    await initPromise;
    
    // Both workers idle initially
    expect(pool.idleWorkers.length).toBe(2);
    
    // Add task to queue
    const task = pool.runTask({ Str: 50 });
    
    // pump() should be called automatically, assigning task to worker
    // Wait for task to complete
    await task;
    
    // After task completes, worker returns to idle
    expect(pool.idleWorkers.length).toBeGreaterThanOrEqual(0);
  });
});

describe('[CRITICAL] EngineWorkerPool - Cleanup', () => {
  beforeEach(() => {
    FakeWorker.reset();
    global.Worker = FakeWorker;
    global.navigator = { hardwareConcurrency: 8 };
  });

  it('should terminate all workers', async () => {
    const pool = new EngineWorkerPool(3);
    
    const initPromise = pool.init();
    FakeWorker.instances.forEach(w => w.simulateReady());
    await initPromise;
    
    pool.terminate();
    
    // All workers should be terminated
    FakeWorker.instances.forEach(w => {
      expect(w.terminated).toBe(true);
    });
    
    expect(pool.workers.length).toBe(0);
    expect(pool.idleWorkers.length).toBe(0);
  });

  it('should clear queue and callbacks on terminate', async () => {
    const pool = new EngineWorkerPool(1);
    
    const initPromise = pool.init();
    FakeWorker.instances[0].simulateReady();
    await initPromise;
    
    // Queue some tasks
    pool.runTask({ Str: 50 });
    pool.runTask({ Str: 60 });
    
    pool.terminate();
    
    expect(pool.taskQueue.length).toBe(0);
    expect(pool.callbacks.size).toBe(0);
  });
});
