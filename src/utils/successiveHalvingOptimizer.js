// ==============================================================================
// Script: src/utils/successiveHalvingOptimizer.js
// Description: Successive Halving optimizer strategy (current proven approach).
//              3-phase grid search with dropouts. This is the battle-tested
//              optimizer that has been in production.
// ==============================================================================

import { OptimizerBase } from './optimizerBase';
import { runOptimizationPhase, topUpBuild } from './optimizer';

/**
 * Successive Halving Optimizer
 * 
 * Uses a 3-phase approach:
 * - Phase 1: Coarse grid search (tests 6k-10k candidates)
 * - Phase 2: Refine around top 20% survivors
 * - Phase 3: Local neighborhood search around top 10%
 * 
 * This is the proven, production-ready optimizer.
 */
export class SuccessiveHalvingOptimizer extends OptimizerBase {
    async optimize() {
        this.startTime = Date.now();
        
        const {
            statsList,
            totalBudget,
            stepProfile,
            iterations,
            fixedStats,
            bounds,
            effectiveCaps,
            targetMetric,
            timeLimitSeconds,
            seedDist
        } = this.settings;

        // Phase 1: Coarse Grid Search
        console.log('[Successive Halving] Phase 1: Coarse grid search');
        
        const phase1Result = await runOptimizationPhase(
            'Phase 1',
            targetMetric,
            statsList,
            totalBudget,
            stepProfile.step_1,
            Math.floor(iterations.phase1 || iterations * 0.15),
            this.workerPool,
            fixedStats,
            bounds,
            timeLimitSeconds,
            this.startTime,
            (phase, round, totalRounds, current, total) => {
                this.updateProgress(phase, round, totalRounds, current, total);
            },
            seedDist
        );

        if (!phase1Result.bestDist || this.isTimeLimitExceeded()) {
            console.log('[Successive Halving] Stopped after Phase 1');
            return phase1Result;
        }

        // Top up Phase 1 result
        const bestP1 = topUpBuild(phase1Result.bestDist, statsList, totalBudget, effectiveCaps, bounds);

        // Phase 2: Refined Grid Search - Create tight bounds around Phase 1 winner
        console.log('[Successive Halving] Phase 2: Refinement');
        
        const boundsP2 = {};
        let lockedSumP2 = 0;
        statsList.forEach(s => {
            if (bounds[s][0] === bounds[s][1]) {
                // Stat is locked, keep exact bounds
                boundsP2[s] = bounds[s];
                lockedSumP2 += bounds[s][0];
            } else {
                // Create window around Phase 1 winner
                boundsP2[s] = [
                    Math.max(bounds[s][0], bestP1[s] - stepProfile.step_1),
                    Math.min(bounds[s][1], bestP1[s] + stepProfile.step_1)
                ];
            }
        });
        
        const p2Budget = totalBudget - ((totalBudget - lockedSumP2) % stepProfile.step_2);
        
        const phase2Result = await runOptimizationPhase(
            'Phase 2',
            targetMetric,
            statsList,
            p2Budget,
            stepProfile.step_2,
            Math.floor(iterations.phase2 || iterations * 0.35),
            this.workerPool,
            fixedStats,
            boundsP2,
            timeLimitSeconds,
            this.startTime,
            (phase, round, totalRounds, current, total) => {
                this.updateProgress(phase, round, totalRounds, current, total);
            }
        );

        if (!phase2Result.bestDist || this.isTimeLimitExceeded()) {
            console.log('[Successive Halving] Stopped after Phase 2');
            return phase2Result;
        }

        // Top up Phase 2 result
        const bestP2 = topUpBuild(phase2Result.bestDist, statsList, totalBudget, effectiveCaps, boundsP2);

        // Phase 3: Local Neighborhood Search - Create ultra-tight bounds around Phase 2 winner
        console.log('[Successive Halving] Phase 3: Local search');
        
        const boundsP3 = {};
        const p3Radius = stepProfile.p3_radius || Math.min(2, stepProfile.step_2);
        statsList.forEach(s => {
            if (bounds[s][0] === bounds[s][1]) {
                // Stat is locked, keep exact bounds
                boundsP3[s] = bounds[s];
            } else {
                // Create tiny window around Phase 2 winner
                boundsP3[s] = [
                    Math.max(bounds[s][0], bestP2[s] - p3Radius),
                    Math.min(bounds[s][1], bestP2[s] + p3Radius)
                ];
            }
        });
        
        const phase3Result = await runOptimizationPhase(
            `Phase 3 (Radius ±${p3Radius})`,
            targetMetric,
            statsList,
            totalBudget,
            stepProfile.step_3,
            Math.floor(iterations.phase3 || iterations * 0.50),
            this.workerPool,
            fixedStats,
            boundsP3,
            timeLimitSeconds,
            this.startTime,
            (phase, round, totalRounds, current, total) => {
                this.updateProgress(phase, round, totalRounds, current, total);
            }
        );

        // Top up the final build (restore modulo-stripped points)
        if (phase3Result.bestDist) {
            phase3Result.bestDist = topUpBuild(
                phase3Result.bestDist,
                statsList,
                totalBudget,
                effectiveCaps,
                bounds
            );
        }

        console.log('[Successive Halving] Complete!');
        
        // Attach phase scores for hill climb visualization
        // Extract just the target metric scores to avoid circular references
        phase3Result.phaseScores = {
            phase1: phase1Result.summary ? phase1Result.summary[targetMetric] : null,
            phase2: phase2Result.summary ? phase2Result.summary[targetMetric] : null,
            phase3: phase3Result.summary ? phase3Result.summary[targetMetric] : null
        };
        
        return phase3Result;
    }
}
