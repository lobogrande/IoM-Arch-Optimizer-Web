// ==============================================================================
// Script: src/utils/optimizer.js
// Description: Client-side equivalent of parallel_worker.py. Houses the 
//              Web Worker pool, grid generation (backtracking), and Auto-Scaler.
import useStore from '../store';

// ==============================================================================

/**
 * Custom Web Worker Pool to gracefully manage the client's CPU cores.
 */
export class EngineWorkerPool {
    constructor(size) {
        const maxCores = navigator.hardwareConcurrency || 4;
        const profile = useStore.getState().cpuProfile || 'balanced';
        
        let activeCores = 1;
        if (size) {
            activeCores = size;
        } else if (profile === 'eco') {
            // Mobile Battery Saver: 25% of cores, capped at 2 maximum
            activeCores = Math.max(1, Math.min(2, Math.floor(maxCores * 0.25)));
        } else if (profile === 'max') {
            // Wind Tunnel Mode: All cores minus 1 for UI
            activeCores = Math.max(1, maxCores - 1); 
        } else {
            // Balanced: 50% of cores, heavily capped at 6 to prevent thermal runaway on 20+ thread CPUs
            activeCores = Math.max(1, Math.min(6, Math.floor(maxCores / 2)));
        }
        
        this.size = activeCores;
        
        this.workers = [ ];
        this.idleWorkers = [ ];
        this.taskQueue = [ ];
        this.callbacks = new Map();
        this.taskIdSeq = 0;
        this.readyCount = 0;
    }

    // Spawns Pyodide workers and waits for them to compile the Python environment
    init(onReady, onProgress) {
        return new Promise((resolve) => {
            for (let i = 0; i < this.size; i++) {
                const w = new Worker('/engine_worker.js');
                w.onmessage = (e) => {
                    if (e.data.type === 'READY') {
                        this.readyCount++;
                        this.idleWorkers.push(w);
                        if (onProgress) onProgress(this.readyCount, this.size);
                        
                        if (this.readyCount === this.size) {
                            if (onReady) onReady();
                            resolve(); // Unblocks React's 'await pool.init()'
                        }
                        this.pump();
                    } else if (e.data.type === 'RESULT' || e.data.type === 'ERROR') {
                        const cb = this.callbacks.get(e.data.taskId);
                        if (cb) {
                            this.callbacks.delete(e.data.taskId);
                            cb(e.data);
                        }
                        this.idleWorkers.push(w);
                        this.pump(); // Worker is free, immediately grab next task
                    } else if (e.data.type === 'SYNC_COMPLETE') {
                        const cb = this.callbacks.get(e.data.syncId);
                        if (cb) {
                            this.callbacks.delete(e.data.syncId);
                            cb();
                        }
                    }
                };
                this.workers.push(w);
            }
        });
    }

    async syncState(state_dict) {
        const promises =[];
        for (let i = 0; i < this.workers.length; i++) {
            promises.push(new Promise(resolve => {
                const syncId = 'sync_' + (++this.taskIdSeq);
                this.callbacks.set(syncId, resolve);
                this.workers[i].postMessage({ command: 'SYNC_STATE', syncId, state_dict });
            }));
        }
        await Promise.all(promises);
    }

    pump() {
        if (this.idleWorkers.length === 0 || this.taskQueue.length === 0) return;
        const w = this.idleWorkers.pop();
        const task = this.taskQueue.shift();
        w.postMessage(task.msg);
    }

    // Returns a promise that resolves when the worker finishes the Python simulation
    runTask(test_stats, test_upgrades = null, test_external = null, test_cards = null) {
        return new Promise((resolve, reject) => {
            const id = ++this.taskIdSeq;
            this.callbacks.set(id, (data) => {
                if (data.type === 'ERROR') reject(new Error(data.payload));
                else resolve(data.payload);
            });
            this.taskQueue.push({ msg: { command: 'RUN_TASK', taskId: id, test_stats, test_upgrades, test_external, test_cards } });
            this.pump();
        });
    }

    clearQueue() {
        // Instantly resolves all pending promises with an abort flag so Promise.all() unblocks!
        for (const task of this.taskQueue) {
            const cb = this.callbacks.get(task.msg.taskId);
            if (cb) {
                this.callbacks.delete(task.msg.taskId);
                cb({ type: 'RESULT', taskId: task.msg.taskId, payload: { aborted: true } });
            }
        }
        this.taskQueue = [ ];
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
 * Fast mathematical counter for combinations (prevents array allocation OOM crashes during ETA calculation)
 */
export function countDistributions(statsList, totalBudget, step, bounds = null) {
    let count = 0;

    function backtrack(idx, currentSum) {
        if (idx === statsList.length - 1) {
            const remainder = totalBudget - currentSum;
            if (bounds) {
                const[minV, maxV] = bounds[statsList[idx]];
                if (remainder >= minV && remainder <= maxV) count++;
            } else if (remainder >= 0) {
                count++;
            }
            return;
        }

        const statName = statsList[idx];
        const minV = bounds ? bounds[statName][0] : 0;
        const maxV = bounds ? bounds[statName][1] : totalBudget;
        const maxPossible = Math.min(maxV, totalBudget - currentSum);

        for (let val = minV; val <= maxPossible; val += step) {
            backtrack(idx + 1, currentSum + val);
        }
    }

    backtrack(0, 0);
    return count;
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
    
    let minSum = 0;
    statsList.forEach(s => { minSum += bounds[s][0]; });

    const effectiveSimsSec = Math.max(1.0, parseFloat(simsPerSecond));
    let bestProfile = null;
    
    for (let step1 = 3; step1 <= Math.max(100, budget + 1); step1++) {
        
        // --- PROPER MODULO ALIGNMENT FOR PHASE 1 ETA ---
        // We must subtract the absolute minimum starting floor of the entire grid
        // to ensure the remainder perfectly aligns with the step size!
        const remP1 = (budget - minSum) % step1;
        const p1Budget = budget - remP1;

        // --- PREVENT ASC2 DIMENSIONALITY EXPLOSION ---
        // If the player has 7 free variables, the Phase 2 box must be physically tighter 
        // to prevent combinations from exploding past 150+ seconds baseline.
        const divisor = numFree >= 6 ? 1.2 : 1.5;

        let step2;
        if (step1 <= 15) step2 = Math.max(2, Math.floor(step1 / 3));
        else if (step1 <= 30) step2 = Math.max(2, Math.floor(step1 / 2.5));
        else if (step1 <= 50) step2 = Math.max(2, Math.floor(step1 / 2));
        else step2 = Math.max(2, Math.floor(step1 / divisor));
            
        const p3Configs = [[2, 1], [1, 1], [2, 2], [1, 2] ];
        
        for (const [p3Radius, step3] of p3Configs) {
            // Use the memory-safe counter function!
            const p1Builds = countDistributions(statsList, p1Budget, step1, bounds);
            
            // If mathematically impossible to build arrays (modulo mismatch), skip it!
            if (p1Builds === 0) continue; 
            
            const p1Sims = getExpectedRuns(p1Builds, iterP1);
            let p2Builds = 0, p3Builds = 0;
            
            if (numFree > 0) {
                const p2MockBounds = {};
                const p3MockBounds = {};
                
                freeStats.forEach(s => {
                    // Respect the actual True Caps so Phase 2/3 ETA doesn't explode!
                    const trueCap = bounds[s][1] - bounds[s][0];
                    p2MockBounds[s] =[0, Math.min(trueCap, 2 * step1)];
                    p3MockBounds[s] =[0, Math.min(trueCap, 2 * p3Radius)];
                });
                
                const p2Budget = Math.floor((numFree * step1) / step2) * step2;
                const rawP2Builds = countDistributions(freeStats, p2Budget, step2, p2MockBounds);
                
                const p3Budget = Math.floor((numFree * p3Radius) / step3) * step3;
                const rawP3Builds = countDistributions(freeStats, p3Budget, step3, p3MockBounds);
                
                // Increased Edge Clip to 0.40 to make JS ETA calculations far more conservative
                const EDGE_CLIP = 0.40;
                p2Builds = Math.max(1, Math.floor(rawP2Builds * EDGE_CLIP));
                p3Builds = Math.max(1, Math.floor(rawP3Builds * EDGE_CLIP));
            }
                
            const p2Sims = getExpectedRuns(p2Builds, iterP2);
            const p3Sims = getExpectedRuns(p3Builds, iterP3);
            
            const totalEstimatedBuilds = p1Builds + p2Builds + p3Builds;
            const totalExpectedSims = p1Sims + p2Sims + p3Sims;
            
            const estimatedSeconds = (totalExpectedSims / effectiveSimsSec) + 3.0;
            
            let timeStr = "";
            if (estimatedSeconds < 60) {
                timeStr = `~${Math.floor(estimatedSeconds)} seconds`;
            } else {
                timeStr = `~${(estimatedSeconds / 60).toFixed(1)} minutes`;
            }
            
            // Track the safest profile found so far in case we never hit the strict time limit
            const currentProfile = {
                step_1: step1,
                step_2: step2,
                step_3: step3,
                p3_radius: p3Radius,
                builds: totalEstimatedBuilds,
                eta_seconds: estimatedSeconds,
                time_label: timeStr
            };

            // Keep tracking the absolute fastest profile we've seen so far as our fallback!
            // This guarantees if we miss the target, we return step_size 100, instead of getting stuck on step_size 3!
            if (!bestProfile || estimatedSeconds < bestProfile.eta_seconds) {
                bestProfile = currentProfile;
            }
            
            // STRICT BUFFER: Enforce a 35% safety margin (0.65) to absorb JS Garbage Collection spikes
            if (estimatedSeconds <= (targetTimeSeconds * 0.65)) {
                return currentProfile;
            }
        }
    }
    
    // Fallback: If no combination was fast enough (e.g., target time is 10s), return the fastest one we found
    return bestProfile;
}

/**
 * Runs a grid search phase using Successive Halving.
 * Directly translated from parallel_worker.py run_optimization_phase.
 */
export async function runOptimizationPhase(
    phaseName, targetMetric, statsList, budget, step, iterations, pool,
    fixedStats, bounds, timeLimitSeconds, globalStartTime, onProgress,
    seedDist = null
) {
    const dists = generateDistributions(statsList, budget, step, bounds);
    
    // ELITISM / SEED INJECTION: Ensure user's current build is always tested
    if (seedDist) {
        const seedKey = JSON.stringify(seedDist);
        const exists = dists.some(d => JSON.stringify(d) === seedKey);
        if (!exists) {
            dists.push(seedDist);
        }
    }
    
    if (!dists || dists.length === 0) return { bestDist: null, summary: null };

    const tracker = { };
    dists.forEach(d => {
        const key = JSON.stringify(d);
        tracker[key] = { dist: d, sumTarget: 0.0, sumFloor: 0.0, runs: 0, metricsSum: { }, floors: [ ], traces: { } };
    });

    let activeKeys = Object.keys(tracker);
    let rounds = [ ];
    if (dists.length <= 20 || iterations <= 10) {
        rounds = [ [iterations, 1.0] ];
    } else {
        const r1 = Math.max(1, Math.floor(iterations * 0.15));
        const r2 = Math.max(1, Math.floor(iterations * 0.35));
        const r3 = iterations - r1 - r2;
        rounds = [[r1, 0.20], [r2, 0.10], [r3, 1.0] ];
    }

    let hardAbortTriggered = false;

    for (let roundIdx = 0; roundIdx < rounds.length; roundIdx++) {
        if (activeKeys.length === 0 || hardAbortTriggered) break;

        const [runCount, keepRatio] = rounds[roundIdx];
        const totalTasks = activeKeys.length * runCount;
        let completedTasks = 0;

        const roundPromises = [ ];

        for (const key of activeKeys) {
            const testStats = { ...tracker[key].dist, ...fixedStats };

            for (let i = 0; i < runCount; i++) {
                // Shoot tiny task to Worker Pool (State is pre-cached!)
                const p = pool.runTask(testStats).then(result => {
                    if (result.aborted) return; // Skip dumped tasks

                    const tr = tracker[key];
                    tr.sumTarget += (result[targetMetric] || 0.0);
                    tr.sumFloor += (result.highest_floor || 0.0);
                    tr.runs += 1;
                    tr.floors.push(result.highest_floor || 0);

                    for (const [mk, mv] of Object.entries(result)) {
                        // total_time represents EXACT Arch Seconds spent, so we now include it in the averages!
                        if (mk !== 'stamina_trace_floor' && mk !== 'stamina_trace_stamina') {
                            tr.metricsSum[mk] = (tr.metricsSum[mk] || 0.0) + mv;
                        }
                    }

                    // Profile stamina traces per unique floor reached
                    if (result.highest_floor && result.stamina_trace_floor && !tr.traces[result.highest_floor]) {
                        tr.traces[result.highest_floor] = {
                            floor: result.stamina_trace_floor,
                            stamina: result.stamina_trace_stamina
                        };
                    }

                    completedTasks++;
                    if (onProgress) {
                        // The UI throttle handles the render rate, so we always pass the data up safely
                        onProgress(phaseName, roundIdx + 1, rounds.length, completedTasks, totalTasks);
                    }

                    // Mid-round abort check
                    if (globalStartTime && timeLimitSeconds) {
                        if ((Date.now() - globalStartTime) / 1000 >= timeLimitSeconds) {
                            if (!hardAbortTriggered) {
                                console.warn(`[TIMEOUT] Hard Abort triggered! Emptying worker queue...`);
                                hardAbortTriggered = true;
                                pool.clearQueue();
                            }
                        }
                    }
                });
                roundPromises.push(p);
            }
        }

        // The Engine Worker Pool internally bottlenecks execution to your exact hardware cores
        await Promise.all(roundPromises);

        // Sort & Drop Losers
        activeKeys.sort((a, b) => {
            const ta = tracker[a], tb = tracker[b];
            if (targetMetric === 'highest_floor') {
                const maxA = ta.floors.length ? Math.max(...ta.floors) : 0;
                const maxB = tb.floors.length ? Math.max(...tb.floors) : 0;
                if (maxA !== maxB) return maxB - maxA;
                const avgA = ta.floors.length ? ta.sumFloor / ta.floors.length : 0;
                const avgB = tb.floors.length ? tb.sumFloor / tb.floors.length : 0;
                return avgB - avgA;
            } else {
                const scoreA = ta.runs ? ta.sumTarget / ta.runs : 0;
                const scoreB = tb.runs ? tb.sumTarget / tb.runs : 0;
                if (scoreA !== scoreB) return scoreB - scoreA;
                const avgA = ta.floors.length ? ta.sumFloor / ta.floors.length : 0;
                const avgB = tb.floors.length ? tb.sumFloor / tb.floors.length : 0;
                return avgB - avgA;
            }
        });

        if (roundIdx < rounds.length - 1 && !hardAbortTriggered) {
            const keepCount = Math.max(3, Math.floor(activeKeys.length * keepRatio));
            activeKeys = activeKeys.slice(0, keepCount);
        }
    }

    if (activeKeys.length === 0) return { bestDist: null, summary: null };

    const bestKey = activeKeys[0];
    const bestData = tracker[bestKey];
    const bestDist = bestData.dist;
    const runsCompleted = Math.max(1, bestData.runs);

    const allScores = Object.values(tracker).filter(d => d.runs > 0).map(d => d.sumTarget / d.runs).sort((a, b) => b - a);
    const worst = allScores.length > 0 ? allScores[allScores.length - 1] : 0;
    const avgScore = allScores.length > 0 ? allScores.reduce((a,b)=>a+b,0) / allScores.length : 0;
    const runnerUp = allScores.length > 1 ? allScores[1] : (allScores.length > 0 ? allScores[0] : 0);

    const absMaxFloor = bestData.floors.length ? Math.max(...bestData.floors) : 0;
    const absMaxChance = bestData.floors.length ? (bestData.floors.filter(f => f === absMaxFloor).length / bestData.floors.length) : 0;

    const avgMetrics = { };
    for (const [mk, mv] of Object.entries(bestData.metricsSum)) {
        avgMetrics[mk] = mv / runsCompleted;
    }

    const sortedFloors = [...bestData.floors].sort((a, b) => a - b);
    const medianFloor = sortedFloors[Math.floor(sortedFloors.length / 2)];

    const summary = {
        [targetMetric]: bestData.sumTarget / runsCompleted,
        avg_floor: bestData.sumFloor / runsCompleted,
        abs_max_floor: absMaxFloor,
        abs_max_chance: absMaxChance,
        worst_val: worst,
        avg_val: avgScore,
        runner_up_val: runnerUp,
        floors: bestData.floors,
        avg_metrics: avgMetrics,
        stamina_trace_max: bestData.traces[absMaxFloor] || null,
        stamina_trace_median: bestData.traces[medianFloor] || null,
        stamina_trace: bestData.traces[medianFloor] || null // Backwards compatibility for old JSON saves
    };

    return { bestDist, summary };
}

/**
 * Ensures any points stripped by the Modulo Aligner are mathematically placed back into the build
 */
export function topUpBuild(build, statsList, totalBudget, effectiveCaps, bounds) {
    if (!build) return build;
    const b = { ...build };
    let currentSum = statsList.reduce((acc, s) => acc + (b[s] || 0), 0);
    let missing = totalBudget - currentSum;

    if (missing > 0) {
        // Only skip strictly exact-locked stats. Ranges/Mins/Maxes can absorb top-ups!
        const unlockedStats = statsList.filter(s => bounds[s][0] !== bounds[s][1]);
        unlockedStats.sort((s1, s2) => (b[s2] || 0) - (b[s1] || 0));

        for (const s of unlockedStats) {
            if (missing <= 0) break;
            // Respect the absolute maximum cap or the user's custom max bound!
            const maxAllowed = Math.min(effectiveCaps[s] || 0, bounds[s][1]);
            const room = maxAllowed - (b[s] || 0);
            if (room > 0) {
                const add = Math.min(room, missing);
                b[s] += add;
                missing -= add;
            }
        }
    }
    return b;
}
