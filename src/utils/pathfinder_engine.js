// src/utils/pathfinder_engine.js

import { calculateUpgradeCost, UPGRADE_NAMES } from '../game_data';

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
export async function runPathfinderSimulation(startState, pool, onProgress) {
    // 1. Initialize Tracked State
    let state = { ...startState };
    let timeElapsedMins = 0;
    let currentExp = 0;
    let unspentPoints = 0;
    
    // Fragment Banks
    let frags = { dirt: 0, com: 0, rare: 0, epic: 0, leg: 0, myth: 0, div: 0 };
    
    let history = [ ];
    
    // Safety limit for Phase 2 testing (Stop at Arch 30 or 100 events)
    const TARGET_LEVEL = 30;
    let eventCount = 0;
    const MAX_EVENTS = 100;

    // Define the core Internal Upgrades to track for "Goal 2: Max Internal Upgrades"
    // Added 3, 4, 5 to track Gem Upgrades!
    const upgradeTargets =[ 3, 4, 5, 9, 10, 11, 13, 14, 15, 16 ]; 

    history.push({
        type: "system",
        event: "Simulation Started",
        time_mins: 0,
        level: state.arch_level,
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
            
            // Gem Upgrades are strictly capped by Current Max Floor
            if ((upgId === 3 || upgId === 4 || upgId === 5) && currentLvl >= state.current_max_floor) {
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
        let t_step = Math.min(t_next_level, t_next_upgrade);
        
        // Failsafe for soft-locks (e.g. 0 yields)
        if (t_step === Infinity || t_step <= 0) t_step = 1; 

        // Apply Time & Accrue Resources
        timeElapsedMins += t_step;
        currentExp += yields.xp_per_min * t_step;
        Object.keys(frags).forEach(k => {
            const rKey = FRAG_RATE_KEYS[ k ];
            if (yields[ rKey ]) frags[ k ] += yields[ rKey ] * t_step;
        });

        // 4. RESOLVE EVENT
        if (t_step === t_next_level) {
            state.arch_level++;
            currentExp = 0; // Reset exp
            unspentPoints++;
            
            // Phase 2 Dummy Logic: Just dump points into Strength to keep growing
            state.base_stats = { ...state.base_stats, Str: (state.base_stats.Str || 0) + unspentPoints };
            unspentPoints = 0;

            history.push({
                type: "level",
                event: `🎉 Level Up: Arch ${state.arch_level}`,
                time_mins: timeElapsedMins,
                level: state.arch_level,
                desc: `Dumped stat point into Str.`,
                yields: { ...yields }
            });

            // Phase 2 Dummy Logic: Immediately trigger a Max Floor Push after Leveling Up
            state.current_max_floor++;
            history.push({
                type: "floor",
                event: `🚀 Max Floor Pushed to ${state.current_max_floor}`,
                time_mins: timeElapsedMins,
                level: state.arch_level,
                desc: `Unlocked new ceiling for Gem Upgrades.`,
                yields: { ...yields }
            });
            
        } else if (t_step === t_next_upgrade) {
            // Buy Upgrade (Don't deduct if it's gems since we aren't tracking the gem bank perfectly yet)
            if (nextUpgradeCost.currency !== 'gems') {
                frags[ nextUpgradeCost.currency ] -= nextUpgradeCost.amount;
            }
            
            const newLvl = (state.upgrade_levels[ nextUpgradeId ] || 0) + 1;
            state.upgrade_levels = { ...state.upgrade_levels, [ nextUpgradeId ]: newLvl };

            const upgName = UPGRADE_NAMES[ nextUpgradeId ] || `Upgrade ${nextUpgradeId}`;
            const fragUI = FRAG_NAMES_UI[ nextUpgradeCost.currency ] || nextUpgradeCost.currency;

            history.push({
                type: "upgrade",
                event: `🛒 Bought ${upgName} (Lvl ${newLvl})`,
                time_mins: timeElapsedMins,
                level: state.arch_level,
                desc: `Cost: ${nextUpgradeCost.amount} ${fragUI}`,
                yields: { ...yields }
            });
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
        event: "Simulation Complete",
        time_mins: timeElapsedMins,
        level: state.arch_level,
        desc: "Reached testing limits."
    });

    return { history, final_state: state };
}