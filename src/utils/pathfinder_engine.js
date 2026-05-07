// src/utils/pathfinder_engine.js

import { calculateUpgradeCost, UPGRADE_NAMES, UPGRADE_LEVEL_REQS, BLOCK_MIN_FLOORS } from '../game_data';
import { generateDistributions } from './optimizer';

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

// Tests a dynamic coarse grid of full redistributions + immediate neighbors to jump over breakpoints!
async function smartRespec(pool, state, targetMetric, currentBuild, addedPoints = 1, samples = 3) {
    await pool.syncState(state);
    
    const stats = getAvailableStatKeys(state);
    const budget = stats.reduce((sum, s) => sum + (currentBuild[s] || 0), 0) + addedPoints;

    const candidates = [ ];
    stats.forEach(s => candidates.push({ ...currentBuild, [s]: (currentBuild[s] || 0) + addedPoints }));

    let step = Math.max(1, Math.ceil(budget / 3));
    let grid = generateDistributions(stats, budget, step, null);
    while (grid.length > 100 && step < budget) {
        step++;
        grid = generateDistributions(stats, budget, step, null);
    }
    candidates.push(...grid);

    const uniqueKeys = new Set();
    const finalCandidates = [ ];
    for (const c of candidates) {
        const key = stats.map(s => c[s] || 0).join(',');
        if (!uniqueKeys.has(key)) {
            uniqueKeys.add(key);
            finalCandidates.push(c);
        }
    }

    const promises = finalCandidates.map(async (testStats) => {
        const avgYields = await getSmoothedYields(pool, state, testStats, samples);
        return { build: testStats, val: avgYields[targetMetric], yields: avgYields };
    });

    const results = await Promise.all(promises);
    
    let bestBuild = currentBuild;
    let bestVal = -1;
    let bestYields = null;

    for (const res of results) {
        if (res.val > bestVal) {
            bestVal = res.val;
            bestBuild = res.build;
            bestYields = res.yields;
        }
    }
    
    return { bestBuild, bestYields };
}

// Tests if the specialized Push Build is mathematically capable of surviving 1 floor higher
// Runs a batch of 25 to accurately detect the 5-10% lucky/miracle runs!
async function attemptFloorPush(pool, state, samples = 25) {
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

export async function runPathfinderSimulation(startState, pool, onProgress) {
    // 1. Initialize Tracked State (Dual-Track the base stats!)
    let state = { 
        ...startState, 
        push_stats: { ...startState.base_stats } 
    };
    let cumulativeArchSecs = 0;
    let lastEventTime = 0;
    let currentExp = 0;
    let unspentPoints = 0;
    
    // Fragment Banks
    let frags = { dirt: 0, com: 0, rare: 0, epic: 0, leg: 0, myth: 0, div: 0 };
    
    let history = [ ];
    let lastFarmStr = "";
    let lastPushStr = "";
    
    // Safety limit for Phase 2 testing (Stop at Arch 30 or 2000 events)
    const TARGET_LEVEL = 30;
    let eventCount = 0;
    const MAX_EVENTS = 2000;

    // Define the core Internal Upgrades to track for "Goal 2: Max Internal Upgrades"
    // CRITICAL: Added 8 (Abilities) and 12 (Stat Points)!
    const upgradeTargets =[ 3, 4, 5, 8, 9, 10, 11, 12, 13, 14, 15, 16 ]; 

    // --- STARTUP STAT BUDGET SYNC ---
    // If the template starts at Level 1, it has 0 points. We must inject the Level 1 base point!
    const getSum = (build) => getAvailableStatKeys(state).reduce((sum, s) => sum + (build[s] || 0), 0);
    const expectedBudget = state.arch_level + (state.upgrade_levels[12] || 0);
    const startupPoints = Math.max(0, expectedBudget - getSum(state.base_stats));

    let currentFarmYields = null;
    let currentPushYields = null;

    if (startupPoints > 0) {
        const optFarm = await smartRespec(pool, state, 'xp_per_min', state.base_stats, startupPoints, 3);
        state.base_stats = optFarm.bestBuild;
        currentFarmYields = optFarm.bestYields;
        
        const pushTestState = { ...state, current_max_floor: state.current_max_floor + 1 };
        const optPush = await smartRespec(pool, pushTestState, 'highest_floor', state.push_stats, startupPoints, 8); // 8 samples captures low-chance early push gradients!
        state.push_stats = optPush.bestBuild;
        currentPushYields = optPush.bestYields;
        
        await pool.syncState(state);
    } else {
        currentFarmYields = await getSmoothedYields(pool, state, state.base_stats, 3);
        const pushTestState = { ...state, current_max_floor: state.current_max_floor + 1 };
        await pool.syncState(pushTestState);
        currentPushYields = await getSmoothedYields(pool, pushTestState, state.push_stats, 3);
        await pool.syncState(state);
    }

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

    while (state.arch_level < TARGET_LEVEL && eventCount < MAX_EVENTS) {
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
            if ((upgId === 3 || upgId === 4 || upgId === 5) && currentLvl >= state.arch_level) {
                continue;
            }

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
            unspentPoints++; // Track points to distribute
            
            // PHASE 3.5: Dual-Track Smart Redistribution!
            const optFarm = await smartRespec(pool, state, 'xp_per_min', state.base_stats, unspentPoints, 3);
            state.base_stats = optFarm.bestBuild;
            currentFarmYields = optFarm.bestYields;

            const pushTestState = { ...state, current_max_floor: state.current_max_floor + 1 };
            const optPush = await smartRespec(pool, pushTestState, 'highest_floor', state.push_stats, unspentPoints, 8);
            state.push_stats = optPush.bestBuild;
            currentPushYields = optPush.bestYields;
            
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

            // If we just bought "Stat Points" (Upgrade 12), immediately optimize and apply the +1 Point!
            if (nextUpgradeId === 12) {
                const optFarm = await smartRespec(pool, state, 'xp_per_min', state.base_stats, 1, 3);
                state.base_stats = optFarm.bestBuild;

                const pushTestState = { ...state, current_max_floor: state.current_max_floor + 1 };
                const optPush = await smartRespec(pool, pushTestState, 'highest_floor', state.push_stats, 1, 8);
                state.push_stats = optPush.bestBuild;
                
                await pool.syncState(state);
                
                upgDesc += `. Gained +1 Stat Point -> Farm: ${formatBuildStr(state.base_stats, state)} | Push: ${formatBuildStr(state.push_stats, state)}`;
            }

            // Recalculate BOTH yields using smoothed averages!
            currentFarmYields = await getSmoothedYields(pool, state, state.base_stats, 3);
            
            const pushTestState = { ...state, current_max_floor: state.current_max_floor + 1 };
            await pool.syncState(pushTestState);
            currentPushYields = await getSmoothedYields(pool, pushTestState, state.push_stats, 3);
            await pool.syncState(state);
            
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
            onProgress({
                progress: (state.arch_level / TARGET_LEVEL) * 100,
                status: `Simulating... (Level ${state.arch_level})`
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