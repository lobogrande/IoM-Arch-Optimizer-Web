// ==============================================================================
// Script: src/utils/optimizer.js
// Description: Client-side equivalent of parallel_worker.py. Houses the 
//              Web Worker pool, grid generation (backtracking), and Auto-Scaler.
// ==============================================================================

/**
 * Custom Web Worker Pool to max out the client's CPU cores.
 */
export class EngineWorkerPool {
    constructor(size) {
        // Leave 1 core free for the React UI thread to prevent browser lockups
        const maxCores = navigator.hardwareConcurrency || 4;
        this.size = size || Math.max(1, maxCores - 1);
        
        this.workers = [ ];
        this.idleWorkers = [ ];
        this.taskQueue = [ ];
        this.callbacks = new Map();
        this.taskIdSeq = 0;
        this.readyCount = 0;
    }

    // Spawns Pyodide workers and waits for them to compile the Python environment
    async init(onReady, onProgress) {
        for (let i = 0; i < this.size; i++) {
            const w = new Worker('/engine_worker.js');
            w.onmessage = (e) => {
                if (e.data.type === 'READY') {
                    this.readyCount++;
                    this.idleWorkers.push(w);
                    if (onProgress) onProgress(this.readyCount, this.size);
                    if (this.readyCount === this.size && onReady) onReady();
                    this.pump();
                } else if (e.data.type === 'RESULT' || e.data.type === 'ERROR') {
                    const cb = this.callbacks.get(e.data.taskId);
                    if (cb) {
                        this.callbacks.delete(e.data.taskId);
                        cb(e.data);
                    }
                    this.idleWorkers.push(w);
                    this.pump(); // Worker is free, immediately grab next task
                } else if (e.data.type === 'STATUS') {
                    // console.log(`Worker ${i} status:`, e.data.payload);
                }
            };
            this.workers.push(w);
        }
    }

    pump() {
        if (this.idleWorkers.length === 0 || this.taskQueue.length === 0) return;
        const w = this.idleWorkers.pop();
        const task = this.taskQueue.shift();
        w.postMessage(task.msg);
    }

    // Returns a promise that resolves when the worker finishes the Python simulation
    runTask(state_dict, test_stats) {
        return new Promise((resolve, reject) => {
            const id = ++this.taskIdSeq;
            this.callbacks.set(id, (data) => {
                if (data.type === 'ERROR') reject(new Error(data.payload));
                else resolve(data.payload);
            });
            this.taskQueue.push({ msg: { command: 'RUN_TASK', taskId: id, state_dict, test_stats } });
            this.pump();
        });
    }

    terminate() {
        this.workers.forEach(w => w.terminate());
        this.workers = [ ];
        this.idleWorkers = [ ];
        this.taskQueue = [ ];
        this.callbacks.clear();
    }
}

/**
 * Recursively generates valid stat combinations within boundaries.
 * Directly translated from parallel_worker.py generate_distributions.
 */
export function generateDistributions(statsList, totalBudget, step, bounds = null) {
    const distributions = [ ];

    function backtrack(idx, currentSum, currentDist) {
        if (idx === statsList.length - 1) {
            const remainder = totalBudget - currentSum;
            if (bounds) {
                const [minV, maxV] = bounds[statsList[idx]];
                if (remainder < minV || remainder > maxV) return;
            } else if (remainder < 0) {
                return;
            }

            distributions.push({ ...currentDist, [statsList[idx]]: remainder });
            return;
        }

        const statName = statsList[idx];
        const minV = bounds ? bounds[statName][0] : 0;
        const maxV = bounds ? bounds[statName][1] : totalBudget;
        const maxPossible = Math.min(maxV, totalBudget - currentSum);

        for (let val = minV; val <= maxPossible; val += step) {
            backtrack(idx + 1, currentSum + val, { ...currentDist, [statName]: val });
        }
    }

    backtrack(0, 0, { });
    return distributions;
}

/**
 * Calculates the exact number of runs executed through Successive Halving drops.
 */
export function getExpectedRuns(builds, maxIter) {
    if (builds <= 20 || maxIter <= 10) return builds * maxIter;
    
    const r1 = Math.max(1, Math.floor(maxIter * 0.15));
    const r2 = Math.max(1, Math.floor(maxIter * 0.35));
    const r3 = maxIter - r1 - r2;
    
    let runs = builds * r1;
    const b2 = Math.max(3, Math.floor(builds * 0.20));
    runs += b2 * r2;
    const b3 = Math.max(3, Math.floor(b2 * 0.10));
    runs += b3 * r3;
    
    return runs;
}

/**
 * Dynamically finds the tightest Step Size that completes within the Target Time limit.
 * Directly translated from parallel_worker.py get_optimal_step_profile.
 */
export function getOptimalStepProfile(statsList, budget, bounds, simsPerSecond, targetTimeSeconds, iterP1 = 25, iterP2 = 50, iterP3 = 100) {
    const freeStats = statsList.filter(s => bounds[s][0] !== bounds[s][1]);
    const numFree = freeStats.length;
    
    const effectiveSimsSec = Math.max(1.0, parseFloat(simsPerSecond));
    let bestProfile = null;
    
    // Start from the finest possible step and get coarser until it safely fits the time budget
    for (let step1 = 3; step1 <= Math.max(100, budget + 1); step1++) {
        
        // Compress Phase 2 bounding boxes dynamically based on coarse size
        let step2;
        if (step1 <= 15) step2 = Math.max(2, Math.floor(step1 / 3));
        else if (step1 <= 30) step2 = Math.max(2, Math.floor(step1 / 2.5));
        else if (step1 <= 50) step2 = Math.max(2, Math.floor(step1 / 2));
        else step2 = Math.max(2, Math.floor(step1 / 1.5));
            
        // DYNAMIC PHASE 3: With 7 free stats, a radius of 2 explodes into millions of combinations.
        // We allow the engine to fallback to a tighter radius (1) if it cannot fit the time limit.
        const p3Configs = [ [2, 1],[1, 1], [2, 2] ];
        
        for (const[p3Radius, step3] of p3Configs) {
            const p1Builds = generateDistributions(statsList, budget, step1, bounds).length;
            const p1Sims = getExpectedRuns(p1Builds, iterP1);
            
            let p2Builds = 0, p3Builds = 0;
            
            // Positive-Shifted Bounds with Edge-Clipping Factor
            if (numFree > 0) {
                const p2MockBounds = { };
                const p3MockBounds = { };
                freeStats.forEach(s => {
                    p2MockBounds[s] =[0, 2 * step1];
                    p3MockBounds[s] =[0, 2 * p3Radius];
                });
                
                const p2Budget = Math.floor((numFree * step1) / step2) * step2;
                const rawP2Builds = generateDistributions(freeStats, p2Budget, step2, p2MockBounds).length;
                
                const p3Budget = Math.floor((numFree * p3Radius) / step3) * step3;
                const rawP3Builds = generateDistributions(freeStats, p3Budget, step3, p3MockBounds).length;
                
                const EDGE_CLIP = 0.25;
                p2Builds = Math.max(1, Math.floor(rawP2Builds * EDGE_CLIP));
                p3Builds = Math.max(1, Math.floor(rawP3Builds * EDGE_CLIP));
            }
                
            const p2Sims = getExpectedRuns(p2Builds, iterP2);
            const p3Sims = getExpectedRuns(p3Builds, iterP3);
            
            const totalEstimatedBuilds = p1Builds + p2Builds + p3Builds;
            const totalExpectedSims = p1Sims + p2Sims + p3Sims;
            
            // Add a flat 3.0s penalty for Pool spin-up/teardown overhead
            const estimatedSeconds = (totalExpectedSims / effectiveSimsSec) + 3.0;
            
            let timeStr = "";
            if (estimatedSeconds < 60) {
                timeStr = `~${Math.floor(estimatedSeconds)} seconds`;
            } else {
                timeStr = `~${(estimatedSeconds / 60).toFixed(1)} minutes`;
            }
                
            bestProfile = {
                step_1: step1,
                step_2: step2,
                step_3: step3,
                p3_radius: p3Radius,
                builds: totalEstimatedBuilds,
                eta_seconds: estimatedSeconds,
                time_label: timeStr
            };
            
            // STRICT BUFFER: Enforce a strict 20% safety margin (0.80) to guarantee completion
            if (estimatedSeconds <= (targetTimeSeconds * 0.80)) {
                return bestProfile;
            }
        }
    }
    return bestProfile;
}
