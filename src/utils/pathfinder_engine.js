// src/utils/pathfinder_engine.js

import { calculateUpgradeCost, UPGRADE_NAMES, UPGRADE_LEVEL_REQS, BLOCK_MIN_FLOORS, INTERNAL_UPGRADE_CAPS } from '../game_data';
import { generateDistributions, topUpBuild } from './optimizer';

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
    
    let avgYields = { xp_per_min: 0, highest_floor: 0 };
    for (let i = 0; i <= 6; i++) avgYields[`frag_${i}_per_min`] = 0;

    batchResults.forEach(res => {
        avgYields.xp_per_min += res.xp_per_min || 0;
        avgYields.highest_floor += res.highest_floor || 0;
        for (let i = 0; i <= 6; i++) avgYields[`frag_${i}_per_min`] += res[`frag_${i}_per_min`] || 0;
    });

    Object.keys(avgYields).forEach(k => avgYields[k] /= samples);
    return avgYields;
}

// Runs a lightning-fast Successive Halving Grid Search to completely escape local minima
async function runFastOptimizer(pool, state, targetMetric, budget, previousBuild, samples = 5) {
    await pool.syncState(state);
    const stats = getAvailableStatKeys(state);
    const caps = getEffectiveStatCaps(state);
    const candidates = [ previousBuild ];

    const bounds = {};
    stats.forEach(s => bounds[s] = [0, Math.min(budget, caps[s])]);
    
    // 1. Inject Micro-Neighbors: Guarantee we test precise +1 breakpoints from the previous build!
    // We explicitly restrict neighbors to respect the effective caps.
    if (budget > 0) {
        stats.forEach(s => {
            if ((previousBuild[s] || 0) < bounds[s][1]) {
                const neighbor = { ...previousBuild, [s]: (previousBuild[s] || 0) + 1 };
                candidates.push(topUpBuild(neighbor, stats, budget, caps, bounds));
            }
        });
    }

    // 2. Coarse Grid Search
    let step = 1;
    if (stats.length >= 6) {
        if (budget >= 8) step = 2;
        if (budget >= 16) step = 3;
        if (budget >= 30) step = 4;
    }

    let alignBudget = budget - (budget % step);
    let grid = generateDistributions(stats, alignBudget, step, bounds);
    
    // Protect against browser lag spikes by expanding step size if combinatorial space explodes
    while (grid.length > 150 && step < budget) {
        step++;
        alignBudget = budget - (budget % step);
        grid = generateDistributions(stats, alignBudget, step, bounds);
    }
    
    grid.forEach(d => candidates.push(topUpBuild(d, stats, budget, caps, bounds)));

    // 3. Deduplicate
    const unique = new Map();
    candidates.forEach(d => unique.set(stats.map(s => d[s] || 0).join(','), d));
    const finalCandidates = Array.from(unique.values());

    // 4. Round 1 Filter (Mini-batch for Push Builds, with Secondary Tie-Breaker)
    const r1Samples = targetMetric === 'highest_floor' ? 2 : 1;
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
    const r2Promises = r2Candidates.map(async (testStats) => {
        const avgYields = await getSmoothedYields(pool, state, testStats, samples);
        return { build: testStats, val: avgYields[targetMetric] || 0, secondary: avgYields.xp_per_min || 0, yields: avgYields };
    });
    
    const r2Results = await Promise.all(r2Promises);
    
    r2Results.sort((a, b) => {
        if (b.val !== a.val) return b.val - a.val;
        return b.secondary - a.secondary;
    });
    
    return { bestBuild: r2Results[0].build, bestYields: r2Results[0].yields };
}

// Tests if the specialized Push Build is mathematically capable of surviving 1 floor higher
// Runs a batch of 50 to massively smooth out the RNG and accurately measure the Win Rate
async function attemptFloorPush(pool, state, samples = 50) {
    const nextFloor = state.current_max_floor + 1;
    const testState = { ...state, current_max_floor: nextFloor };
    
    // Briefly sync the engine to the new ceiling
    await pool.syncState(testState);
    
    // Fire a wide net of parallel simulations using the Push Build
    const tasks = Array.from({ length: samples }, () => pool.runTask(state.push_stats, testState.upgrade_levels, testState.external_levels, testState.cards));
    const batchResults = await Promise.all(tasks);
    
    let successes = 0;
    let totalTimeSec = 0;
    
    // Track the true average yields of the Push Build during these attempts
    let pushYields = { xp_per_min: 0, frag_0_per_min: 0, frag_1_per_min: 0, frag_2_per_min: 0, frag_3_per_min: 0, frag_4_per_min: 0, frag_5_per_min: 0, frag_6_per_min: 0 };
    
    batchResults.forEach(res => {
        totalTimeSec += res.total_time;
        if (res.highest_floor >= nextFloor) successes++;
        
        pushYields.xp_per_min += res.xp_per_min || 0;
        for (let i = 0; i <= 6; i++) {
            pushYields[`frag_${i}_per_min`] += res[`frag_${i}_per_min`] || 0;
        }
    });

    // Average the yields across the samples
    Object.keys(pushYields).forEach(k => pushYields[k] /= samples);

    if (successes > 0) {
        // Calculate probabilistic time penalty!
        const winRate = successes / samples;
        const expectedRuns = 1.0 / winRate;
        const avgRunTimeSecs = (totalTimeSec / samples); // natively Arch Seconds
        const timePenaltySecs = expectedRuns * avgRunTimeSecs;
        
        return { success: true, timePenaltySecs, winRate, pushYields };
    } else {
        // Revert the engine back to current reality
        await pool.syncState(state); 
        return { success: false };
    }
}

export async function runPathfinderSimulation(startState, targetLevel, initialFrags, pool, onProgress) {
    // 1. Initialize Tracked State (Dual-Track the base stats!)
    let state = { 
        ...startState, 
        push_stats: { ...startState.base_stats } 
    };
    let cumulativeArchSecs = 0;
    let lastEventTime = 0;
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
    
    let history = [ ];
    let lastFarmStr = "";
    let lastPushStr = "";
    
    // Dynamic event limit to prevent browser crashing if bounds are too high
    let eventCount = 0;
    const MAX_EVENTS = 3000;

    // Define the core Internal Upgrades to track
    const upgradeTargets =[ 3, 4, 5, 8, 9, 10, 11, 12, 13, 14, 15, 16 ]; 

    // --- STARTUP STAT BUDGET SYNC & RE-OPTIMIZATION ---
    // We forcefully re-optimize BOTH builds using the total expected budget at startup. 
    // This ensures that even if the user loads a garbage "Current Workspace" build, 
    // the timeline establishes a mathematically perfect baseline moving forward.
    const expectedBudget = state.arch_level + (state.upgrade_levels[12] || 0);

    let currentFarmYields = null;
    let currentPushYields = null;

    // 1. Establish perfect Farm Build
    const optFarm = await runFastOptimizer(pool, state, 'xp_per_min', expectedBudget, state.base_stats, 3);
    state.base_stats = optFarm.bestBuild;
    currentFarmYields = optFarm.bestYields;
    
    // 2. Establish perfect Push Build (Against uncapped gradient!)
    const pushTestState = { ...state, current_max_floor: 200 };
    const optPush = await runFastOptimizer(pool, pushTestState, 'highest_floor', expectedBudget, state.push_stats, 8);
    state.push_stats = optPush.bestBuild;
    
    // 3. Generate baseline UI Push Yields against actual target floor
    const pushActualTargetState = { ...state, current_max_floor: state.current_max_floor + 1 };
    currentPushYields = await getSmoothedYields(pool, pushActualTargetState, state.push_stats, 5);
    
    await pool.syncState(state);

    const farmStr = formatBuildStr(state.base_stats, state);
    const pushStr = formatBuildStr(state.push_stats, state);
    
    lastFarmStr = farmStr;
    lastPushStr = pushStr;

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
        yields: { farm: currentFarmYields, push: currentPushYields },
        frags: { ...frags }
    });

    const startLvl = state.arch_level;
    while (state.arch_level < targetLevel && eventCount < MAX_EVENTS) {
        eventCount++;

        // 1. SENSOR: Exclusively use the globally smoothed Farm Yields
        // This guarantees that Time Deltas and Resource Accruals match the UI Snapshot mathematically!
        const yields = currentFarmYields;
        
        // 2. TIMERS: Calculate Time To Next Milestone (TTNM)
        let t_next_level = Infinity;
        if (yields.xp_per_min > 0) {
            const expNeeded = getExpRequired(state.arch_level) - currentExp;
            t_next_level = expNeeded / yields.xp_per_min;
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

        // Prioritize Upgrades if they trigger at the exact same moment as a Level Up
        if (t_next_upgrade <= t_next_level && t_next_upgrade !== Infinity) {
            t_step = t_next_upgrade;
            eventType = 'upgrade';
        } else if (t_next_level !== Infinity) {
            t_step = t_next_level;
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

        // 4. RESOLVE EVENT
        let timeGap = cumulativeArchSecs - lastEventTime;

        if (eventType === 'level') {
            state.arch_level++;
            currentExp = 0; // Reset exp
            
            const totalBudget = state.arch_level + (state.upgrade_levels[12] || 0);

            // PHASE 3.5: Dual-Track Full Redistribution Optimizer!
            const optFarm = await runFastOptimizer(pool, state, 'xp_per_min', totalBudget, state.base_stats, 3);
            state.base_stats = optFarm.bestBuild;
            currentFarmYields = optFarm.bestYields;

            // CRITICAL GRADIENT FIX: Uncap the ceiling so the optimizer can map the true max floor!
            const pushTestState = { ...state, current_max_floor: 200 };
            const optPush = await runFastOptimizer(pool, pushTestState, 'highest_floor', totalBudget, state.push_stats, 8);
            state.push_stats = optPush.bestBuild;
            
            // Sync to the actual target floor to generate accurate UI yields
            const pushActualTargetState = { ...state, current_max_floor: state.current_max_floor + 1 };
            currentPushYields = await getSmoothedYields(pool, pushActualTargetState, state.push_stats, 5);

            await pool.syncState(state);
            unspentPoints = 0;

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
                yields: { farm: currentFarmYields, push: currentPushYields },
                frags: { ...frags }
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

            const upgName = UPGRADE_NAMES[ nextUpgradeId ] || `Upgrade ${nextUpgradeId}`;
            const fragUI = FRAG_NAMES_UI[ nextUpgradeCost.currency ] || nextUpgradeCost.currency;

            let upgDesc = `Cost: ${nextUpgradeCost.amount} ${fragUI}`;

            // RE-OPTIMIZE AFTER FRAGMENT UPGRADES (Because stats synergize with new unlocked limits!)
            if (nextUpgradeId >= 8) {
                const totalBudget = state.arch_level + (state.upgrade_levels[12] || 0);

                const optFarm = await runFastOptimizer(pool, state, 'xp_per_min', totalBudget, state.base_stats, 3);
                state.base_stats = optFarm.bestBuild;
                currentFarmYields = optFarm.bestYields;

                const pushTestState = { ...state, current_max_floor: 200 };
                const optPush = await runFastOptimizer(pool, pushTestState, 'highest_floor', totalBudget, state.push_stats, 8);
                state.push_stats = optPush.bestBuild;
                
                const pushActualTargetState = { ...state, current_max_floor: state.current_max_floor + 1 };
                currentPushYields = await getSmoothedYields(pool, pushActualTargetState, state.push_stats, 5);

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
                yields: { farm: currentFarmYields, push: currentPushYields },
                frags: { ...frags }
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

        if (!hasInstantUpgrade) {
            while (true) {
                const pushResult = await attemptFloorPush(pool, state);
                if (pushResult.success) {
                    state.current_max_floor++;
                    
                    // Add the expected time it took to probabilistically brute-force the run!
                    cumulativeArchSecs += pushResult.timePenaltySecs;
                    
                    // CRITICAL FIX: Accrue resources for the time spent grinding those brute-force attempts!
                    // We MUST use the yields from the PUSH BUILD, because that is what they were running!
                    const penaltyMins = pushResult.timePenaltySecs / 60.0;
                    currentExp += (pushResult.pushYields.xp_per_min || 0) * penaltyMins;
                    Object.keys(frags).forEach(k => {
                        const rKey = FRAG_RATE_KEYS[k];
                        if (pushResult.pushYields[rKey]) frags[k] += pushResult.pushYields[rKey] * penaltyMins;
                    });
                    
                    // We pushed the floor! Recalculate ALL yields against the new reality using smoothed averages!
                    await pool.syncState(state);
                    currentFarmYields = await getSmoothedYields(pool, state, state.base_stats, 3);
                    
                    const pushTestState = { ...state, current_max_floor: state.current_max_floor + 1 };
                    await pool.syncState(pushTestState);
                    currentPushYields = await getSmoothedYields(pool, pushTestState, state.push_stats, 3);
                    await pool.syncState(state);

                    // Calculate newly unlocked upgrades based on Floor!
                const newUpgs = Object.entries(UPGRADE_LEVEL_REQS)
                    .filter(([id, reqFlr]) => reqFlr === state.current_max_floor)
                    .map(([id]) => UPGRADE_NAMES[id] || `Upg ${id}`);

                // Calculate newly spawning blocks based on Floor!
                const newBlocks = Object.entries(BLOCK_MIN_FLOORS)
                    .filter(([id, minFlr]) => minFlr === state.current_max_floor)
                    .map(([id]) => {
                        const type = id.replace(/[0-9]/g, '');
                        const tier = id.replace(/[^0-9]/g, '');
                        return `${FRAG_NAMES_UI[type] || type} T${tier}`;
                    });
                
                const winRateStr = (pushResult.winRate * 100).toFixed(0);
                
                // Format the Arch Seconds penalty cleanly for the description
                let timeCostStr = "";
                if (pushResult.timePenaltySecs >= 1000000) timeCostStr = (pushResult.timePenaltySecs / 1000000).toFixed(2) + "m";
                else if (pushResult.timePenaltySecs >= 1000) timeCostStr = (pushResult.timePenaltySecs / 1000).toFixed(1) + "k";
                else timeCostStr = Math.floor(pushResult.timePenaltySecs).toString();
                
                let floorDesc = `Brute-forced ceiling with ${winRateStr}% win rate.`;
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
                    yields: { farm: currentFarmYields, push: currentPushYields },
                    frags: { ...frags }
                });
                lastEventTime = cumulativeArchSecs;
            } else {
                break; // Build is mathematically incapable of surviving the next floor yet
            }
        }
        } // End of !hasInstantUpgrade block

        // Send UI Progress
        if (onProgress) {
            const progressPct = ((state.arch_level - startLvl) / (targetLevel - startLvl)) * 100;
            onProgress({
                progress: Math.min(100, Math.max(0, progressPct)),
                status: `Simulating... (Level ${state.arch_level} / ${targetLevel})`
            });
        }
    }

    history.push({
        type: "system",
        event: "Simulation Complete",
        arch_sec: cumulativeArchSecs,
        level: state.arch_level,
        floor: state.current_max_floor,
        desc: "Reached testing limits."
    });

    return { history, final_state: state };
}