// src/components/simulations/OptimizerTab.jsx
import { useState, useMemo, useEffect } from 'react';
import useStore from '../../store';
import { EngineWorkerPool, getOptimalStepProfile, runOptimizationPhase, topUpBuild } from '../../utils/optimizer';
import ResultsDashboard from './ResultsDashboard';

const OPT_GOALS =[
  "Max Floor Push", 
  "Max EXP Yield", 
  "Fragment Farming", 
  "Block Card Farming"
];

const FRAG_NAMES = {
  0: "Dirt", 1: "Common", 2: "Rare", 3: "Epic", 4: "Legendary", 5: "Mythic", 6: "Divine"
};

export default function OptimizerTab() {
  const store = useStore();

  const optGoal = store.optGoal || "Max Floor Push";
  const targetFrag = store.targetFrag ? Math.max(1, store.targetFrag) : 1;
  const targetBlock = store.targetBlock ?? "myth3";
  const timeLimit = store.timeLimit ?? 60;
  const lockedStats = store.lockedStats || {};
  const simsPerSec = store.simsPerSec || 15;
  const allowUnspent = store.allowUnspent || false;

  const setOptGoal = (v) => store.setSimsState('optGoal', v);
  const setTargetFrag = (v) => store.setSimsState('targetFrag', v);
  const setTargetBlock = (v) => store.setSimsState('targetBlock', v);
  const setTimeLimit = (v) => store.setSimsState('timeLimit', v);
  const setLockedStats = (v) => store.setSimsState('lockedStats', v);
  const setSimsPerSec = (v) => store.setSimsState('simsPerSec', v);
  const setAllowUnspent = (v) => store.setSimsState('allowUnspent', v);

  const[displayTime, setDisplayTime] = useState(store.timeLimit || 60);

  useEffect(() => {
    const timer = setTimeout(() => {
      setTimeLimit(displayTime);
    }, 300);
    return () => clearTimeout(timer);
  }, [displayTime]);

  const[isOptimizing, setIsOptimizing] = useState(false);
  const [optProgressMsg, setOptProgressMsg] = useState("");
  const [optProgressPct, setOptProgressPct] = useState(0);

  // Profile Context for History
  const profileContext = useMemo(() => {
    const activeProfile = store.profiles?.find(p => p.id === store.activeProfileId);
    if (!activeProfile) return { id: null, name: "Guest", isModified: false, tag: "Guest" };
    
    const isEq = (a, b) => {
      const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
      for (const k of keys) if (Number(a[k] || 0) !== Number(b[k] || 0)) return false;
      return true;
    };
    
    let isMod = false;
    if (store.asc1_unlocked !== activeProfile.data.asc1_unlocked) isMod = true;
    else if (store.asc2_unlocked !== activeProfile.data.asc2_unlocked) isMod = true;
    else if (store.arch_level !== activeProfile.data.arch_level) isMod = true;
    else if (store.current_max_floor !== activeProfile.data.current_max_floor) isMod = true;
    else if (!!store.geoduck_unlocked !== !!activeProfile.data.geoduck_unlocked) isMod = true;
    else if (parseFloat(store.arch_ability_infernal_bonus || 0) !== parseFloat(activeProfile.data.arch_ability_infernal_bonus || 0)) isMod = true;
    else if ((store.total_infernal_cards || 0) !== (activeProfile.data.total_infernal_cards || 0)) isMod = true;
    else if (!isEq(store.base_stats, activeProfile.data.base_stats)) isMod = true;
    else if (!isEq(store.upgrade_levels, activeProfile.data.upgrade_levels)) isMod = true;
    else if (!isEq(store.external_levels, activeProfile.data.external_levels)) isMod = true;
    else if (!isEq(store.cards, activeProfile.data.cards)) isMod = true;

    return {
      id: activeProfile.id,
      name: activeProfile.name,
      isModified: isMod,
      tag: isMod ? `${activeProfile.name} *` : activeProfile.name
    };
  },[ store.activeProfileId, store.profiles, store.asc1_unlocked, store.asc2_unlocked, store.arch_level, store.current_max_floor, store.geoduck_unlocked, store.arch_ability_infernal_bonus, store.total_infernal_cards, store.base_stats, store.upgrade_levels, store.external_levels, store.cards ]);

  const capInc = parseInt(store.upgrade_levels[45] || 0) * 5;
  const dynamicBudget = parseInt(store.arch_level) + parseInt(store.upgrade_levels[12] || 0);

  const STAT_CAPS = {
    Str: 50 + capInc, Agi: 50 + capInc, Per: 25 + capInc, Int: 25 + capInc, Luck: 25 + capInc,
    Div: store.asc1_unlocked ? (10 + capInc) : 0, 
    Corr: store.asc2_unlocked ? (10 + capInc) : 0,
    Unassigned: dynamicBudget
  };

  const activeStats =[ 'Str', 'Agi', 'Per', 'Int', 'Luck' ];
  if (store.asc1_unlocked) activeStats.push('Div');
  if (store.asc2_unlocked) activeStats.push('Corr');

  const optActiveStats = [ ...activeStats ];
  if (optGoal === "Block Card Farming" && allowUnspent) {
    optActiveStats.push('Unassigned');
  }

  const bounds = {};
  let minSum = 0;
  let maxSum = 0;
  optActiveStats.forEach(s => {
    const lock = lockedStats[s];
    if (lock !== undefined) {
      let bMin = 0, bMax = STAT_CAPS[s];
      if (typeof lock === 'number') {
        bMin = lock; bMax = lock; 
      } else {
        if (lock.type === 'exact') { bMin = lock.val; bMax = lock.val; }
        else if (lock.type === 'min') { bMin = lock.val; bMax = STAT_CAPS[s]; }
        else if (lock.type === 'max') { bMin = 0; bMax = lock.val; }
        else if (lock.type === 'range') { bMin = lock.min; bMax = lock.max; }
      }
      bounds[s] = [ bMin, bMax ];
    } else {
      bounds[s] =[ 0, STAT_CAPS[s] ];
    }
    minSum += bounds[s][0];
    maxSum += bounds[s][1];
  });
  
  const isImpossible = minSum > dynamicBudget || maxSum < dynamicBudget;

  const profData = useMemo(() => {
    if (isImpossible) return null;
    return getOptimalStepProfile(optActiveStats, dynamicBudget, bounds, simsPerSec, timeLimit);
  },[JSON.stringify(optActiveStats), dynamicBudget, JSON.stringify(bounds), simsPerSec, timeLimit, isImpossible]);
  
  const step1 = profData ? profData.step_1 : 100;

  const handleLockToggle = (stat) => {
    const newLocks = { ...lockedStats };
    if (newLocks[stat] !== undefined) {
      delete newLocks[stat];
    } else {
      newLocks[stat] = { type: 'exact', val: store.base_stats[stat] || 0 };
    }
    setLockedStats(newLocks);
  };

  const handleLockChange = (stat, field, val) => {
    let parsed = parseInt(val) || 0;
    if (parsed > STAT_CAPS[stat]) parsed = STAT_CAPS[stat];
    if (parsed < 0) parsed = 0;
    
    const current = lockedStats[stat];
    const lockObj = current !== undefined ? (typeof current === 'number' ? { type: 'exact', val: current } : current) : { type: 'exact', val: 0 };
    
    if (field === 'type') {
       const baseVal = lockObj.val !== undefined ? lockObj.val : (lockObj.min !== undefined ? lockObj.min : 0);
       if (val === 'range') {
         setLockedStats({ ...lockedStats, [stat]: { type: val, min: baseVal, max: STAT_CAPS[stat] } });
       } else {
         setLockedStats({ ...lockedStats, [stat]: { type: val, val: baseVal } });
       }
       return;
    }

    const newLock = { ...lockObj, [field]: parsed };
    
    if (newLock.type === 'range') {
       if (field === 'min' && newLock.min > newLock.max) newLock.max = newLock.min;
       if (field === 'max' && newLock.max < newLock.min) newLock.min = newLock.max;
    }

    setLockedStats({ ...lockedStats, [stat]: newLock });
  };

  const handleRunOptimizer = async () => {
    setIsOptimizing(true);
    setOptProgressMsg("Calculating Execution Plan...");
    setOptProgressPct(0);

    try {
      const baseStateDict = {
        asc1_unlocked: store.asc1_unlocked,
        asc2_unlocked: store.asc2_unlocked,
        arch_level: store.arch_level,
        current_max_floor: store.current_max_floor,
        arch_ability_infernal_bonus: parseFloat(store.arch_ability_infernal_bonus) / 100.0,
        total_infernal_cards: store.total_infernal_cards,
        base_stats: store.base_stats,
        upgrade_levels: store.upgrade_levels,
        external_levels: { ...store.external_levels, 8: store.geoduck_unlocked ? (store.external_levels[ 8 ] || 0) : 0 },
        cards: store.cards
      };

      if (isImpossible) {
        alert(`❌ Invalid Constraints: Your locks require between ${minSum} and ${maxSum} points, but your budget is exactly ${dynamicBudget}.`);
        setIsOptimizing(false);
        return;
      }

      if (!profData) {
        alert("❌ Curse of Dimensionality! The AI could not find a mathematical step profile to fit the time limit. Lock more stats or increase the time limit.");
        setIsOptimizing(false);
        return;
      }

      const step2 = profData.step_2;
      const step3 = profData.step_3;

      setOptProgressMsg(`Booting Cores...`);
      const pool = new EngineWorkerPool();
      await pool.init(
        () => {}, 
        (ready, total) => setOptProgressMsg(`Booting Cores: ${ready}/${total}`)
      );

      setOptProgressMsg(`Synchronizing Player State...`);
      await pool.syncState(baseStateDict);

      const globalStartTime = Date.now();
      const targetMetricKey = (optGoal === "Fragment Farming") ? `frag_${targetFrag}_per_min` 
                            : (optGoal === "Block Card Farming") ? `block_${targetBlock}_per_min` 
                            : (optGoal === "Max EXP Yield") ? "xp_per_min" 
                            : "highest_floor";

      const fixedStats = {};
      Object.keys(store.base_stats).forEach(k => {
        if (!optActiveStats.includes(k)) fixedStats[k] = store.base_stats[k];
      });

      let totalSimsExecuted = 0;
      let lastProgressUpdate = 0;

      const onProgressCb = (phase, rnd, totRnd, comp, tot) => {
        totalSimsExecuted++;
        const now = Date.now();
        if (now - lastProgressUpdate > 500 || comp === tot) {
          const elapsed = (now - globalStartTime) / 1000;
          setOptProgressMsg(`⚙️ ${phase} | Round ${rnd}/${totRnd} | ${comp}/${tot} sims | ⏱️ Elapsed: ${elapsed.toFixed(1)}s / ${timeLimit}s`);
          setOptProgressPct((comp / tot) * 100);
          lastProgressUpdate = now;
        }
      };

      let p1Budget = dynamicBudget - ((dynamicBudget - minSum) % step1);
      
      const seedBuild = {};
      let seedValid = true;
      let seedSum = 0;
      optActiveStats.forEach(s => {
          let val = store.base_stats[s] || 0;
          if (s === 'Unassigned') {
              const globalSpent = activeStats.reduce((acc, stat) => acc + (store.base_stats[stat] || 0), 0);
              val = Math.max(0, dynamicBudget - globalSpent);
          }
          seedBuild[s] = val;
          seedSum += val;
          if (val < bounds[s][0] || val > bounds[s][1]) seedValid = false;
      });
      if (seedSum > dynamicBudget) seedValid = false;
      const validSeed = seedValid ? seedBuild : null;
      
      let { bestDist: bestP1, summary: sumP1 } = await runOptimizationPhase(
        "Phase 1 (Coarse)", targetMetricKey, optActiveStats, p1Budget, step1, 25,
        pool, fixedStats, bounds, timeLimit, globalStartTime, onProgressCb, validSeed
      );

      bestP1 = topUpBuild(bestP1, optActiveStats, dynamicBudget, STAT_CAPS, bounds);
      let bestFinal = bestP1;
      let finalSummary = sumP1;

      let bestP2, sumP2;
      if (bestP1 && ((Date.now() - globalStartTime) / 1000) < timeLimit) {
        const boundsP2 = {};
        let lockedSumP2 = 0;
        optActiveStats.forEach(s => {
          if (bounds[s][0] === bounds[s][1]) {
            boundsP2[s] = bounds[s];
            lockedSumP2 += bounds[s][0];
          } else {
            boundsP2[s] = [
              Math.max(bounds[s][0], bestP1[s] - step1),
              Math.min(bounds[s][1], bestP1[s] + step1)
            ];
          }
        });
        
        const p2Budget = dynamicBudget - ((dynamicBudget - lockedSumP2) % step2);

        const res2 = await runOptimizationPhase(
          "Phase 2 (Fine)", targetMetricKey, optActiveStats, p2Budget, step2, 50,
          pool, fixedStats, boundsP2, timeLimit, globalStartTime, onProgressCb
        );
        bestP2 = topUpBuild(res2.bestDist, optActiveStats, dynamicBudget, STAT_CAPS, boundsP2);
        sumP2 = res2.summary;
        if (bestP2) { bestFinal = bestP2; finalSummary = sumP2; }
      }

      if (bestP2 && ((Date.now() - globalStartTime) / 1000) < timeLimit) {
        const boundsP3 = {};
        const p3Radius = profData.p3_radius || Math.min(2, step2);
        optActiveStats.forEach(s => {
          if (bounds[s][0] === bounds[s][1]) {
            boundsP3[s] = bounds[s];
          } else {
            boundsP3[s] =[
              Math.max(bounds[s][0], bestP2[s] - p3Radius),
              Math.min(bounds[s][1], bestP2[s] + p3Radius)
            ];
          }
        });

        const res3 = await runOptimizationPhase(
          `Phase 3 (Radius ±${p3Radius})`, targetMetricKey, optActiveStats, dynamicBudget, profData.step_3 || 1, 100,
          pool, fixedStats, boundsP3, timeLimit, globalStartTime, onProgressCb
        );
        const bestP3 = topUpBuild(res3.bestDist, optActiveStats, dynamicBudget, STAT_CAPS, boundsP3);
        if (bestP3) { bestFinal = bestP3; finalSummary = res3.summary; }
      }

      const elapsed = (Date.now() - globalStartTime) / 1000;
      pool.terminate();
      
      if (elapsed > 0 && totalSimsExecuted > 0) {
          setSimsPerSec(Math.max(1, Math.floor(totalSimsExecuted / elapsed)));
      }
      
      if (bestFinal && finalSummary) {
          const chartHillScores = [sumP1 ? sumP1[targetMetricKey] : null, sumP2 ? sumP2[targetMetricKey] : null, finalSummary[targetMetricKey]].filter(x => x !== null);
          const chartHillLabels =["P1 (Coarse)", sumP2 ? "P2 (Fine)" : null, "P3 (Exact)"].filter(x => x !== null);
          const chartLoot = {};
          if (finalSummary.avg_metrics) {
              Object.entries(FRAG_NAMES).forEach(([tier, name]) => {
                  const k = `frag_${tier}_per_min`;
                  if (finalSummary.avg_metrics[k] > 0) chartLoot[name] = finalSummary.avg_metrics[k];
              });
          }

          const payload = {
              run_id: Date.now(),
              best_final: bestFinal,
              final_summary_out: finalSummary,
              elapsed: elapsed,
              time_limit_secs: timeLimit,
              run_target_metric: targetMetricKey,
              worst_val: finalSummary.worst_val || 0,
              avg_val: finalSummary.avg_val || 0,
              runner_up_val: finalSummary.runner_up_val || 0,
              chart_hist: finalSummary.floors.reduce((acc, f) => { acc[f] = (acc[f] || 0) + 1; return acc; }, {}),
              chart_hill_scores: chartHillScores,
              chart_hill_labels: chartHillLabels,
              chart_loot: chartLoot,
              show_loot: targetMetricKey !== 'highest_floor',
              show_wall: targetMetricKey === 'highest_floor'
          };

          store.setSimsState('synthesis_result', null);
          store.setOptResults(payload);
          store.addRunHistory({
              Include: false,
              Timestamp: Date.now(),
              ProfileId: profileContext.id,
              ProfileName: profileContext.name,
              IsModified: profileContext.isModified,
              Profile: profileContext.tag,
              Target: targetMetricKey,
              "Metric Score": finalSummary[targetMetricKey],
              "Avg Floor": finalSummary.avg_floor,
              "Max Floor": finalSummary.abs_max_floor,
              ...bestFinal,
              _restore_state: payload
          });

          store.setSimResTab('build');
          store.setSimDataTab('performance');

      } else {
          alert("⚠️ Optimization aborted or failed to find a valid build.");
      }
      
    } catch (err) {
      console.error(err);
      alert("🚨 CRITICAL ENGINE CRASH:\n" + err.message);
    } finally {
      setIsOptimizing(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">🚀 Monte Carlo Stat Optimizer</h2>
      <p className="text-st-text-light">Leverage Successive Halving to find highly optimized stat plateaus and statistical bests using your browser's local CPU cores.</p>
      
      <div className="st-container border-l-4 border-l-st-orange">
        <h4 className="font-bold mb-2">💡 Best Practice: The Optimal Workflow</h4>
        <div className="text-sm space-y-2">
          <p><strong>1. The Scout Run:</strong> Leave your stats unlocked. Run a fast 30-60s simulation. Did the AI drop any stats to 0? Did it push any to their Max?</p>
          <p><strong>2. The Refined Runs:</strong> Lock those obvious stats in the <strong>Stat Constraints</strong> below. By locking just 1 or 2 stats, the AI can scan the remaining stats with vastly higher precision. Run this 3 to 5 times.</p>
          <p><strong>3. The Synthesis:</strong> This optimizer provides highly optimized <em>local maxima</em> (stat plateaus). You <strong>must</strong> take your top refined runs and merge them in the <strong>Synthesis Tab</strong> to find the true global peak!</p>
          <p><strong>4. Deep Dives:</strong> Once you have your synthesized Meta-Build, test its performance in the <strong>Build Duel</strong>, calculate upgrades in the <strong>ROI Tab</strong>, or tweak its breakpoints manually in the <strong>Sandbox</strong>.</p>
        </div>
      </div>

      <details className="st-container group cursor-pointer marker:text-st-orange mb-4">
        <summary className="font-bold">ℹ️ How accurate are these projections?</summary>
        <div className="mt-4 text-sm space-y-3 cursor-default">
          <p><strong>The Good News:</strong> The environment generation in this engine is now <strong>100% identical</strong> to the live game's source code! However, because of the chaotic nature of critical hits, this tool provides highly optimized <em>plateaus</em> rather than a single "perfect" solution.</p>
          <p><strong>The Reality Check #1 (Score Variance):</strong> To keep optimizations lightning fast, the AI evaluates its final builds using <strong>100-simulation sprints</strong>. Because late-game drops rely on heavy RNG, you may see your final score bounce by ±5% between runs even if the AI picks the exact same stats! To flatten this RNG and get a true average, you must merge your runs in the <strong>Synthesis Tab</strong> (which uses deep 500-simulation marathons).</p>
          <p><strong>The Reality Check #2:</strong> The engine calculates <strong>100% Theoretical Efficiency</strong>. In the simulator, 0.000 seconds pass between killing an ore and hitting the next one. In the actual live game, minor animation delays and frame drops consume fractions of a second. Expect your actual real-world Yields to be roughly <strong>~5% to 10% lower</strong> than the mathematical perfection projected here.</p>
          {store.asc2_unlocked && (
            <p>🌌 <strong>Ascension 2 Note:</strong> Because Asc2 unlocks the <em>Corruption</em> stat, the AI must search an entire extra dimension of math. Optimizations will naturally take longer to compute than Asc1 runs!</p>
          )}
        </div>
      </details>

      <hr className="border-st-border" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-bold mb-1">Optimization Target</label>
          <select 
            value={optGoal} 
            onChange={(e) => setOptGoal(e.target.value)}
            className="w-full bg-st-bg border border-st-border rounded p-2 text-st-text focus:border-st-orange focus:outline-none"
          >
            {OPT_GOALS.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        
        <div>
          {optGoal === "Fragment Farming" && (
            <>
              <label className="block text-sm font-bold mb-1">Target Fragment</label>
              <select 
                value={targetFrag} 
                onChange={(e) => setTargetFrag(parseInt(e.target.value))}
                className="w-full bg-st-bg border border-st-border rounded p-2 text-st-text focus:border-st-orange focus:outline-none"
              >
                {Object.entries(FRAG_NAMES)
                  .filter(([val]) => {
                    const fragTier = parseInt(val);
                    if (fragTier === 0) return false; 
                    if (fragTier === 6 && !store.asc1_unlocked) return false; 
                    return true;
                  })
                  .map(([val, name]) => (
                    <option key={val} value={val}>{name}</option>
                ))}
              </select>
            </>
          )}
          {optGoal === "Block Card Farming" && (
            <>
              <label className="block text-sm font-bold mb-1">Target Block ID</label>
              <input 
                type="text" 
                value={targetBlock} 
                onChange={(e) => setTargetBlock(e.target.value.toLowerCase())}
                onBlur={(e) => { if (e.target.value.trim() === '') setTargetBlock('myth3'); }}
                placeholder="e.g., com1, myth3"
                className="w-full bg-st-bg border border-st-border rounded p-2 text-st-text focus:border-st-orange focus:outline-none"
              />
              <label className="flex items-center space-x-2 mt-3 cursor-pointer text-st-text-light hover:text-st-orange transition-colors">
                <input 
                  type="checkbox"
                  checked={allowUnspent}
                  onChange={(e) => setAllowUnspent(e.target.checked)}
                  className="accent-st-orange w-4 h-4"
                />
                <span className="text-sm font-bold">Allow Unspent Points (Crippled Build)</span>
              </label>
            </>
          )}
        </div>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-400 dark:border-blue-500 p-3 rounded text-sm text-blue-800 dark:text-blue-200 mt-4">
        {optGoal === "Max Floor Push" ? (
          <p>💡 <strong>Strategy Tip:</strong> Pushing deep floors requires balancing Damage, Armor Pen, Max Stamina and Crits. To force the AI to scan at an extreme precision, try opening the <strong>Stat Constraints</strong> below and locking <strong>Intelligence</strong> to 0 and <strong>Luck</strong> to your max stat cap!</p>
        ) : (
          <p>💡 <strong>Strategy Tip:</strong> If your target spawns on early floors (e.g., Dirt), you don't need Max Stamina or Armor Pen to reach it! Lock <strong>Agility</strong> and <strong>Perception</strong> to 0 to massively increase the precision of the AI's search.<br/><br/>⚠️ <strong>Wait, what if my target is late-game?</strong> If you are farming Tier 4 blocks (which spawn on Floor 81+), you STILL have to survive the gauntlet of tough ores to get there. Do not lock your survival stats to 0, or the AI will die before reaching your target!</p>
        )}
      </div>
      
      {optGoal === "Block Card Farming" && allowUnspent && (
        <div className="bg-red-900/20 border-l-4 border-red-500 p-3 rounded text-sm text-red-500 mt-4">
          ⚠️ <strong>Dimensionality Warning:</strong> You have activated the "Unspent Points" bucket! The AI must now search an 8th mathematical dimension. This increases the total possible combinations exponentially. To prevent timeouts or garbage low-precision data, you <strong>MUST</strong> lock at least 1 or 2 stats (like Strength or Agility) to 0 in the constraints below!
        </div>
      )}

      <hr className="border-st-border" />

      <details className="st-container group cursor-pointer marker:text-st-orange">
        <summary className="font-bold text-lg">🔒 Stat Constraints / Locking (Optional)</summary>
        <div className="mt-4 text-sm text-st-text-light mb-4">
          Locking a stat removes an entire dimension from the AI's search grid. For every stat you lock, the AI can scan the remaining unlocked stats significantly faster and deeper.
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 cursor-default">
          {optActiveStats.map(stat => {
            const lock = lockedStats[stat];
            const isLocked = lock !== undefined;
            const lockObj = isLocked ? (typeof lock === 'number' ? { type: 'exact', val: lock } : lock) : null;

            return (
              <div key={stat} className={`st-container flex flex-col items-center justify-between ${stat === 'Unassigned' ? 'border-st-orange/50 bg-st-orange/5' : ''}`}>
                <div className="font-bold mb-2 text-sm text-center">{stat === 'Unassigned' ? 'Unspent Points' : stat}</div>
                
                {stat === 'Unassigned' ? (
                  <div className="h-10 w-10 flex items-center justify-center text-3xl mb-3">🛑</div>
                ) : (
                  <img 
                    src={`/assets/stats_small/${stat.toLowerCase()}.png`} 
                    onError={(e) => { e.target.onerror = null; e.target.src = `/assets/stats/${stat.toLowerCase()}.png` }}
                    alt={stat} 
                    className="h-10 w-10 pixelated mb-3"
                  />
                )}
                
                <label className="flex items-center space-x-2 text-sm mb-2 cursor-pointer w-full justify-center">
                  <input 
                    type="checkbox"
                    checked={isLocked}
                    onChange={() => handleLockToggle(stat)}
                    className="accent-st-orange w-4 h-4"
                  />
                  <span className="select-none">Constraints</span>
                </label>
                
                <div className="w-full flex flex-col gap-1 mt-auto">
                  <select 
                    value={lockObj ? lockObj.type : 'exact'}
                    onChange={(e) => handleLockChange(stat, 'type', e.target.value)}
                    disabled={!isLocked}
                    className="w-full bg-st-secondary border border-st-border rounded p-1 text-xs text-st-text focus:border-st-orange focus:outline-none text-center disabled:opacity-50 disabled:cursor-not-allowed h-7"
                  >
                    <option value="exact">= Exact</option>
                    <option value="min">≥ Min</option>
                    <option value="max">≤ Max</option>
                    <option value="range">↔ Range</option>
                  </select>

                  {(!lockObj || lockObj.type !== 'range') ? (
                    <input
                      type="number"
                      value={lockObj ? lockObj.val : (store.base_stats[stat] || 0)}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => handleLockChange(stat, 'val', e.target.value)}
                      disabled={!isLocked}
                      className="w-full bg-st-secondary border border-transparent rounded p-1 text-xs text-center focus:border-st-orange focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed h-7"
                    />
                  ) : (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={lockObj.min}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => handleLockChange(stat, 'min', e.target.value)}
                        className="w-full bg-st-secondary border border-transparent rounded p-1 text-xs text-center focus:border-st-orange focus:outline-none h-7"
                        style={{ minWidth: 0 }}
                      />
                      <span className="text-xs text-st-text-light font-bold">-</span>
                      <input
                        type="number"
                        value={lockObj.max}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => handleLockChange(stat, 'max', e.target.value)}
                        className="w-full bg-st-secondary border border-transparent rounded p-1 text-xs text-center focus:border-st-orange focus:outline-none h-7"
                        style={{ minWidth: 0 }}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </details>

      <hr className="border-st-border" />

      <div>
        <label className="block font-bold mb-2">⏱️ Target Compute Time (Seconds)</label>
        <div className="flex items-center space-x-4 mb-6">
          <input 
            type="range" 
            min="10" 
            max="600" 
            step="10" 
            value={displayTime} 
            onChange={(e) => setDisplayTime(parseInt(e.target.value) || 10)}
            className="w-full accent-st-orange cursor-pointer"
          />
          <input 
            type="number"
            min="10"
            max="1800"
            step="10"
            value={displayTime === 0 ? '' : displayTime}
            onChange={(e) => setDisplayTime(e.target.value === '' ? 0 : parseInt(e.target.value))}
            onBlur={() => { const val = Math.max(10, displayTime); setDisplayTime(val); setTimeLimit(val); }}
            onKeyDown={(e) => { if(e.key === 'Enter') { const val = Math.max(10, displayTime); setDisplayTime(val); setTimeLimit(val); } }}
            className="st-input font-mono max-w-[120px]"
          />
        </div>

        {(() => {
          if (isImpossible || !profData) {
            return (
              <div style={{ border: `1px solid #ff4b4b`, borderLeft: `5px solid #ff4b4b`, backgroundColor: "rgba(255, 75, 75, 0.1)" }} className="p-4 rounded mb-4">
                <div className="font-bold text-lg mb-1">🛑 Invalid Constraints</div>
                <div className="text-sm">
                  Your constraints are mathematically impossible. 
                  {minSum > dynamicBudget ? ` Your minimum requirements (${minSum}) exceed your total points budget (${dynamicBudget}).` : ''}
                  {maxSum < dynamicBudget ? ` The maximum points you allow the AI to spend (${maxSum}) is less than your total budget (${dynamicBudget}). You must enable "Unspent Points" or raise your max limits.` : ''}
                  {minSum <= dynamicBudget && maxSum >= dynamicBudget && !profData ? ' The combination of exact locks creates a modulo trap where the budget cannot be cleanly spent.' : ''}
                </div>
              </div>
            );
          }

          let gColor, gBg, gIcon, gTitle, gDesc;
          if (step1 >= 15) {
            gColor = "#ff4b4b"; gBg = "rgba(255, 75, 75, 0.1)"; gIcon = "🔴";
            gTitle = "Low Precision (Scout Only)";
            gDesc = `The search grid is too massive. The AI must take huge leaps of ${step1} stat points. This will output garbage data if you trust it blindly! Only use this to spot stats to lock for your next run.`;
          } else if (step1 >= 5) {
            gColor = "#ffa229"; gBg = "rgba(255, 162, 41, 0.1)"; gIcon = "🟡";
            gTitle = "Moderate Precision";
            gDesc = `The AI is searching in leaps of ${step1} stat points. It will find a strong plateau, but you should run this a few times and use the Synthesis tab to finalize the build.`;
          } else {
            gColor = "#4CAF50"; gBg = "rgba(76, 175, 80, 0.1)"; gIcon = "🟢";
            gTitle = "High Precision (Recommended)";
            gDesc = `The search area is extremely tight (leaps of ${step1} stat points). The AI has enough time to pinpoint a highly optimized plateau. Send at least 2-3 of these runs to Synthesis for improvement.`;
          }

          return (
            <div style={{ border: `1px solid ${gColor}`, borderLeft: `5px solid ${gColor}`, backgroundColor: gBg }} className="p-4 rounded mb-4">
              <div className="font-bold text-lg mb-1">{gIcon} Precision Gauge: {gTitle}</div>
              <div className="text-sm">{gDesc}</div>
            </div>
          );
        })()}
      </div>

      <details className="st-container group cursor-pointer marker:text-st-orange mb-6">
        <summary className="font-bold">⚙️ Advanced: AI Execution Plan</summary>
        <div className="mt-4 text-sm cursor-default space-y-4">
          <p>
            <strong>🧠 How does the Auto-Scaler work?</strong><br/>
            Testing every stat combination point-by-point would take days. Instead, we "zoom in":<br/>
            • <strong>Phase 1 (Coarse):</strong> Casts a wide net across your stat budget in large leaps.<br/>
            • <strong>Phase 2 (Fine):</strong> Draws a tight box around the Phase 1 winner and tests smaller leaps.<br/>
            • <strong>Phase 3 (Exact):</strong> Pinpoints the mathematical peak by testing every single point in that final box.
          </p>
          <p className="italic text-st-text-light">
            (Execution Plan: Phase 1 leaps by {step1} ➔ Phase 2 leaps by {profData?.step_2 || '?'} ➔ Phase 3 leaps by {profData?.step_3 || '?'})
          </p>
        </div>
      </details>

      <hr className="border-st-border" />

      <div className="bg-yellow-900/20 border-l-4 border-yellow-500 p-3 rounded text-sm text-yellow-800 dark:text-yellow-200 bg-yellow-50 dark:bg-yellow-900/20 dark:text-yellow-200 mb-4">
        ⚠️ <strong>CRITICAL:</strong> Unlike the old server version, you <strong>CAN</strong> safely change tabs while the AI is running! However, do not refresh or close this browser window or the simulation will be aborted.
      </div>

      {!isOptimizing ? (
        <button 
          onClick={handleRunOptimizer}
          className="w-full py-3 bg-st-orange text-[#2b2b2b] font-bold rounded-lg shadow hover:bg-[#ffb045] transition-colors mt-4"
        >
          🚀 Run Optimizer
        </button>
      ) : (
        <div className="w-full mt-4 p-4 border border-st-border rounded bg-st-bg">
          <div className="flex justify-between text-sm font-bold mb-2 text-st-orange">
            <span>{optProgressMsg}</span>
            <span>{Math.floor(optProgressPct)}%</span>
          </div>
          <div className="w-full bg-[#1e1e1e] rounded-full h-4 overflow-hidden border border-st-border">
            <div 
              className="bg-st-orange h-4 transition-all duration-300"
              style={{ width: `${optProgressPct}%` }}
            ></div>
          </div>
        </div>
      )}

      {store.opt_results && !store.synthesis_result && !isOptimizing && <ResultsDashboard context="optimizer" />}

    </div>
  );
}