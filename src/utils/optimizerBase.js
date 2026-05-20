// ==============================================================================
// Script: src/utils/optimizerBase.js
// Description: Base class for all optimizer strategies. Contains shared
//              functionality used by both Successive Halving and Bayesian
//              optimization approaches.
// ==============================================================================

import { generateDistributions, countDistributions, getExpectedRuns } from './optimizer';

/**
 * Abstract base class for optimizer strategies.
 * Provides common functionality for worker pool management, metrics calculation,
 * and progress tracking.
 */
export class OptimizerBase {
    constructor(workerPool, playerState, settings, onProgress) {
        this.workerPool = workerPool;
        this.playerState = playerState;
        this.settings = settings;
        this.onProgress = onProgress;
        
        // Statistics tracking
        this.totalSimulationsRun = 0;
        this.startTime = null;
        this.hardAbortTriggered = false;
    }

    /**
     * Main optimization entry point - must be implemented by subclasses
     */
    async optimize() {
        throw new Error('optimize() must be implemented by subclass');
    }

    /**
     * Shared: Generate stat distributions using backtracking
     * Used by both optimizers for candidate generation
     */
    generateStatDistribution(statsList, totalBudget, step, bounds) {
        return generateDistributions(statsList, totalBudget, step, bounds);
    }

    /**
     * Shared: Count distributions without allocating arrays
     * Used for ETA calculations
     */
    countStatDistributions(statsList, totalBudget, step, bounds) {
        return countDistributions(statsList, totalBudget, step, bounds);
    }

    /**
     * Shared: Calculate expected simulation count for successive halving
     */
    getExpectedSimulationCount(builds, maxIterations) {
        return getExpectedRuns(builds, maxIterations);
    }

    /**
     * Shared: Evaluate a batch of candidates in parallel
     * Returns results with metrics calculated
     */
    async evaluateParallel(candidates, iterations, phaseName = 'eval', onPhaseProgress = null) {
        const results = [];
        const totalTasks = candidates.length * iterations;
        let completedTasks = 0;

        const promises = [];

        for (const candidate of candidates) {
            const testStats = { ...candidate, ...this.settings.fixedStats };

            for (let i = 0; i < iterations; i++) {
                const p = this.workerPool.runTask(testStats).then(result => {
                    if (result.aborted) return null;

                    completedTasks++;
                    this.totalSimulationsRun++;

                    if (onPhaseProgress) {
                        onPhaseProgress(completedTasks, totalTasks);
                    }

                    // Check for timeout
                    if (this.settings.timeLimitSeconds && this.startTime) {
                        const elapsed = (Date.now() - this.startTime) / 1000;
                        if (elapsed >= this.settings.timeLimitSeconds && !this.hardAbortTriggered) {
                            console.warn(`[TIMEOUT] Hard abort triggered after ${elapsed}s`);
                            this.hardAbortTriggered = true;
                            this.workerPool.clearQueue();
                        }
                    }

                    return { candidate, result };
                });

                promises.push(p);
            }
        }

        const rawResults = await Promise.all(promises);
        
        // Filter out aborted results and aggregate by candidate
        const aggregated = {};
        
        rawResults.forEach(item => {
            if (!item) return;
            
            const key = JSON.stringify(item.candidate);
            if (!aggregated[key]) {
                aggregated[key] = {
                    candidate: item.candidate,
                    sumTarget: 0,
                    sumFloor: 0,
                    runs: 0,
                    floors: [],
                    metricsSum: {}
                };
            }

            const agg = aggregated[key];
            const targetMetric = this.settings.targetMetric || 'xp_per_min';
            
            agg.sumTarget += (item.result[targetMetric] || 0);
            agg.sumFloor += (item.result.highest_floor || 0);
            agg.runs += 1;
            agg.floors.push(item.result.highest_floor || 0);

            // Aggregate all metrics
            for (const [mk, mv] of Object.entries(item.result)) {
                if (mk !== 'stamina_trace_floor' && mk !== 'stamina_trace_stamina') {
                    agg.metricsSum[mk] = (agg.metricsSum[mk] || 0) + mv;
                }
            }
        });

        // Convert aggregated results to array
        return Object.values(aggregated).map(agg => ({
            candidate: agg.candidate,
            avgScore: agg.runs > 0 ? agg.sumTarget / agg.runs : 0,
            avgFloor: agg.runs > 0 ? agg.sumFloor / agg.runs : 0,
            floors: agg.floors,
            runs: agg.runs,
            avgMetrics: Object.fromEntries(
                Object.entries(agg.metricsSum).map(([k, v]) => [k, v / agg.runs])
            )
        }));
    }

    /**
     * Shared: Update progress (throttled by UI)
     */
    updateProgress(phase, roundNumber, totalRounds, current, total, message = '') {
        if (this.onProgress) {
            this.onProgress(phase, roundNumber, totalRounds, current, total, message);
        }
    }

    /**
     * Shared: Select top N candidates from results
     */
    selectTopCandidates(results, count) {
        const sorted = [...results].sort((a, b) => b.avgScore - a.avgScore);
        return sorted.slice(0, count);
    }

    /**
     * Shared: Get best single result
     */
    getBest(results) {
        if (!results || results.length === 0) return null;
        return results.reduce((best, current) => 
            current.avgScore > best.avgScore ? current : best
        );
    }

    /**
     * Shared: Format final results for UI
     */
    formatResults(bestResult, allResults) {
        if (!bestResult) {
            return { bestDist: null, summary: null };
        }

        const allScores = allResults
            .filter(r => r.runs > 0)
            .map(r => r.avgScore)
            .sort((a, b) => b - a);

        const absMaxFloor = bestResult.floors.length 
            ? Math.max(...bestResult.floors) 
            : 0;
        
        const absMaxChance = bestResult.floors.length
            ? bestResult.floors.filter(f => f === absMaxFloor).length / bestResult.floors.length
            : 0;

        const sortedFloors = [...bestResult.floors].sort((a, b) => a - b);
        const medianFloor = sortedFloors[Math.floor(sortedFloors.length / 2)];

        return {
            bestDist: bestResult.candidate,
            summary: {
                [this.settings.targetMetric || 'xp_per_min']: bestResult.avgScore,
                avg_floor: bestResult.avgFloor,
                abs_max_floor: absMaxFloor,
                abs_max_chance: absMaxChance,
                worst_val: allScores.length > 0 ? allScores[allScores.length - 1] : 0,
                avg_val: allScores.length > 0 ? allScores.reduce((a, b) => a + b) / allScores.length : 0,
                runner_up_val: allScores.length > 1 ? allScores[1] : 0,
                floors: bestResult.floors,
                avg_metrics: bestResult.avgMetrics,
                total_simulations: this.totalSimulationsRun,
                wall_clock_seconds: this.startTime ? (Date.now() - this.startTime) / 1000 : 0
            }
        };
    }

    /**
     * Shared: Check if time limit exceeded
     */
    isTimeLimitExceeded() {
        if (!this.settings.timeLimitSeconds || !this.startTime) {
            return false;
        }
        const elapsed = (Date.now() - this.startTime) / 1000;
        return elapsed >= this.settings.timeLimitSeconds;
    }
}
