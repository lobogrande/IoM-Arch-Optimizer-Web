// ==============================================================================
// Script: src/utils/optimizerFactory.js
// Description: Factory for creating optimizer instances based on strategy.
//              Allows switching between different optimization algorithms.
// ==============================================================================

import { SuccessiveHalvingOptimizer } from './successiveHalvingOptimizer';
// import { BayesianOptimizer } from './bayesianOptimizer'; // TODO: Implement in Week 2

/**
 * Available optimizer strategies
 */
export const OPTIMIZER_STRATEGIES = {
    SUCCESSIVE_HALVING: 'successive-halving',
    BAYESIAN: 'bayesian' // Coming soon
};

/**
 * Create an optimizer instance based on the selected strategy
 * 
 * @param {string} strategy - One of OPTIMIZER_STRATEGIES
 * @param {EngineWorkerPool} workerPool - Worker pool for running simulations
 * @param {Object} playerState - Player state to sync to workers
 * @param {Object} settings - Optimization settings (statsList, bounds, etc.)
 * @param {Function} onProgress - Progress callback
 * @returns {OptimizerBase} Optimizer instance
 */
export function createOptimizer(strategy, workerPool, playerState, settings, onProgress) {
    switch (strategy) {
        case OPTIMIZER_STRATEGIES.SUCCESSIVE_HALVING:
            return new SuccessiveHalvingOptimizer(workerPool, playerState, settings, onProgress);
        
        case OPTIMIZER_STRATEGIES.BAYESIAN:
            // TODO: Implement in Week 2
            throw new Error('Bayesian optimizer not yet implemented. Coming soon!');
        
        default:
            console.warn(`Unknown optimizer strategy: ${strategy}. Falling back to Successive Halving.`);
            return new SuccessiveHalvingOptimizer(workerPool, playerState, settings, onProgress);
    }
}

/**
 * Get human-readable name for a strategy
 */
export function getStrategyName(strategy) {
    switch (strategy) {
        case OPTIMIZER_STRATEGIES.SUCCESSIVE_HALVING:
            return 'Standard Optimizer';
        case OPTIMIZER_STRATEGIES.BAYESIAN:
            return 'Experimental Optimizer (Beta)';
        default:
            return 'Unknown Strategy';
    }
}

/**
 * Get description for a strategy
 */
export function getStrategyDescription(strategy) {
    switch (strategy) {
        case OPTIMIZER_STRATEGIES.SUCCESSIVE_HALVING:
            return 'Proven 3-phase grid search. Thoroughly tests 6,000-10,000 builds.';
        case OPTIMIZER_STRATEGIES.BAYESIAN:
            return 'Intelligent search using machine learning. Tests fewer builds but aims for same quality.';
        default:
            return '';
    }
}
