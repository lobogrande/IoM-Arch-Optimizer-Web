// src/utils/pathfinder_engine.js

import { calculateUpgradeCost, UPGRADE_NAMES, UPGRADE_LEVEL_REQS, BLOCK_MIN_FLOORS } from '../game_data';

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
    if (state.asc2_unlocked) keys.push('Corr');
    return keys;
};

// Tests +1 point in every stat concurrently, returning the one that maximizes the target metric
// Uses a Mini-Monte Carlo batch to wash out extreme RNG spikes
async function incrementalOptimize(pool, state, targetMetric, samples = 3) {
    const stats = getAvailableStatKeys(state);
    let bestStat = 'Str';
    let bestVal = -1;
    let bestYields = null;

    const promises = stats.map(async (stat) => {
        const testStats = { ...state.base_stats, [stat]: (state.base_stats[stat] || 0) + 1 };
        
        // Fire batch of runs to the parallel worker pool
        const tasks = Array.from({ length: samples }, () => pool.runTask(testStats, state.upgrade_levels, state.external_levels, state.cards));
        const batchResults = await Promise.all(tasks);
        
        let sum = 0;
        let localBestYields = null;
        
        batchResults.forEach(res => {
            sum += res[targetMetric] || 0;
            // Keep the yields from the run that reached the absolute highest floor as our representative sample
            if (!localBestYields || res.highest_floor > localBestYields.highest_floor) {
                localBestYields = res;
            }
        });
        
        return { stat, val: sum / samples, yields: localBestYields };
    });

    const results = await Promise.all(promises);
    for (const res of results) {
        if (res.val > bestVal) {
            bestVal = res.val;
            bestStat = res.stat;
            bestYields = res.yields;
        }
    }
    return { bestStat, bestYields };
}

// Tests if the specialized Push Build is mathematically capable of surviving 1 floor higher
// Runs a batch of 10 to detect low-probability brute-force victories
async function attemptFloorPush(pool, state, samples = 10) {
    const nextFloor = state.current_max_floor + 1;
    const testState = { ...state, current_max_floor: nextFloor };
    
    // Briefly sync the engine to the new ceiling
    await pool.syncState(testState);
    
    // Fire a wide net of parallel simulations using the Push Build
    const tasks = Array.from({ length: samples }, () => pool.runTask(state.push_stats, testState.upgrade_levels, testState.external_levels, testState.cards));
    const batchResults = await Promise.all(tasks);
    
    let successes = 0;
    let totalTimeSec = 0;
    
    batchResults.forEach(res => {
        totalTimeSec += res.total_time;
        if (res.highest_floor >= nextFloor) successes++;
    });

    if (successes > 0) {
        // Calculate probabilistic time penalty!
        const winRate = successes / samples;
        const expectedRuns = 1.0 / winRate;
        const avgRunTimeMins = (totalTimeSec / samples) / 60.0;
        const timePenaltyMins = expectedRuns * avgRunTimeMins;
        
        return { success: true, timePenaltyMins, winRate };
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
    let timeElapsedMins = 0;
    let currentExp = 0;
    let unspentPoints = 0;
    
    // Fragment Banks
    let frags = { dirt: 0, com: 0, rare: 0, epic: 0, leg: 0, myth: 0, div: 0 };
    
    let history = [ ];
    
    // Safety limit for Phase 2 testing (Stop at Arch 30 or 2000 events)
    const TARGET_LEVEL = 30;
    let eventCount = 0;
    const MAX_EVENTS = 2000;

    // Define the core Internal Upgrades to track for "Goal 2: Max Internal Upgrades"
    // Added 3, 4, 5 to track Gem Upgrades!
    const upgradeTargets =[ 3, 4, 5, 9, 10, 11, 13, 14, 15, 16 ]; 

    history.push({
        type: "system",
        event: "Simulation Started",
        time_mins: 0,
        level: state.arch_level,
        floor: state.current_max_floor,
        desc: "Beginning Asc2 Journey"
    });

    while (state.arch_level < TARGET_LEVEL && eventCount < MAX_EVENTS) {
        eventCount++;

        // 1. SENSOR: Get current yields from Pyodide
        const yields = await pool.runTask(state.base_stats, state.upgrade_levels, state.external_levels, state.cards);
        
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
                time_mins: timeElapsedMins,
                level: state.arch_level,
                floor: state.current_max_floor,
                desc: "Yields dropped to 0. Cannot progress time."
            });
            break;
        }

        // Apply Time & Accrue Resources
        timeElapsedMins += t_step;
        currentExp += yields.xp_per_min * t_step;
        Object.keys(frags).forEach(k => {
            const rKey = FRAG_RATE_KEYS[ k ];
            if (yields[ rKey ]) frags[ k ] += yields[ rKey ] * t_step;
        });

        // 4. RESOLVE EVENT
        let postEventYields = yields; // Track the latest yields after the event resolves

        if (eventType === 'level') {
            state.arch_level++;
            currentExp = 0; // Reset exp
            
            // PHASE 3.5: Dual-Track Micro-Optimizer!
            // 1. Test where the new point goes for the Farming Build (xp_per_min)
            const optFarm = await incrementalOptimize(pool, { ...state, base_stats: state.base_stats }, 'xp_per_min');
            state.base_stats = { ...state.base_stats, [optFarm.bestStat]: (state.base_stats[optFarm.bestStat] || 0) + 1 };
            postEventYields = optFarm.bestYields;

            // 2. Test where the new point goes for the Push Build (highest_floor)
            const optPush = await incrementalOptimize(pool, { ...state, base_stats: state.push_stats }, 'highest_floor');
            state.push_stats = { ...state.push_stats, [optPush.bestStat]: (state.push_stats[optPush.bestStat] || 0) + 1 };

            history.push({
                type: "level",
                event: `🎉 Level Up: Arch ${state.arch_level}`,
                time_mins: timeElapsedMins,
                level: state.arch_level,
                floor: state.current_max_floor,
                desc: `Farm Build placed point in ${optFarm.bestStat}. Push Build placed point in ${optPush.bestStat}.`,
                yields: { ...postEventYields }
            });

        } else if (eventType === 'upgrade') {
            // Buy Upgrade (Don't deduct if it's gems since we aren't tracking the gem bank perfectly yet)
            if (nextUpgradeCost.currency !== 'gems') {
                frags[ nextUpgradeCost.currency ] -= nextUpgradeCost.amount;
            }
            
            const newLvl = (state.upgrade_levels[ nextUpgradeId ] || 0) + 1;
            state.upgrade_levels = { ...state.upgrade_levels, [ nextUpgradeId ]: newLvl };

            const upgName = UPGRADE_NAMES[ nextUpgradeId ] || `Upgrade ${nextUpgradeId}`;
            const fragUI = FRAG_NAMES_UI[ nextUpgradeCost.currency ] || nextUpgradeCost.currency;

            // Recalculate yields after the upgrade is applied
            postEventYields = await pool.runTask(state.base_stats, state.upgrade_levels, state.external_levels, state.cards);

            history.push({
                type: "upgrade",
                event: `🛒 Bought ${upgName} (Lvl ${newLvl})`,
                time_mins: timeElapsedMins,
                level: state.arch_level,
                floor: state.current_max_floor,
                desc: `Cost: ${nextUpgradeCost.amount} ${fragUI}`,
                yields: { ...postEventYields }
            });
        }

        // 5. ORGANIC FLOOR PUSH LOOP
        // After every event, keep attempting to push the floor using the secret PUSH build!
        while (true) {
            const pushResult = await attemptFloorPush(pool, state);
            if (pushResult.success) {
                state.current_max_floor++;
                
                // Add the expected time it took to probabilistically brute-force the run!
                timeElapsedMins += pushResult.timePenaltyMins;
                
                // CRITICAL: We pushed the floor! Now we must re-sync the engine to this new ceiling
                // and recalculate the FARMING yields, simulating the player respeccing back to farm!
                await pool.syncState(state);
                postEventYields = await pool.runTask(state.base_stats, state.upgrade_levels, state.external_levels, state.cards);

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
                const timeCostStr = pushResult.timePenaltyMins.toFixed(1);
                
                let floorDesc = `Brute-forced ceiling with ${winRateStr}% win rate. (Cost: ${timeCostStr} mins).`;
                if (newUpgs.length > 0) floorDesc += ` Unlocks: ${newUpgs.join(', ')}.`;
                if (newBlocks.length > 0) floorDesc += ` New Blocks: ${newBlocks.join(', ')}.`;

                history.push({
                    type: "floor",
                    event: `🚀 Max Floor Pushed to ${state.current_max_floor}`,
                    time_mins: timeElapsedMins,
                    level: state.arch_level,
                    floor: state.current_max_floor,
                    desc: floorDesc,
                    yields: { ...postEventYields }
                });
            } else {
                break; // Build is mathematically incapable of surviving the next floor yet
            }
        }

        // Send UI Progress
        if (onProgress) {
            onProgress({
                progress: (state.arch_level / TARGET_LEVEL) * 100,
                status: `Simulating... (Level ${state.arch_level}, Day ${(timeElapsedMins / 1440).toFixed(1)})`
            });
        }
    }

    history.push({
        type: "system",
        event: "Simulation Complete",
        time_mins: timeElapsedMins,
        level: state.arch_level,
        floor: state.current_max_floor,
        desc: "Reached testing limits."
    });

    return { history, final_state: state };
}