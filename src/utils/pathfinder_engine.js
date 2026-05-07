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
async function incrementalOptimize(pool, state, targetMetric) {
    const stats = getAvailableStatKeys(state);
    let bestStat = 'Str';
    let bestVal = -1;
    let bestYields = null;

    const promises = stats.map(async (stat) => {
        const testStats = { ...state.base_stats, [stat]: (state.base_stats[stat] || 0) + 1 };
        const yields = await pool.runTask(testStats, state.upgrade_levels, state.external_levels, state.cards);
        return { stat, val: yields[targetMetric] || 0, yields };
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

// Tests if the current build is mathematically capable of surviving 1 floor higher
async function attemptFloorPush(pool, state) {
    const nextFloor = state.current_max_floor + 1;
    const testState = { ...state, current_max_floor: nextFloor };
    
    // Briefly sync the engine to the new ceiling
    await pool.syncState(testState);
    const yields = await pool.runTask(testState.base_stats, testState.upgrade_levels, testState.external_levels, testState.cards);
    
    if (yields.highest_floor >= nextFloor) {
        return { success: true, yields };
    } else {
        // Revert the engine back to current reality
        await pool.syncState(state); 
        return { success: false, yields: null };
    }
}

export async function runPathfinderSimulation(startState, pool, onProgress) {
    // 1. Initialize Tracked State
    let state = { ...startState };
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
            
            // PHASE 3: Micro-Optimizer! 
            // Concurrently test distributing the 1 gained point to maximize xp_per_min
            const optResult = await incrementalOptimize(pool, state, 'xp_per_min');
            state.base_stats = { ...state.base_stats, [optResult.bestStat]: (state.base_stats[optResult.bestStat] || 0) + 1 };
            postEventYields = optResult.bestYields;

            history.push({
                type: "level",
                event: `🎉 Level Up: Arch ${state.arch_level}`,
                time_mins: timeElapsedMins,
                level: state.arch_level,
                floor: state.current_max_floor,
                desc: `Optimizer placed +1 stat point into ${optResult.bestStat}. Unlocked new ceiling for Gem Upgrades.`,
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
        // After every event, keep attempting to push the floor as long as the new build can survive it!
        while (true) {
            const pushResult = await attemptFloorPush(pool, state);
            if (pushResult.success) {
                state.current_max_floor++;
                postEventYields = pushResult.yields;

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
                
                let floorDesc = `Ceiling mathematically breached!`;
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