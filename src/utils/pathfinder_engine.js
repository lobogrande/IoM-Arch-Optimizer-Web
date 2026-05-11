// src/utils/pathfinder_engine.js

import { calculateUpgradeCost, UPGRADE_NAMES, UPGRADE_LEVEL_REQS, BLOCK_MIN_FLOORS, INTERNAL_UPGRADE_CAPS, ASC1_LOCKED_UPGS, ASC2_LOCKED_UPGS } from '../game_data';
import { generateDistributions, countDistributions } from './optimizer';

// XP Math deduced from player telemetry
export const getExpRequired = (level) => {
    return 10 * Math.pow(1.2, level + 1);
};

const FRAG_NAMES_UI = {
    'gems': 'Gems',
    'dirt': 'Dirt',
    'com': 'Common',
    'rare': 'Rare',
    'epic': 'Epic',
    'leg': 'Legendary',
    'myth': 'Mythic',
    'div': 'Divine'
};

// Maps fragment currency names to the exact result keys output by Pyodide
const FRAG_RATE_KEYS = {
    'dirt': 'frag_0_per_min',
    'com': 'frag_1_per_min',
    'rare': 'frag_2_per_min',
    'epic': 'frag_3_per_min',
    'leg': 'frag_4_per_min',
    'myth': 'frag_5_per_min',
    'div': 'frag_6_per_min'
};

/**
 * The Macro-Stepper Engine for Ascension 2
 */
const getAvailableStatKeys = (state) => {
    const keys =['Str', 'Agi', 'Per', 'Int', 'Luck'];
    if (state.asc1_unlocked) keys.push('Div'); // CRITICAL FIX: Restored missing Divinity stat
    if (state.asc2_unlocked) keys.push('Corr');
    return keys;
};

// Dynamic Cap Resolver (Handles base limits and Upgrade 45 limit breaks)
const getEffectiveStatCaps = (state) => {
    const capBonus = (state.upgrade_levels[45] || 0) * 5;
    return {
        Str: 50 + capBonus,
        Agi: 50 + capBonus,
        Per: 25 + capBonus,
        Int: 25 + capBonus,
        Luck: 25 + capBonus,
        Div: 10 + capBonus,
        Corr: 10 + capBonus
    };
};

// Formatter for logs
const formatBuildStr = (build, state) => {
    const stats = getAvailableStatKeys(state);
    return `[${stats.map(s => build[s] || 0).join('/')}]`;
};

// Universal helper to run a batch and average all yields (completely removes single-run UI/Bank divergence)
async function getSmoothedYields(pool, state, stats, samples = 3) {
    const tasks = Array.from({ length: samples }, () => pool.runTask(stats, state.upgrade_levels, state.external_levels, state.cards));
    const batchResults = await Promise.all(tasks);
    
    let avgYields = { };

    batchResults.forEach(res => {
        for (const[ key, val ] of Object.entries(res)) {
            if (typeof val === 'number') {
                avgYields[ key ] = (avgYields[ key ] || 0) + val;
            }
        }
    });

    Object.keys(avgYields).forEach(k => avgYields[ k ] /= samples);
    return avgYields;
}

// Strict budget enforcer to strip cheating/over-budget builds and fill under-budget builds
const enforceBudget = (build, statsList, budget, caps) => {
    const b = { ...build };
    let sum = statsList.reduce((acc, s) => acc + (b[s] || 0), 0);
    
    // Strip excess points if over budget
    if (sum > budget) {
        const sorted = [...statsList].sort((s1, s2) => (b[s2] || 0) - (b[s1] || 0));
        for (const s of sorted) {
            while (b[s] > 0 && sum > budget) {
                b[s]--;
                sum--;
            }
        }
    }
    
    // Top up missing points if under budget
    if (sum < budget) {
        const sorted =[...statsList].sort((s1, s2) => (b[s2] || 0) - (b[s1] || 0));
        for (const s of sorted) {
            const maxAllowed = Math.min(caps[s] || 0, budget);
            while ((b[s] || 0) < maxAllowed && sum < budget) {
                b[s] = (b[s] || 0) + 1;
                sum++;
            }
        }
    }
    return b;
};

// Fast Multi-Heuristic for Frag Farming (Saves 99% compute time vs Full Optimizer)
// Tests 4 targeted distributions of remaining points after maxing Perception
const getShadowFragYields = async (pool, state, budget, caps) => {
    const perAmt = Math.min(budget, caps.Per || 0);
    const rem = budget - perAmt;
    
    const candidates =[];
    const base = { Str: 0, Agi: 0, Per: perAmt, Int: 0, Luck: 0, Div: 0, Corr: 0 };
    
    // 1. Max Agi -> Str
    let b1 = { ...base };
    let r1 = rem;
    b1.Agi = Math.min(r1, caps.Agi || 0); r1 -= b1.Agi;
    b1.Str = Math.min(r1, caps.Str || 0); r1 -= b1.Str;
    b1.Luck = Math.min(r1, caps.Luck || 0);
    candidates.push(b1);
    
    // 2. Max Str -> Agi
    let b2 = { ...base };
    let r2 = rem;
    b2.Str = Math.min(r2, caps.Str || 0); r2 -= b2.Str;
    b2.Agi = Math.min(r2, caps.Agi || 0); r2 -= b2.Agi;
    b2.Luck = Math.min(r2, caps.Luck || 0);
    candidates.push(b2);
    
    // 3. Balanced Str/Agi
    let b3 = { ...base };
    let r3 = rem;
    let half = Math.floor(r3 / 2);
    b3.Str = Math.min(half, caps.Str || 0); r3 -= b3.Str;
    b3.Agi = Math.min(half, caps.Agi || 0); r3 -= b3.Agi;
    b3.Luck = Math.min(r3, caps.Luck || 0);
    candidates.push(b3);

    // 4. Balanced Str/Agi/Luck
    let b4 = { ...base };
    let r4 = rem;
    let third = Math.floor(r4 / 3);
    b4.Str = Math.min(third, caps.Str || 0); r4 -= b4.Str;
    b4.Agi = Math.min(third, caps.Agi || 0); r4 -= b4.Agi;
    b4.Luck = Math.min(third, caps.Luck || 0); r4 -= b4.Luck;
    if (r4 > 0) {
        let addStr = Math.min(r4, (caps.Str || 0) - b4.Str); b4.Str += addStr; r4 -= addStr;
        let addAgi = Math.min(r4, (caps.Agi || 0) - b4.Agi); b4.Agi += addAgi; r4 -= addAgi;
    }
    candidates.push(b4);

    // Deduplicate candidates
    const unique =[];
    const seen = new Set();
    for (const c of candidates) {
        const key = `${c.Str},${c.Agi},${c.Luck}`;
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(c);
        }
    }

    // Evaluate all candidates using a fast 2-sample batch
    // DYNAMIC TARGETING: Seek the fragment type of the NEXT unpurchased major upgrade!
    let metric = 'frag_1_per_min';
    if ((state.external_levels[4] || 0) >= 3000) {
        metric = 'frag_6_per_min';
    } else if (!(state.upgrade_levels[41] > 0)) {
        metric = 'frag_1_per_min';
    } else if (!(state.upgrade_levels[42] > 0)) {
        metric = 'frag_2_per_min';
    } else if (!(state.upgrade_levels[43] > 0)) {
        metric = 'frag_3_per_min';
    } else if (!(state.upgrade_levels[45] > 0)) {
        metric = 'frag_5_per_min';
    } else {
        metric = 'frag_6_per_min'; // Fallback if all are bought
    }

    const promises = unique.map(testStats => getSmoothedYields(pool, state, testStats, 2));
    const results = await Promise.all(promises);
    
    // Return the yields of the best performing heuristic build
    results.sort((a, b) => (b[metric] || 0) - (a[metric] || 0));
    return results[0];
};

// Runs a lightning-fast Successive Halving Grid Search to completely escape local minima
async function runFastOptimizer(pool, state, targetMetric, budget, previousBuild, samples = 5, allowUnspent = false) {
    await pool.syncState(state);
    const baseStats = getAvailableStatKeys(state);
    
    // Inject "Unspent" as a virtual 8th stat so the optimizer can organically discover crippled builds
    const stats = allowUnspent ?[ ...baseStats, 'Unspent' ] : baseStats;
    const caps = getEffectiveStatCaps(state);
    if (allowUnspent) caps['Unspent'] = budget;
    
    // Ensure the baseline isn't cheating the math!
    const safePrevious = enforceBudget(previousBuild, stats, budget, caps);
    const candidates = [ safePrevious ];

    const bounds = {};
    stats.forEach(s => bounds[s] =[ 0, Math.min(budget, caps[s]) ]);
    
    // --- EMPIRICAL DIMENSION REDUCTION (MAX FLOOR PUSHES ONLY) ---
    // Based on 150+ floors of telemetry, we aggressively prune dead stats to exponentially speed up the grid search
    if (targetMetric === 'highest_floor') {
        const floor = state.current_max_floor;
        const wiggle = 3; // Allow up to 3 points of micro-optimization for niche Armor Pen / Mod synergies
        
        if (floor >= 25) {
            if (bounds.Int) bounds.Int =[ 0, Math.min(budget, wiggle, caps.Int || 0) ];
            if (bounds.Per) bounds.Per =[ 0, Math.min(budget, wiggle, caps.Per || 0) ];
            
            // The Overflow Rule: Allow wiggle room, BUT strictly expand if primary stats run out of capacity!
            const coreCapacity = (caps.Str || 0) + (caps.Agi || 0) + (caps.Luck || 0) + (caps.Div || 0);
            const overflow = Math.max(0, budget - coreCapacity);
            if (bounds.Corr) bounds.Corr =[ 0, Math.min(budget, caps.Corr || 0, Math.max(wiggle, overflow)) ];
        }
        if (floor >= 100) {
            // Telemetry proves Luck stays near its cap, but we allow pulling up to 3 points out if needed
            if (bounds.Luck) {
                const lCap = Math.min(budget, caps.Luck || 0);
                bounds.Luck =[ Math.max(0, lCap - wiggle), lCap ];
            }
        }
    }
    
    // 1. Inject Micro-Neighbors: Guarantee we test precise +1 breakpoints from the previous build!
    if (budget > 0) {
        stats.forEach(s => {
            if ((safePrevious[s] || 0) < bounds[s][1]) {
                const neighbor = { ...safePrevious, [s]: (safePrevious[s] || 0) + 1 };
                // The +1 neighbor is instantly stripped back down to budget size to swap the stats organically
                candidates.push(enforceBudget(neighbor, stats, budget, caps));
            }
        });
    }

    // 2. Coarse Grid Search
    let step = 1;
    if (budget >= 8) step = 2;
    if (budget >= 16) step = 3;
    if (budget >= 30) step = 4;
    if (budget >= 60) step = 5;

    let alignBudget = budget - (budget % step);
    
    // CRITICAL FIX: Use memory-safe counter first to prevent browser OOM lockups during Asc 2 deep calculations!
    let count = countDistributions(stats, alignBudget, step, bounds);
    
    // Protect against browser lag spikes by expanding step size if combinatorial space explodes
    // Limit bumped to 300 to prevent step sizes expanding too aggressively early on
    while (count > 300 && step < budget) {
        step++;
        alignBudget = budget - (budget % step);
        count = countDistributions(stats, alignBudget, step, bounds);
    }
    
    let grid = generateDistributions(stats, alignBudget, step, bounds);
    
    grid.forEach(d => candidates.push(enforceBudget(d, stats, budget, caps)));

    // 3. Deduplicate
    const unique = new Map();
    candidates.forEach(d => unique.set(stats.map(s => d[s] || 0).join(','), d));
    const finalCandidates = Array.from(unique.values());

    // 4. Round 1 Filter (Mini-batch for Push Builds, with Secondary Tie-Breaker)
    // Bumped to 10 specifically to break extreme quantization ties that hide optimal sub-paths!
    const r1Samples = targetMetric === 'highest_floor' ? 10 : 2; 
    const r1Promises = finalCandidates.map(async (testStats) => {
        const avgYields = await getSmoothedYields(pool, state, testStats, r1Samples);
        return { build: testStats, val: avgYields[targetMetric] || 0, secondary: avgYields.xp_per_min || 0 };
    });
    
    const r1Results = await Promise.all(r1Promises);
    
    // CRITICAL FIX: Break integer ties using combat efficiency (xp_per_min) as a proxy for survivability!
    r1Results.sort((a, b) => {
        if (b.val !== a.val) return b.val - a.val;
        return b.secondary - a.secondary;
    });
    
    // Keep Top 15% (min 5 builds)
    const keepCount = Math.max(5, Math.floor(finalCandidates.length * 0.15));
    const r2Candidates = r1Results.slice(0, keepCount).map(r => r.build);
    
    // 5. Round 2: Monte Carlo Validation
    // STRICT FIX: Force a much larger sample size specifically for Push Builds to mathematically prevent Optimizer Bias (overfitting to RNG noise)
    const r2Samples = targetMetric === 'highest_floor' ? Math.max(25, samples) : samples;
    const r2Promises = r2Candidates.map(async (testStats) => {
        const avgYields = await getSmoothedYields(pool, state, testStats, r2Samples);
        return { build: testStats, val: avgYields[targetMetric] || 0, secondary: avgYields.xp_per_min || 0, yields: avgYields };
    });
    
    const r2Results = await Promise.all(r2Promises);
    
    r2Results.sort((a, b) => {
        if (b.val !== a.val) return b.val - a.val;
        return b.secondary - a.secondary;
    });
    
    const bestR2 = r2Results[0].build;

    // 6. Phase 3: Simulated Annealing (Deep Random Walk)
    // Coarse step gaps can be huge (e.g. step=6). 1/2 point swaps miss the true peak.
    // We combine structured 1/2 point swaps with 200 random deep walks to completely map the local valley.
    const p3CandidatesMap = new Map();
    p3CandidatesMap.set(stats.map(s => bestR2[s] || 0).join(','), bestR2);

    // A) Structured Micro-Swaps (1 and 2 points)
    stats.forEach(sFrom => {
        stats.forEach(sTo => {
            if (sFrom !== sTo) {
                if ((bestR2[sFrom] || 0) > bounds[sFrom][ 0 ] && (bestR2[sTo] || 0) < bounds[sTo][ 1 ]) {
                    const n1 = { ...bestR2, [sFrom]: bestR2[sFrom] - 1, [sTo]: (bestR2[sTo] || 0) + 1 };
                    p3CandidatesMap.set(stats.map(s => n1[s] || 0).join(','), enforceBudget(n1, stats, budget, caps));
                }
                if ((bestR2[sFrom] || 0) > bounds[sFrom][ 0 ] + 1 && (bestR2[sTo] || 0) < bounds[sTo][ 1 ] - 1) {
                    const n2 = { ...bestR2, [sFrom]: bestR2[sFrom] - 2, [sTo]: (bestR2[sTo] || 0) + 2 };
                    p3CandidatesMap.set(stats.map(s => n2[s] || 0).join(','), enforceBudget(n2, stats, budget, caps));
                }
            }
        });
    });

    // B) Deep Random Walks (Dynamic to the coarse step size)
    // Farm yields have a very smooth gradient, so they only need a light 25-pass annealing.
    // Push builds (highest_floor) are extremely rugged and require the full 200-pass deep search.
    const maxWalk = Math.max(3, step + 1); 
    const annealingPasses = targetMetric === 'highest_floor' ? 200 : 25;
    for (let i = 0; i < annealingPasses; i++) {
        const mut = { ...bestR2 };
        const walkDist = 1 + Math.floor(Math.random() * maxWalk);
        
        for (let w = 0; w < walkDist; w++) {
            const fromCandidates = stats.filter(s => (mut[s] || 0) > bounds[s][ 0 ]);
            const toCandidates = stats.filter(s => (mut[s] || 0) < bounds[s][ 1 ]);
            
            if (fromCandidates.length > 0 && toCandidates.length > 0) {
                const sFrom = fromCandidates[Math.floor(Math.random() * fromCandidates.length)];
                const sTo = toCandidates[Math.floor(Math.random() * toCandidates.length)];
                if (sFrom !== sTo) {
                    mut[sFrom]--;
                    mut[sTo]++;
                }
            }
        }
        p3CandidatesMap.set(stats.map(s => mut[s] || 0).join(','), enforceBudget(mut, stats, budget, caps));
    }

    const p3Candidates = Array.from(p3CandidatesMap.values());
    const p3Samples = targetMetric === 'highest_floor' ? 20 : 5;
    
    const p3Promises = p3Candidates.map(async (testStats) => {
        const avgYields = await getSmoothedYields(pool, state, testStats, p3Samples);
        return { build: testStats, val: avgYields[targetMetric] || 0, secondary: avgYields.xp_per_min || 0, yields: avgYields };
    });

    const p3Results = await Promise.all(p3Promises);
    
    p3Results.sort((a, b) => {
        if (b.val !== a.val) return b.val - a.val;
        return b.secondary - a.secondary;
    });

    return { bestBuild: p3Results[0].build, bestYields: p3Results[0].yields };
}

// Multi-Floor Fast Lane: Evaluates the absolute maximum limit of the current build
// and collapses all intermediate floor pushes into a single O(1) jump calculation!
async function attemptMultiFloorPush(pool, state, maxTimePenaltySecs, minWinRateReq = 0.05, samples = 150) {
    // Uncap the test state so the engine runs stamina to absolute failure
    const testState = { ...state, current_max_floor: 200 };
    await pool.syncState(testState);
    
    const tasks = Array.from({ length: samples }, () => pool.runTask(state.push_stats, testState.upgrade_levels, testState.external_levels, testState.cards));
    const batchResults = await Promise.all(tasks);
    
    let totalTimeSec = 0;
    let pushYields = { };
    let highestFloors = [ ];
    
    batchResults.forEach(res => {
        totalTimeSec += res.total_time;
        highestFloors.push(res.highest_floor);
        for (const [ key, val ] of Object.entries(res)) {
            if (typeof val === 'number' && key.includes('_per_min')) {
                pushYields[ key ] = (pushYields[ key ] || 0) + val;
            }
        }
    });

    Object.keys(pushYields).forEach(k => pushYields[k] /= samples);
    const avgRunTimeSecs = totalTimeSec / samples;
    highestFloors.sort((a, b) => b - a); // Sort descending

    const currentFloor = state.current_max_floor;
    let bestFloor = currentFloor;
    let totalTimePenalty = 0;
    let finalWinRate = 0;

    // Evaluate each step cumulatively to safely measure the penalty required to reach the ceiling
    for (let f = currentFloor + 1; f <= Math.min(200, highestFloors[0]); f++) {
        const successes = highestFloors.filter(hf => hf >= f).length;
        const winRate = successes / samples;
        
        // Wilson Score Interval Lower Bound
        const z = 1.96;
        const denominator = 1 + (z * z) / samples;
        const center = winRate + (z * z) / (2 * samples);
        const spread = z * Math.sqrt((winRate * (1 - winRate) + (z * z) / (4 * samples)) / samples);
        const lowerBound = (center - spread) / denominator;

        if (lowerBound < minWinRateReq) break; // Hard mathematical wall hit

        const safeWinRate = Math.min(0.999, winRate);
        const safeBudgetRuns = Math.max(1, Math.ceil(Math.log(1 - 0.90) / Math.log(1 - safeWinRate)));
        const stepTimePenalty = safeBudgetRuns * avgRunTimeSecs;

        if (totalTimePenalty + stepTimePenalty > maxTimePenaltySecs) break; // Out of time before next level

        bestFloor = f;
        totalTimePenalty += stepTimePenalty;
        finalWinRate = winRate;
    }

    await pool.syncState(state);

    if (bestFloor > currentFloor) {
        return {
            success: true,
            floorsGained: bestFloor - currentFloor,
            newMaxFloor: bestFloor,
            timePenaltySecs: totalTimePenalty,
            winRate: finalWinRate,
            pushYields
        };
    } else {
        return { success: false };
    }
}

export async function runPathfinderSimulation(startState, targetLevel, initialFrags, pool, minWinRate, initialArchSecs = 0, onProgress) {
    // 1. Initialize Tracked State (Dual-Track the base stats!)
    let state = { 
        ...startState, 
        push_stats: { ...startState.base_stats },
        prometheus_level: startState.prometheus_level || 0,
        sisyphus_level: startState.sisyphus_level || 0
    };

    let hadesLevelsSinceLastReopt = 0;

    let cumulativeArchSecs = initialArchSecs;
    let lastEventTime = initialArchSecs;
    
    const captureSnapshot = (s) => ({
        arch_level: s.arch_level,
        current_max_floor: s.current_max_floor,
        base_stats: { ...s.base_stats },
        upgrade_levels: { ...s.upgrade_levels },
        external_levels: { ...s.external_levels },
        cards: { ...s.cards },
        total_infernal_cards: s.total_infernal_cards || 0,
        arch_sec: cumulativeArchSecs,
        card_progress: { ...card_progress },
        frags: { ...frags },
        prometheus_level: s.prometheus_level || 0,
        sisyphus_level: s.sisyphus_level || 0
    });
    let currentExp = 0;
    let unspentPoints = 0;
    
    // Fragment Banks (Initialized from UI input)
    let frags = { 
        dirt: initialFrags?.dirt || 0, 
        com: initialFrags?.com || 0, 
        rare: initialFrags?.rare || 0, 
        epic: initialFrags?.epic || 0, 
        leg: initialFrags?.leg || 0, 
        myth: initialFrags?.myth || 0, 
        div: initialFrags?.div || 0 
    };

    // Tracks internal progress towards drops using Gamma 50% expectations (Persisted across chunks!)
    let card_progress = startState.card_progress ? { ...startState.card_progress } : { };
    
    let history = [ ];
    let lastFarmStr = "";
    let lastPushStr = "";
    
    // Hoisted flag to track if combat power changed (skips expensive Pyodide recalculations for economy-only upgrades!)
    let pushBuildIsStale = true; 
    
    // Dynamic event limit to prevent browser crashing if bounds are too high
    let eventCount = 0;
    const MAX_EVENTS = 3000;

    // Dynamically generate the full list of available upgrades for the current Ascension
    let lockedUpgs =[ ];
    if (state.asc1_unlocked === false) lockedUpgs.push(...ASC1_LOCKED_UPGS, ...ASC2_LOCKED_UPGS);
    else if (state.asc2_unlocked === false) lockedUpgs.push(...ASC2_LOCKED_UPGS);

    const upgradeTargets = Object.keys(UPGRADE_NAMES)
        .map(Number)
        .filter(id => !lockedUpgs.includes(id));

    // --- STARTUP STAT BUDGET SYNC & RE-OPTIMIZATION ---
    // We forcefully re-optimize BOTH builds using the total expected budget at startup. 
    // This ensures that even if the user loads a garbage "Current Workspace" build, 
    // the timeline establishes a mathematically perfect baseline moving forward.
    const expectedBudget = state.arch_level + (state.upgrade_levels[12] || 0);

    const startLvl = startState.arch_level;
    const report = (msg) => {
        if (onProgress) {
            const progressPct = ((state.arch_level - startLvl) / (targetLevel - startLvl)) * 100;
            onProgress({ progress: Math.min(100, Math.max(0, progressPct)), status: msg });
        }
    };

    let currentFarmYields = null;
    let currentPushYields = null;
    let currentFragPotential = null;

    // --- AUTOMATED PIVOT LOGIC ---
    // Evaluates Opportunity Cost and dynamically swaps the active optimizer target
    const isCrippledPhase = (s) => {
        if ((s.external_levels[21] || 0) < 6666) return false;
        if ((s.external_levels[4] || 0) < 3000) return false;
        
        // Phase 3 triggers the moment ALL Tier 4 and Tier 3 cards are maxed
        const highTierCards =[
            'div4', 'myth4', 'leg4', 'epic4', 'rare4', 'com4', 'dirt4',
            'div3', 'myth3', 'leg3', 'epic3', 'rare3', 'com3', 'dirt3'
        ];
        for (const c of highTierCards) {
            if ((s.cards[c] || 0) < 4) return false;
        }
        return true;
    };

    const determineFarmMetric = (expNeededCheck) => {
        // Endgame Phase 2: Hades Idol is maxed. Pivot to explicit Block hunting!
        const idolsMaxed = (state.external_levels[21] || 0) >= 6666;
                           
        if ((state.external_levels[4] || 0) >= 3000) {
            if (idolsMaxed) {
                // Hunt remaining un-maxed cards, strictly prioritizing highest tiers first
                const targetCards =[
                    'div4', 'myth4', 'leg4', 'epic4', 'rare4', 'com4', 'dirt4',
                    'div3', 'myth3', 'leg3', 'epic3', 'rare3', 'com3', 'dirt3',
                    'div2', 'myth2', 'leg2', 'epic2', 'rare2', 'com2', 'dirt2',
                    'div1', 'myth1', 'leg1', 'epic1', 'rare1', 'com1', 'dirt1'
                ];
                for (const c of targetCards) {
                    if ((state.cards[c] || 0) < 4) return `block_${c}_per_min`;
                }
                return 'block_div4_per_min'; // Absolute final fallback if 100% complete
            }
            return 'frag_6_per_min'; // Phase 1: Divine Idols
        }

        let target = null;
        if (!(state.upgrade_levels[41] > 0)) target = { id: 41, frag: 'com', cost: 100000, key: 'frag_1_per_min' };
        else if (!(state.upgrade_levels[42] > 0)) target = { id: 42, frag: 'rare', cost: 90000, key: 'frag_2_per_min' };
        else if (!(state.upgrade_levels[43] > 0)) target = { id: 43, frag: 'epic', cost: 80000, key: 'frag_3_per_min' };
        else if (!(state.upgrade_levels[45] > 0)) target = { id: 45, frag: 'myth', cost: 50000, key: 'frag_5_per_min' };

        if (!target) return 'xp_per_min';

        const reqFloor = UPGRADE_LEVEL_REQS[target.id] || 0;
        if (state.current_max_floor >= reqFloor - 10) {
            // Use a safe baseline to prevent XP crashes during frag builds from artificially inflating the XP time
            const safeXpYield = Math.max(currentFarmYields?.xp_per_min || 1, currentFragPotential?.xp_per_min || 1);
            const ttnl = expNeededCheck / safeXpYield;
            const bank = frags[target.frag] || 0;
            const fragRate = currentFragPotential?.[target.key] || 0;
            
            if (fragRate > 0) {
                const ttf = Math.max(0, target.cost - bank) / fragRate;
                if (ttf < ttnl) return target.key; // 🚨 Crossover hit! Pivot to Fragment Build!
            }
        }
        return 'xp_per_min';
    };

    let phase3Active = false;

    const executeFarmOptimization = async (budget, expNeededCheck) => {
        const farmMetric = determineFarmMetric(expNeededCheck);
        const crippled = isCrippledPhase(state);
        
        // Utilize the native optimizer, but unlock the "Unspent" dimension so it organically discovers crippled builds!
        const optFarm = await runFastOptimizer(pool, state, farmMetric, budget, state.base_stats, 3, crippled);
        
        // Strip the virtual 'Unspent' key so it doesn't pollute the UI snapshot or formatting strings
        if (crippled) delete optFarm.bestBuild.Unspent;
        
        state.base_stats = optFarm.bestBuild;
        currentFarmYields = optFarm.bestYields;

        if ((state.external_levels[4] || 0) >= 3000) {
            currentFragPotential = currentFarmYields;
        } else {
            currentFragPotential = await getShadowFragYields(pool, state, budget, getEffectiveStatCaps(state));
        }
        
        lastFarmStr = formatBuildStr(state.base_stats, state);
        
        if (crippled && !phase3Active) {
            phase3Active = true;
            history.push({
                type: "system",
                event: `🕸️ Endgame Phase 3: Crippled Builds`,
                arch_sec: cumulativeArchSecs,
                time_delta: 0,
                active_build: "Farm",
                active_build_str: lastFarmStr,
                level: state.arch_level,
                floor: state.current_max_floor,
                desc: `All T3/T4 cards maxed! Full stat budgets abandoned. Optimizer now using constrained meta-builds to farm lower-tier blocks without overkilling.`,
                yields: { farm: currentFarmYields, push: currentPushYields, frag_potential: currentFragPotential },
                frags: { ...frags },
                card_progress: { ...card_progress },
                state_snapshot: captureSnapshot(state)
            });
        }
    };

    report(`Establishing Baseline Farm Build...`);
    await new Promise(r => setTimeout(r, 10)); // Force UI Paint

    // 1. Establish perfect Farm Build
    await executeFarmOptimization(expectedBudget, Math.max(0, getExpRequired(state.arch_level) - currentExp));
    
    report(`Establishing Baseline Push Build...`);
    await new Promise(r => setTimeout(r, 10)); // Force UI Paint

    // 2. Establish perfect Push Build (Against uncapped gradient!)
    const pushTestState = { ...state, current_max_floor: 200 };
    const optPush = await runFastOptimizer(pool, pushTestState, 'highest_floor', expectedBudget, state.push_stats, 12); // Bumped validation samples to reliably catch 5-10% win rates
    state.push_stats = optPush.bestBuild;
    
    // 3. Generate baseline UI Push Yields against actual target floor
    const pushActualTargetState = { ...state, current_max_floor: state.current_max_floor + 1 };
    currentPushYields = await getSmoothedYields(pool, pushActualTargetState, state.push_stats, 5);
    
    await pool.syncState(state);

    const farmStr = formatBuildStr(state.base_stats, state);
    const pushStr = formatBuildStr(state.push_stats, state);
    
    lastFarmStr = farmStr;
    lastPushStr = pushStr;

    // Ensure startLvl definition is removed here since we hoisted it to the top!
    
    history.push({
        type: "system",
        event: "Simulation Started",
        arch_sec: cumulativeArchSecs,
        time_delta: 0,
        active_build: "None",
        active_build_str: "",
        level: state.arch_level,
        floor: state.current_max_floor,
        desc: `Beginning Asc2 Journey. Initialized Budget (${expectedBudget} pts) -> Farm: ${farmStr} | Push: ${pushStr}`,
        yields: { farm: currentFarmYields, push: currentPushYields, frag_potential: currentFragPotential },
        frags: { ...frags },
        state_snapshot: captureSnapshot(state)
    });

    while (state.arch_level < targetLevel && eventCount < MAX_EVENTS) {
        eventCount++;

        // 1. SENSOR: Exclusively use the globally smoothed Farm Yields
        // This guarantees that Time Deltas and Resource Accruals match the UI Snapshot mathematically!
        const yields = currentFarmYields;
        
        // 2. TIMERS: Calculate Time To Next Milestone (TTNM)
        let t_next_level = Infinity;
        if (yields.xp_per_min > 0) {
            // CRITICAL FIX: Math.max(0) prevents negative time requirements if XP overfilled during a floor push!
            const expNeeded = Math.max(0, getExpRequired(state.arch_level) - currentExp);
            t_next_level = expNeeded / yields.xp_per_min;
        }

        let t_next_card = Infinity;
        let nextCardId = null;
        let nextCardTargetLevel = null;

        // Scan the block cards to see if an expected drop is approaching
        for (const blockId of Object.keys(BLOCK_MIN_FLOORS)) {
            if (!state.asc1_unlocked && (blockId.startsWith('div') || blockId.endsWith('4'))) continue;
            if (!state.asc2_unlocked && blockId.endsWith('4')) continue;
            if (state.current_max_floor < BLOCK_MIN_FLOORS[ blockId ]) continue;

            const currentLvl = state.cards[ blockId ] || 0;
            if (currentLvl >= 4) continue; // Maxed

            const isT4 = blockId.endsWith('4');
            let rate = 0;
            let targetAmount = 0;
            let targetLvl = currentLvl + 1;

            if (isT4 && currentLvl === 0) {
                rate = yields[ `card_base_${blockId}_per_min` ] || 0;
                targetAmount = 0.693; // Gamma 50% Median for 1 Drop
                targetLvl = 2; // T4 immediately skips to Gilded (Level 2)
            } else if (!isT4 && currentLvl === 0) {
                rate = yields[ `card_base_${blockId}_per_min` ] || 0;
                targetAmount = 0.693; // Gamma 50% Median for 1 Drop
                targetLvl = 1; // Base Card
            } else if (!isT4 && (currentLvl === 1 || currentLvl === 2)) {
                rate = yields[ `card_poly_${blockId}_per_min` ] || 0;
                targetAmount = 9.669; // Gamma 50% Median for 10 Drops
                targetLvl = 3; // Poly (Skipping Gilded logically)
            } else if (isT4 && (currentLvl === 1 || currentLvl === 2)) {
                rate = yields[ `card_poly_${blockId}_per_min` ] || 0;
                targetAmount = 9.669; // Gamma 50% Median for 10 Drops
                targetLvl = 3; // Poly
            } else if (currentLvl === 3) {
                rate = yields[ `card_inf_${blockId}_per_min` ] || 0;
                targetAmount = 9.669; // Gamma 50% Median for 10 Drops
                targetLvl = 4; // Infernal
            } else {
                continue;
            }

            if (rate > 0) {
                const bank = card_progress[ blockId ] || 0;
                const needed = Math.max(0, targetAmount - bank);
                const timeNeeded = needed / rate;
                
                if (timeNeeded < t_next_card) {
                    t_next_card = timeNeeded;
                    nextCardId = blockId;
                    nextCardTargetLevel = targetLvl;
                }
            }
        }

        let t_next_upgrade = Infinity;
        let nextUpgradeId = null;
        let nextUpgradeCost = null;

        // Scan upgrades to find the first one we can logically save for
        for (const upgId of upgradeTargets) {
            const currentLvl = state.upgrade_levels[ upgId ] || 0;
            
            // Gem Upgrades are strictly capped by Arch Level
            if ((upgId === 3 || upgId === 4 || upgId === 5) && currentLvl >= state.arch_level) continue;

            // Enforce Max Level Caps
            const cap = INTERNAL_UPGRADE_CAPS[upgId];
            if (cap !== undefined && currentLvl >= cap) continue;

            // Enforce Max Floor Unlock Requirements
            const reqFlr = UPGRADE_LEVEL_REQS[upgId] || 0;
            if (state.current_max_floor < reqFlr) continue;

            const cost = calculateUpgradeCost(upgId, currentLvl + 1, 2); // AscTier 2
            
            if (cost) {
                const currency = cost.currency;

                // --- DYNAMIC ROI TRAP FILTER ---
                        const majorMilestones = {
                            'com': { id: 41, cost: 100000 },
                            'rare': { id: 42, cost: 90000 },
                            'epic': { id: 43, cost: 80000 },
                            'leg': { id: 44, cost: 70000 },
                            'myth': { id: 45, cost: 50000 }
                        };

                        let isTrapped = false;
                        if (majorMilestones[ currency ] && upgId !== majorMilestones[ currency ].id) {
                            const milestone = majorMilestones[ currency ];
                            const isMilestoneBought = (state.upgrade_levels[milestone.id] || 0) > 0;
                            const milestoneReqFloor = UPGRADE_LEVEL_REQS[ milestone.id ] || 0;
                            
                            if (!isMilestoneBought && state.current_max_floor >= milestoneReqFloor - 10) {
                                const currentYield = yields[ FRAG_RATE_KEYS[ currency ] ] || 0;
                                const bank = frags[ currency ] || 0;
                                
                                // FOOLPROOF: If we can already afford the milestone, NEVER trap!
                                if (currentYield > 0 && bank < milestone.cost) {
                                    const timeToMilestoneHoard = Math.max(0, milestone.cost - bank) / currentYield;
                                    const optimisticNewYield = currentYield * 1.05;
                                    const timeToMilestoneSpend = Math.max(0, milestone.cost - (bank - cost.amount)) / optimisticNewYield;
                                    
                                    if (timeToMilestoneSpend > timeToMilestoneHoard) {
                                        isTrapped = true;
                                    }
                                }
                            }
                        }
                        if (isTrapped) continue;
                
                if (currency === 'gems') {
                    // For Phase 2, we assume Gems are plentiful enough to instantly buy when unlocked
                    t_next_upgrade = 0;
                    nextUpgradeId = upgId;
                    nextUpgradeCost = cost;
                    break;
                }
                
                const currentBank = frags[ currency ] || 0;
                const needed = Math.max(0, cost.amount - currentBank);
                
                if (needed === 0) {
                    t_next_upgrade = 0;
                    nextUpgradeId = upgId;
                    nextUpgradeCost = cost;
                    break; // Afforded right now!
                } else {
                    const rateKey = FRAG_RATE_KEYS[ currency ];
                    const rate = yields[ rateKey ] || 0;
                    if (rate > 0) {
                        const timeNeeded = needed / rate;
                        if (timeNeeded < t_next_upgrade) {
                            t_next_upgrade = timeNeeded;
                            nextUpgradeId = upgId;
                            nextUpgradeCost = cost;
                        }
                    }
                }
            }
        }

        // 3. JUMP: Fast-Forward to the nearest event
        let t_step = 0;
        let eventType = null;

        // Prioritize Cards & Upgrades if they trigger at the exact same moment as a Level Up
        if (t_next_card <= t_next_level && t_next_card <= t_next_upgrade && t_next_card !== Infinity) {
            t_step = Math.max(0, t_next_card);
            eventType = 'card';
        } else if (t_next_upgrade <= t_next_level && t_next_upgrade !== Infinity) {
            t_step = Math.max(0, t_next_upgrade); // Double safeguard against time travel
            eventType = 'upgrade';
        } else if (t_next_level !== Infinity) {
            t_step = Math.max(0, t_next_level);
            eventType = 'level';
        } else {
            // Failsafe for soft-locks (e.g. 0 yields)
            history.push({
                type: "system",
                event: "Engine Stalled",
                arch_sec: cumulativeArchSecs,
                level: state.arch_level,
                floor: state.current_max_floor,
                desc: "Yields dropped to 0. Cannot progress time.",
                frags: { ...frags }
            });
            break;
        }

        // Apply Time & Accrue Resources
        cumulativeArchSecs += t_step * 60; // Convert minutes to Arch Seconds
        currentExp += yields.xp_per_min * t_step;
        Object.keys(frags).forEach(k => {
            const rKey = FRAG_RATE_KEYS[ k ];
            if (yields[ rKey ]) frags[ k ] += yields[ rKey ] * t_step;
        });

        for (const blockId of Object.keys(BLOCK_MIN_FLOORS)) {
            const currentLvl = state.cards[ blockId ] || 0;
            const isT4 = blockId.endsWith('4');
            let rate = 0;
            if (isT4 && currentLvl === 0) rate = yields[ `card_base_${blockId}_per_min` ] || 0;
            else if (!isT4 && currentLvl === 0) rate = yields[ `card_base_${blockId}_per_min` ] || 0;
            else if (!isT4 && (currentLvl === 1 || currentLvl === 2)) rate = yields[ `card_poly_${blockId}_per_min` ] || 0;
            else if (isT4 && (currentLvl === 1 || currentLvl === 2)) rate = yields[ `card_poly_${blockId}_per_min` ] || 0;
            else if (currentLvl === 3) rate = yields[ `card_inf_${blockId}_per_min` ] || 0;
            
            if (rate > 0) {
                card_progress[ blockId ] = (card_progress[ blockId ] || 0) + rate * t_step;
            }
        }

        // --- HESTIA IDOL AUTO-TRIBUTE ---
        // Sweeps excess Common Fragments into Idol Levels once the tech tree is fully exhausted
        if ((state.upgrade_levels[41] || 0) > 0 && frags.com >= 999 && (state.external_levels[4] || 0) < 3000) {
            const comUpgs =[ 9, 10, 11, 12, 13, 19, 25, 41 ];
            let comMaxed = true;
            
            for (const id of comUpgs) {
                if (lockedUpgs.includes(id)) continue; 
                
                const cap = INTERNAL_UPGRADE_CAPS[id] || 1;
                if ((state.upgrade_levels[id] || 0) < cap) {
                    comMaxed = false; 
                    break;
                }
            }
            if ((state.upgrade_levels[8] || 0) < 1) comMaxed = false;

            if (comMaxed) {
                const currentHestia = state.external_levels[4] || 0;
                const maxAffordable = Math.floor(frags.com / 999);
                const maxAllowed = 3000 - currentHestia;
                
                // O(1) clamp ensures we never exceed the hard cap or our wallet
                const bought = Math.max(0, Math.min(maxAffordable, maxAllowed));
                
                if (bought > 0) {
                    frags.com -= (bought * 999);
                    state.external_levels = { ...state.external_levels, 4: currentHestia + bought };
                    const justMaxedHestia = (state.external_levels[4] || 0) >= 3000;
                    
                    history.push({
                        type: "system",
                        event: `🔥 Hestia Idol Tributed (+${bought} Levels)`,
                        arch_sec: cumulativeArchSecs,
                        time_delta: 0,
                        active_build: "Farm",
                        active_build_str: lastFarmStr,
                        level: state.arch_level,
                        floor: state.current_max_floor,
                        desc: `Auto-spent excess Common Fragments. Hestia is now Level ${state.external_levels[4]}.`,
                        yields: { farm: currentFarmYields, push: currentPushYields, frag_potential: currentFragPotential },
                        frags: { ...frags },
                        card_progress: { ...card_progress },
                        state_snapshot: captureSnapshot(state)
                    });

                    // Trigger the massive Endgame Pivot the exact moment Hestia caps out
                    if (justMaxedHestia) {
                        report(`Lvl ${state.arch_level}: Endgame Transition! Re-optimizing for Divine Fragments...`);
                        await pool.syncState(state);
                        
                        const totalBudget = state.arch_level + (state.upgrade_levels[12] || 0);
                        await executeFarmOptimization(totalBudget, Math.max(0, getExpRequired(state.arch_level) - currentExp));
                        
                        history.push({
                            type: "system",
                            event: `🛡️ Endgame Phase 1: Divine Idol Pivot`,
                            arch_sec: cumulativeArchSecs,
                            time_delta: 0,
                            active_build: "Farm",
                            active_build_str: lastFarmStr,
                            level: state.arch_level,
                            floor: state.current_max_floor,
                            desc: `Hestia maxed. XP progression abandoned. Build permanently optimized for Divine/Infernal Cards.`,
                            yields: { farm: currentFarmYields, push: currentPushYields, frag_potential: currentFragPotential },
                            frags: { ...frags },
                            card_progress: { ...card_progress },
                            state_snapshot: captureSnapshot(state)
                        });
                    }
                }
            }
        }

        // --- DIVINE IDOLS AUTO-TRIBUTE ---
        // Sweeps excess Divine Fragments into the RNG Idol pool once tech tree is exhausted
        if (frags.div >= 999) {
            const divUpgs =[47, 48, 49, 50, 51, 55];
            let divMaxed = true;
            
            for (const id of divUpgs) {
                if (lockedUpgs.includes(id)) continue; 
                
                const cap = INTERNAL_UPGRADE_CAPS[id] || 1;
                const reqFlr = UPGRADE_LEVEL_REQS[id] || 0;
                if ((state.upgrade_levels[id] || 0) < cap && state.current_max_floor >= reqFlr) {
                    divMaxed = false; 
                    break;
                }
            }

            if (divMaxed) {
                let boughtHades = 0;
                let boughtProm = 0;
                let boughtSis = 0;
                
                let curHades = state.external_levels[21] || 0;
                let curProm = state.prometheus_level || 0;
                let curSis = state.sisyphus_level || 0;
                
                const idolsWereMaxed = curHades >= 6666;
                
                while (frags.div >= 999) {
                    const pool =[];
                    if (curHades < 6666) pool.push('hades');
                    if (curProm < 1000) pool.push('prometheus');
                    
                    const totalBaseIdols = curHades + curProm;
                    if (totalBaseIdols >= 777 && curSis < 7777) pool.push('sisyphus'); // Sisyphus cap enforced!
                    
                    if (pool.length === 0) break;
                    
                    const pick = pool[Math.floor(Math.random() * pool.length)];
                    if (pick === 'hades') {
                        curHades++;
                        boughtHades++;
                    } else if (pick === 'prometheus') {
                        curProm++;
                        boughtProm++;
                    } else if (pick === 'sisyphus') {
                        curSis++;
                        boughtSis++;
                    }
                    
                    frags.div -= 999;
                }
                
                if (boughtHades > 0 || boughtProm > 0 || boughtSis > 0) {
                    if (boughtHades > 0) state.external_levels = { ...state.external_levels, 21: curHades };
                    if (boughtProm > 0) state.prometheus_level = curProm;
                    if (boughtSis > 0) state.sisyphus_level = curSis;

                    const idolsAreMaxed = (state.external_levels[21] || 0) >= 6666;

                    hadesLevelsSinceLastReopt += boughtHades;
                    let reoptMsg = "";
                    
                    if (hadesLevelsSinceLastReopt >= 100 || (!idolsWereMaxed && idolsAreMaxed)) {
                        reoptMsg = idolsAreMaxed ? " Hades Idol Maxed! Executing endgame pivot." : " Triggered build re-optimization.";
                        await pool.syncState(state);
                        
                        const totalBudget = state.arch_level + (state.upgrade_levels[12] || 0);
                        report(`Lvl ${state.arch_level}: Re-optimizing Farm...`);
                        await new Promise(r => setTimeout(r, 10));

                        await executeFarmOptimization(totalBudget, Math.max(0, getExpRequired(state.arch_level) - currentExp));

                        const statsKeys = getAvailableStatKeys(state);
                        const effectiveCaps = getEffectiveStatCaps(state);
                        state.push_stats = enforceBudget(state.push_stats, statsKeys, totalBudget, effectiveCaps);

                        const pushActualTargetState = { ...state, current_max_floor: state.current_max_floor + 1 };
                        await pool.syncState(pushActualTargetState);
                        currentPushYields = await getSmoothedYields(pool, pushActualTargetState, state.push_stats, 3);
                        await pool.syncState(state);
                        
                        lastFarmStr = formatBuildStr(state.base_stats, state);
                        lastPushStr = formatBuildStr(state.push_stats, state);
                        
                        hadesLevelsSinceLastReopt = 0;
                        pushBuildIsStale = true; // Hades gives combat power!
                    }
                    
                    history.push({
                        type: "system",
                        event: `💀 Divine Idols Tributed (+${boughtHades} Hades, +${boughtProm} Prom, +${boughtSis} Sis)`,
                        arch_sec: cumulativeArchSecs,
                        time_delta: 0,
                        active_build: "Farm",
                        active_build_str: lastFarmStr,
                        level: state.arch_level,
                        floor: state.current_max_floor,
                        desc: `Auto-spent Divine Fragments. Hades: ${state.external_levels[21]}, Prom: ${state.prometheus_level}, Sis: ${state.sisyphus_level}.${reoptMsg}`,
                        yields: { farm: currentFarmYields, push: currentPushYields, frag_potential: currentFragPotential },
                        frags: { ...frags },
                        card_progress: { ...card_progress },
                        state_snapshot: captureSnapshot(state)
                    });

                    if (!idolsWereMaxed && idolsAreMaxed) {
                        // Immediately trigger the Phase 2 Pivot metric
                        const totalBudget = state.arch_level + (state.upgrade_levels[12] || 0);
                        await executeFarmOptimization(totalBudget, 0);

                        history.push({
                            type: "system",
                            event: `⚔️ Endgame Phase 2: Card Hunting Pivot`,
                            arch_sec: cumulativeArchSecs,
                            time_delta: 0,
                            active_build: "Farm",
                            active_build_str: lastFarmStr,
                            level: state.arch_level,
                            floor: state.current_max_floor,
                            desc: `Hades Idol maxed. Pure fragment farming abandoned. Build permanently optimized to brute-force highest unmaxed block tiers.`,
                            yields: { farm: currentFarmYields, push: currentPushYields, frag_potential: currentFragPotential },
                            frags: { ...frags },
                            card_progress: { ...card_progress },
                            state_snapshot: captureSnapshot(state)
                        });
                    }
                }
            }
        }

        // 4. RESOLVE EVENT
        let timeGap = cumulativeArchSecs - lastEventTime;

        if (eventType === 'level') {
            state.arch_level++;
            currentExp = 0; // Reset exp
            
            const totalBudget = state.arch_level + (state.upgrade_levels[12] || 0);

            // PHASE 3.5: Lazy Dual-Track Optimizer!
            report(`Lvl ${state.arch_level}: Optimizing Farm Build...`);
            await new Promise(r => setTimeout(r, 10)); // Force UI Paint
            
            await executeFarmOptimization(totalBudget, Math.max(0, getExpRequired(state.arch_level) - currentExp));

            // LAZY OPTIMIZATION: Defer Push build re-optimization until a floor push is actually attempted.
            // FIX: Top-up the stale push build so logs and yield snapshots have the mathematically correct stat point total!
            const statsKeys = getAvailableStatKeys(state);
            const effectiveCaps = getEffectiveStatCaps(state);
            state.push_stats = enforceBudget(state.push_stats, statsKeys, totalBudget, effectiveCaps);

            // We just sync the yields of the topped-up push build here so the UI snapshot isn't broken.
            const pushActualTargetState = { ...state, current_max_floor: state.current_max_floor + 1 };
            await pool.syncState(pushActualTargetState);
            currentPushYields = await getSmoothedYields(pool, pushActualTargetState, state.push_stats, 3);
            await pool.syncState(state);
            unspentPoints = 0;
            pushBuildIsStale = true; // Stat points added!

            const farmStr = formatBuildStr(state.base_stats, state);
            const pushStr = formatBuildStr(state.push_stats, state);

            history.push({
                type: "level",
                event: `🎉 Level Up: Arch ${state.arch_level}`,
                arch_sec: cumulativeArchSecs,
                time_delta: timeGap,
                active_build: "Farm",
                active_build_str: lastFarmStr,
                level: state.arch_level,
                floor: state.current_max_floor,
                desc: `Farm: ${farmStr} | Push: ${pushStr}`,
                yields: { farm: currentFarmYields, push: currentPushYields, frag_potential: currentFragPotential },
                frags: { ...frags },
                card_progress: { ...card_progress },
                state_snapshot: captureSnapshot(state)
            });
            lastEventTime = cumulativeArchSecs;
            lastFarmStr = farmStr;
            lastPushStr = pushStr;

        } else if (eventType === 'upgrade') {
            // Buy Upgrade (Don't deduct if it's gems since we aren't tracking the gem bank perfectly yet)
            if (nextUpgradeCost.currency !== 'gems') {
                frags[ nextUpgradeCost.currency ] -= nextUpgradeCost.amount;
            }
            
            const newLvl = (state.upgrade_levels[ nextUpgradeId ] || 0) + 1;
            state.upgrade_levels = { ...state.upgrade_levels, [ nextUpgradeId ]: newLvl };

            // ECONOMY SKIP: If the upgrade strictly affects economy, skip the massive Push Build re-optimization!
            const ECONOMY_UPGRADES =[ 4, 5, 11, 16, 19, 21, 27, 35, 38, 42, 46 ];
            if (!ECONOMY_UPGRADES.includes(nextUpgradeId)) {
                pushBuildIsStale = true;
            }

            const upgName = UPGRADE_NAMES[ nextUpgradeId ] || `Upgrade ${nextUpgradeId}`;
            const fragUI = FRAG_NAMES_UI[ nextUpgradeCost.currency ] || nextUpgradeCost.currency;

            let upgDesc = `Cost: ${nextUpgradeCost.amount} ${fragUI}`;

            // RE-OPTIMIZE AFTER FRAGMENT UPGRADES (Because stats synergize with new unlocked limits!)
            if (nextUpgradeId >= 8) {
                const totalBudget = state.arch_level + (state.upgrade_levels[12] || 0);

                report(`Lvl ${state.arch_level}: Re-optimizing Farm after buying Upg ${nextUpgradeId}...`);
                await new Promise(r => setTimeout(r, 10));

                await executeFarmOptimization(totalBudget, Math.max(0, getExpRequired(state.arch_level) - currentExp));

                // LAZY OPTIMIZATION: Defer Push build re-optimization until a floor push is actually attempted.
                // FIX: Top-up the stale push build!
                const statsKeys = getAvailableStatKeys(state);
                const effectiveCaps = getEffectiveStatCaps(state);
                state.push_stats = enforceBudget(state.push_stats, statsKeys, totalBudget, effectiveCaps);

                const pushActualTargetState = { ...state, current_max_floor: state.current_max_floor + 1 };
                await pool.syncState(pushActualTargetState);
                currentPushYields = await getSmoothedYields(pool, pushActualTargetState, state.push_stats, 3);
                await pool.syncState(state);

                if (nextUpgradeId === 12) {
                    upgDesc += `. Gained +1 Stat Point -> Farm: ${formatBuildStr(state.base_stats, state)} | Push: ${formatBuildStr(state.push_stats, state)}`;
                } else {
                    upgDesc += `. Respecced -> Farm: ${formatBuildStr(state.base_stats, state)} | Push: ${formatBuildStr(state.push_stats, state)}`;
                }
            } else {
                // Gem Upgrades don't alter base breakpoints, just recalculate yields instantly
                await pool.syncState(state);
                currentFarmYields = await getSmoothedYields(pool, state, state.base_stats, 3);
                
                if ((state.external_levels[4] || 0) >= 3000) {
                    currentFragPotential = currentFarmYields;
                } else {
                    const currentBudget = state.arch_level + (state.upgrade_levels[12] || 0);
                    currentFragPotential = await getShadowFragYields(pool, state, currentBudget, getEffectiveStatCaps(state));
                }
                
                const pushActualTargetState = { ...state, current_max_floor: state.current_max_floor + 1 };
                await pool.syncState(pushActualTargetState);
                currentPushYields = await getSmoothedYields(pool, pushActualTargetState, state.push_stats, 3);
                await pool.syncState(state);
            }
            
            const farmStr = formatBuildStr(state.base_stats, state);
            const pushStr = formatBuildStr(state.push_stats, state);

            history.push({
                type: "upgrade",
                event: `🛒 Bought ${upgName} (Lvl ${newLvl})`,
                arch_sec: cumulativeArchSecs,
                time_delta: timeGap,
                active_build: "Farm",
                active_build_str: lastFarmStr,
                level: state.arch_level,
                floor: state.current_max_floor,
                desc: upgDesc,
                yields: { farm: currentFarmYields, push: currentPushYields, frag_potential: currentFragPotential },
                frags: { ...frags },
                card_progress: { ...card_progress },
                state_snapshot: captureSnapshot(state)
            });
            lastEventTime = cumulativeArchSecs;
            lastFarmStr = farmStr;
            lastPushStr = pushStr;
        } else if (eventType === 'card') {
            card_progress[ nextCardId ] = 0; // Reset progress for next tier
            state.cards = { ...state.cards, [ nextCardId ]: nextCardTargetLevel };
            
            let evtName = "Card Drop";
            if (nextCardTargetLevel === 2) evtName = `🃏 Base Card Dropped & Auto-Gilded: ${nextCardId}`;
            else if (nextCardTargetLevel === 3) evtName = `🔮 Poly Card Crafted: ${nextCardId}`;
            else if (nextCardTargetLevel === 4) evtName = `🔥 Infernal Card Crafted: ${nextCardId}`;

            // Infernal compounding kicks in!
            if (nextCardTargetLevel === 4) {
                state.total_infernal_cards = (state.total_infernal_cards || 0) + 1;
            }

            const totalBudget = state.arch_level + (state.upgrade_levels[ 12 ] || 0);

            report(`Lvl ${state.arch_level}: Re-optimizing Farm after ${nextCardId} drop...`);
            await new Promise(r => setTimeout(r, 10));

            // Re-map the mathematically optimal baseline since multipliers shifted
            await executeFarmOptimization(totalBudget, Math.max(0, getExpRequired(state.arch_level) - currentExp));

            // Top-up Push Build mathematically
            const statsKeys = getAvailableStatKeys(state);
            const effectiveCaps = getEffectiveStatCaps(state);
            state.push_stats = enforceBudget(state.push_stats, statsKeys, totalBudget, effectiveCaps);

            const pushActualTargetState = { ...state, current_max_floor: state.current_max_floor + 1 };
            await pool.syncState(pushActualTargetState);
            currentPushYields = await getSmoothedYields(pool, pushActualTargetState, state.push_stats, 3);
            await pool.syncState(state);
            
            pushBuildIsStale = true; // Cards always confer combat power

            const farmStr = formatBuildStr(state.base_stats, state);
            const pushStr = formatBuildStr(state.push_stats, state);

            let cardDesc = `Card leveled up to ${nextCardTargetLevel}.`;
            if (nextCardTargetLevel === 4) {
                cardDesc += ` Total Infernals is now ${state.total_infernal_cards}.`;
            }
            cardDesc += ` Respecced -> Farm: ${farmStr} | Push: ${pushStr}`;

            history.push({
                type: "card",
                event: evtName,
                arch_sec: cumulativeArchSecs,
                time_delta: timeGap,
                active_build: "Farm",
                active_build_str: lastFarmStr,
                level: state.arch_level,
                floor: state.current_max_floor,
                desc: cardDesc,
                yields: { farm: currentFarmYields, push: currentPushYields, frag_potential: currentFragPotential },
                frags: { ...frags },
                card_progress: { ...card_progress },
                state_snapshot: captureSnapshot(state)
            });
            
            lastEventTime = cumulativeArchSecs;
            lastFarmStr = farmStr;
            lastPushStr = pushStr;
        }

        // 5. ORGANIC FLOOR PUSH LOOP
        // Check if there are more instantly affordable upgrades. If so, defer the floor push until they are bought!
        let hasInstantUpgrade = false;
        for (const upgId of upgradeTargets) {
            const currentLvl = state.upgrade_levels[ upgId ] || 0;
            if ((upgId === 3 || upgId === 4 || upgId === 5) && currentLvl >= state.arch_level) continue;
            
            const cap = INTERNAL_UPGRADE_CAPS[upgId];
            if (cap !== undefined && currentLvl >= cap) continue;

            const reqFlr = UPGRADE_LEVEL_REQS[upgId] || 0;
            if (state.current_max_floor < reqFlr) continue;

            const cost = calculateUpgradeCost(upgId, currentLvl + 1, 2);
            if (cost) {
                if (cost.currency === 'gems' || (frags[ cost.currency ] || 0) >= cost.amount) {
                    hasInstantUpgrade = true;
                    break;
                }
            }
        }

        // Floor Pushing permanently disables itself once Floor 200 is reached
        if (!hasInstantUpgrade && state.current_max_floor < 200) {
            // Note: pushBuildIsStale is now controlled globally by combat events!

            while (true) {
                const expNeeded = Math.max(0, getExpRequired(state.arch_level) - currentExp);
                const currentXpRate = currentFarmYields?.xp_per_min || 1;
                const timeToNextLevelSecs = (expNeeded / currentXpRate) * 60;

                if (timeToNextLevelSecs <= 0) break;

                if (pushBuildIsStale) {
                    report(`Lvl ${state.arch_level}: Generating exact Push Build for Flr ${state.current_max_floor + 1}...`);
                    await new Promise(r => setTimeout(r, 10));
                    
                    const pushBudget = state.arch_level + (state.upgrade_levels[12] || 0);
                    const pushTestState = { ...state, current_max_floor: 200 };
                    const optPush = await runFastOptimizer(pool, pushTestState, 'highest_floor', pushBudget, state.push_stats, 12);
                    state.push_stats = optPush.bestBuild;
                    lastPushStr = formatBuildStr(state.push_stats, state);
                    pushBuildIsStale = false;
                }

                report(`Lvl ${state.arch_level}: Proving Win Rate for multi-floor jump...`);
                await new Promise(r => setTimeout(r, 10));

                const pushResult = await attemptMultiFloorPush(pool, state, timeToNextLevelSecs, minWinRate / 100.0, 150);
                
                if (pushResult.success) {
                    const oldFloor = state.current_max_floor;
                    state.current_max_floor = pushResult.newMaxFloor;
                    
                    cumulativeArchSecs += pushResult.timePenaltySecs;
                    
                    const penaltyMins = pushResult.timePenaltySecs / 60.0;
                    currentExp += (pushResult.pushYields.xp_per_min || 0) * penaltyMins;
                    Object.keys(frags).forEach(k => {
                        const rKey = FRAG_RATE_KEYS[k];
                        if (pushResult.pushYields[rKey]) frags[k] += pushResult.pushYields[rKey] * penaltyMins;
                    });
                    
                    for (const blockId of Object.keys(BLOCK_MIN_FLOORS)) {
                        const currentLvl = state.cards[ blockId ] || 0;
                        const isT4 = blockId.endsWith('4');
                        let rate = 0;
                        if (isT4 && currentLvl === 0) rate = pushResult.pushYields[ `card_base_${blockId}_per_min` ] || 0;
                        else if (!isT4 && currentLvl === 0) rate = pushResult.pushYields[ `card_base_${blockId}_per_min` ] || 0;
                        else if (!isT4 && (currentLvl === 1 || currentLvl === 2)) rate = pushResult.pushYields[ `card_poly_${blockId}_per_min` ] || 0;
                        else if (isT4 && (currentLvl === 1 || currentLvl === 2)) rate = pushResult.pushYields[ `card_poly_${blockId}_per_min` ] || 0;
                        else if (currentLvl === 3) rate = pushResult.pushYields[ `card_inf_${blockId}_per_min` ] || 0;
                        
                        if (rate > 0) {
                            card_progress[ blockId ] = (card_progress[ blockId ] || 0) + rate * penaltyMins;
                        }
                    }
                    
                    // We pushed the floor! Recalculate ALL yields against the new reality using smoothed averages!
                    await pool.syncState(state);
                    currentFarmYields = await getSmoothedYields(pool, state, state.base_stats, 3);
                    
                    if ((state.external_levels[4] || 0) >= 3000) {
                        currentFragPotential = currentFarmYields;
                    } else {
                        const currentBudget = state.arch_level + (state.upgrade_levels[12] || 0);
                        currentFragPotential = await getShadowFragYields(pool, state, currentBudget, getEffectiveStatCaps(state));
                    }
                    
                    const pushTestState = { ...state, current_max_floor: state.current_max_floor + 1 };
                    await pool.syncState(pushTestState);
                    currentPushYields = await getSmoothedYields(pool, pushTestState, state.push_stats, 3);
                    await pool.syncState(state);

                    // Calculate newly unlocked upgrades across ALL floors gained in the jump!
                const newUpgs = Object.entries(UPGRADE_LEVEL_REQS)
                    .filter(([id, reqFlr]) => reqFlr > oldFloor && reqFlr <= state.current_max_floor)
                    .map(([id]) => UPGRADE_NAMES[id] || `Upg ${id}`);

                // Calculate newly spawning blocks across ALL floors gained!
                const newBlocks = Object.entries(BLOCK_MIN_FLOORS)
                    .filter(([id, minFlr]) => minFlr > oldFloor && minFlr <= state.current_max_floor)
                    .map(([id]) => {
                        const type = id.replace(/[0-9]/g, '');
                        const tier = id.replace(/[^0-9]/g, '');
                        return `${FRAG_NAMES_UI[type] || type} T${tier}`;
                    });
                
                const winRateStr = (pushResult.winRate * 100).toFixed(0);
                
                let timeCostStr = "";
                if (pushResult.timePenaltySecs >= 1000000) timeCostStr = (pushResult.timePenaltySecs / 1000000).toFixed(2) + "m";
                else if (pushResult.timePenaltySecs >= 1000) timeCostStr = (pushResult.timePenaltySecs / 1000).toFixed(1) + "k";
                else timeCostStr = Math.floor(pushResult.timePenaltySecs).toString();
                
                let floorDesc = `Brute-forced ceiling with ${winRateStr}% win rate. (Jumped from ${oldFloor} to ${state.current_max_floor}!)`;
                if (newUpgs.length > 0) floorDesc += ` Unlocks: ${newUpgs.join(', ')}.`;
                if (newBlocks.length > 0) floorDesc += ` New Blocks: ${newBlocks.join(', ')}.`;

                let timeGapPush = cumulativeArchSecs - lastEventTime;
                
                history.push({
                    type: "floor",
                    event: `🚀 Max Floor Pushed to ${state.current_max_floor}`,
                    arch_sec: cumulativeArchSecs,
                    time_delta: timeGapPush,
                    active_build: "Push",
                    active_build_str: lastPushStr,
                    level: state.arch_level,
                    floor: state.current_max_floor,
                    desc: floorDesc,
                    yields: { farm: currentFarmYields, push: currentPushYields, frag_potential: currentFragPotential },
                    frags: { ...frags },
                    card_progress: { ...card_progress },
                    state_snapshot: captureSnapshot(state)
                });
                lastEventTime = cumulativeArchSecs;
            } else {
                // The current build failed the wall. 
                if (!pushBuildIsStale) {
                    // It failed with a FRESH build. This is an absolute ceiling. Stop pushing.
                    break; 
                } else {
                    // It failed with an OLD build. Try re-optimizing the stats ONE time to see if we can break it!
                    pushBuildIsStale = true;
                    continue;
                }
            }
        }
        } // End of !hasInstantUpgrade block

        // Send UI Progress
        report(`Simulating Timeline (Level ${state.arch_level} / ${targetLevel})...`);
    }

    history.push({
        type: "system",
        event: "Simulation Complete",
        arch_sec: cumulativeArchSecs,
        level: state.arch_level,
        floor: state.current_max_floor,
        desc: "Reached testing limits.",
        yields: { farm: currentFarmYields, push: currentPushYields, frag_potential: currentFragPotential },
        frags: { ...frags },
        state_snapshot: captureSnapshot(state)
    });

    return { history, final_state: state };
}