import { useState } from 'react';
import useStore from '../store';
import { EngineWorkerPool, getOptimalStepProfile, runOptimizationPhase, topUpBuild } from '../utils/optimizer';
import PlotWrapper from 'react-plotly.js';
import { INTERNAL_UPGRADE_CAPS, UPGRADE_NAMES } from '../game_data';

// Vite CommonJS interop fix: Unwrap the default export if it was packaged as an object
const Plot = PlotWrapper.default || PlotWrapper;

const OPT_GOALS =[
  "Max Floor Push", 
  "Max EXP Yield", 
  "Fragment Farming", 
  "Block Card Farming"
];

const FRAG_NAMES = {
  0: "Dirt", 1: "Common", 2: "Rare", 3: "Epic", 4: "Legendary", 5: "Mythic", 6: "Divine"
};

export default function Simulations() {
  const store = useStore();
  const [activeSubTab, setActiveSubTab] = useState('optimizer');
  
  // Optimizer Settings State
  const [optGoal, setOptGoal] = useState("Max Floor Push");
  const [targetFrag, setTargetFrag] = useState(0);
  const[targetBlock, setTargetBlock] = useState("myth3");
  const [timeLimit, setTimeLimit] = useState(60); // 1 Minute default
  
  // Stat Locking State
  const[lockedStats, setLockedStats] = useState({ });

  // Execution Engine State
  const[isOptimizing, setIsOptimizing] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
  const [progressPct, setProgressPct] = useState(0);
  const[simsPerSec, setSimsPerSec] = useState(150); // Fallback assumption until auto-calibrated

  // Dynamic Limits based on Ascensions and Caps
  const totalAllowed = parseInt(store.arch_level) + parseInt(store.upgrade_levels[12] || 0);
  const capInc = parseInt(store.upgrade_levels[45] || 0) * 5; // H45 scales by 5
  const STAT_CAPS = {
    Str: 50 + capInc, Agi: 50 + capInc, Per: 25 + capInc, Int: 25 + capInc, Luck: 25 + capInc,
    Div: store.asc1_unlocked ? (10 + capInc) : 0, 
    Corr: store.asc2_unlocked ? (10 + capInc) : 0
  };

  const activeStats =['Str', 'Agi', 'Per', 'Int', 'Luck'];
  if (store.asc1_unlocked) activeStats.push('Div');
  if (store.asc2_unlocked) activeStats.push('Corr');

  // --- REACTIVE AI CALIBRATION ---
  const dynamicBudget = parseInt(store.arch_level) + parseInt(store.upgrade_levels[12] || 0);
  const bounds = { };
  let lockedSum = 0;
  activeStats.forEach(s => {
    if (lockedStats[s] !== undefined) {
      bounds[s] = [ lockedStats[s], lockedStats[s] ];
      lockedSum += lockedStats[s];
    } else {
      bounds[s] =[ 0, STAT_CAPS[s] ];
    }
  });
  const profData = getOptimalStepProfile(activeStats, dynamicBudget, bounds, simsPerSec, timeLimit);
  const step1 = profData ? profData.step_1 : 100;
  const isOverBudget = lockedSum > dynamicBudget;

  // Results Dashboard & ROI State
  const [resTab, setResTab] = useState('build');
  const [roiStatResults, setRoiStatResults] = useState(null);
  const [roiUpgResults, setRoiUpgResults] = useState(null);
  const[isRoiLoading, setIsRoiLoading] = useState(false);
  const[roiProgressMsg, setRoiProgressMsg] = useState("");

  const handleAnalyzeStats = async () => {
    setIsRoiLoading(true);
    setRoiProgressMsg("Testing marginal stat values (15 sims each)...");
    
    try {
      const pool = new EngineWorkerPool();
      await pool.init();
      const statResults = { };
      const promises = [ ];
      const targetMetric = store.opt_results.run_target_metric;
      const baseVal = store.opt_results.final_summary_out[targetMetric];
      const bestFinal = store.opt_results.best_final;
      
      const baseStateDict = {
        asc1_unlocked: store.asc1_unlocked,
        asc2_unlocked: store.asc2_unlocked,
        arch_level: store.arch_level,
        current_max_floor: store.current_max_floor,
        hades_idol_level: store.hades_idol_level,
        arch_ability_infernal_bonus: parseFloat(store.arch_ability_infernal_bonus) / 100.0,
        total_infernal_cards: store.total_infernal_cards,
        base_stats: store.base_stats,
        upgrade_levels: store.upgrade_levels,
        external_levels: store.external_levels,
        cards: store.cards
      };

      activeStats.forEach(stat => {
        const maxCap = STAT_CAPS[stat] || 99;
        if (bestFinal[stat] < maxCap) {
          statResults[stat] = { sum: 0, count: 0 };
          for (let i = 0; i < 15; i++) {
            const testStats = { ...bestFinal,[stat]: bestFinal[stat] + 1 };
            const p = pool.runTask(baseStateDict, testStats).then(res => {
              statResults[stat].sum += (res[targetMetric] || 0);
              statResults[stat].count++;
            });
            promises.push(p);
          }
        }
      });

      if (promises.length > 0) {
        await Promise.all(promises);
        const finalRes = Object.keys(statResults).map(k => {
          const avg = statResults[k].sum / statResults[k].count;
          const gain = ((avg - baseVal) / 60.0) * 1000.0;
          return { stat: k, gain: gain };
        }).sort((a, b) => b.gain - a.gain);
        setRoiStatResults(finalRes);
      } else {
        alert("All stats are already maxed out! No further points can be tested.");
      }
      pool.terminate();
    } catch (err) {
      console.error(err);
      alert("ROI Analyzer failed: " + err.message);
    }
    setIsRoiLoading(false);
  };

  const handleAnalyzeUpgrades = async () => {
    setIsRoiLoading(true);
    setRoiProgressMsg("Testing marginal upgrade values (This may take a minute)...");
    
    try {
      const pool = new EngineWorkerPool();
      await pool.init();
      const upgResults = { };
      const promises = [ ];
      const targetMetric = store.opt_results.run_target_metric;
      const baseVal = store.opt_results.final_summary_out[targetMetric];
      const bestFinal = store.opt_results.best_final;
      const asc2LockedRows =[ 19, 27, 34, 46, 52, 55 ];

      Object.keys(INTERNAL_UPGRADE_CAPS || { }).forEach(upgIdStr => {
        const upgId = parseInt(upgIdStr);
        const currentLvl = store.upgrade_levels[upgId] || 0;
        const maxLvl = INTERNAL_UPGRADE_CAPS[upgId] || 99;

        if (!store.asc2_unlocked && asc2LockedRows.includes(upgId)) return;
        if (currentLvl >= maxLvl) return;

        const upgName = (UPGRADE_NAMES && UPGRADE_NAMES[upgId]) ? UPGRADE_NAMES[upgId][0] : `Upg ${upgId}`;
        upgResults[upgId] = { sum: 0, count: 0, name: upgName };

        for (let i = 0; i < 15; i++) {
          const modStateDict = {
            asc1_unlocked: store.asc1_unlocked,
            asc2_unlocked: store.asc2_unlocked,
            arch_level: store.arch_level,
            current_max_floor: store.current_max_floor,
            hades_idol_level: store.hades_idol_level,
            arch_ability_infernal_bonus: parseFloat(store.arch_ability_infernal_bonus) / 100.0,
            total_infernal_cards: store.total_infernal_cards,
            base_stats: store.base_stats,
            upgrade_levels: { ...store.upgrade_levels, [upgId]: currentLvl + 1 },
            external_levels: store.external_levels,
            cards: store.cards
          };
          
          const p = pool.runTask(modStateDict, bestFinal).then(res => {
            upgResults[upgId].sum += (res[targetMetric] || 0);
            upgResults[upgId].count++;
          });
          promises.push(p);
        }
      });

      if (promises.length > 0) {
        await Promise.all(promises);
        const finalRes = Object.keys(upgResults).map(k => {
          const avg = upgResults[k].sum / upgResults[k].count;
          const gain = ((avg - baseVal) / 60.0) * 1000.0;
          return { id: k, name: upgResults[k].name, gain: gain };
        }).sort((a, b) => b.gain - a.gain);
        setRoiUpgResults(finalRes.slice(0, 10)); // Top 10 upgrades
      } else {
        alert("All internal upgrades are maxed out! No further upgrades can be tested.");
      }
      pool.terminate();
    } catch (err) {
      console.error(err);
      alert("ROI Analyzer failed: " + err.message);
    }
    setIsRoiLoading(false);
  };

  const handleRunOptimizer = async () => {
    setIsOptimizing(true);
    setProgressMsg("Calculating Execution Plan...");
    setProgressPct(0);

    try {
      const baseStateDict = {
        asc1_unlocked: store.asc1_unlocked,
        asc2_unlocked: store.asc2_unlocked,
        arch_level: store.arch_level,
        current_max_floor: store.current_max_floor,
        hades_idol_level: store.hades_idol_level,
        arch_ability_infernal_bonus: parseFloat(store.arch_ability_infernal_bonus) / 100.0,
        total_infernal_cards: store.total_infernal_cards,
        base_stats: store.base_stats,
        upgrade_levels: store.upgrade_levels,
        external_levels: store.external_levels,
        cards: store.cards
      };

      if (isOverBudget) {
        alert(`❌ Invalid Locks: You locked ${lockedSum} points, but budget is only ${dynamicBudget}.`);
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

      setProgressMsg(`Booting AI Cores...`);
      const pool = new EngineWorkerPool();
      await pool.init(
        () => { }, 
        (ready, total) => setProgressMsg(`Booting Engine Cores: ${ready}/${total}`)
      );

      const globalStartTime = Date.now();
      const targetMetricKey = (optGoal === "Fragment Farming") ? `frag_${targetFrag}_per_min` 
                            : (optGoal === "Block Card Farming") ? `block_${targetBlock}_per_min` 
                            : (optGoal === "Max EXP Yield") ? "xp_per_min" 
                            : "highest_floor";

      const fixedStats = { };
      Object.keys(store.base_stats).forEach(k => {
        if (!activeStats.includes(k)) fixedStats[k] = store.base_stats[k];
      });

      let totalSimsExecuted = 0;
      const onProgressCb = (phase, rnd, totRnd, comp, tot) => {
        totalSimsExecuted++;
        const elapsed = (Date.now() - globalStartTime) / 1000;
        setProgressMsg(`⚙️ ${phase} | Round ${rnd}/${totRnd} | ${comp}/${tot} sims | ⏱️ Elapsed: ${elapsed.toFixed(1)}s / ${timeLimit}s`);
        setProgressPct((comp / tot) * 100);
      };

      // --- PHASE 1 (Coarse) ---
      const remP1 = (dynamicBudget - lockedSum) % step1;
      const p1Budget = dynamicBudget - remP1;
      
      let { bestDist: bestP1, summary: sumP1 } = await runOptimizationPhase(
        "Phase 1 (Coarse)", targetMetricKey, activeStats, p1Budget, step1, 25,
        pool, fixedStats, bounds, baseStateDict, timeLimit, globalStartTime, onProgressCb
      );

      bestP1 = topUpBuild(bestP1, activeStats, dynamicBudget, STAT_CAPS, lockedStats);

      let bestFinal = bestP1;
      let finalSummary = sumP1;

      // --- PHASE 2 (Fine) ---
      let bestP2, sumP2;
      if (bestP1 && ((Date.now() - globalStartTime) / 1000) < timeLimit) {
        const boundsP2 = { };
        let lockedSumP2 = 0;
        activeStats.forEach(s => {
          if (lockedStats[s] !== undefined) {
            boundsP2[s] = bounds[s];
            lockedSumP2 += bounds[s][0];
          } else {
            boundsP2[s] =[
              Math.max(0, bestP1[s] - step1),
              Math.min(STAT_CAPS[s], bestP1[s] + step1)
            ];
          }
        });
        
        const remP2 = (dynamicBudget - lockedSumP2) % step2;
        const p2Budget = dynamicBudget - remP2;

        const res2 = await runOptimizationPhase(
          "Phase 2 (Fine)", targetMetricKey, activeStats, p2Budget, step2, 50,
          pool, fixedStats, boundsP2, baseStateDict, timeLimit, globalStartTime, onProgressCb
        );
        bestP2 = topUpBuild(res2.bestDist, activeStats, dynamicBudget, STAT_CAPS, lockedStats);
        sumP2 = res2.summary;
        if (bestP2) { bestFinal = bestP2; finalSummary = sumP2; }
      }

      // --- PHASE 3 (Exact) ---
      if (bestP2 && ((Date.now() - globalStartTime) / 1000) < timeLimit) {
        const boundsP3 = { };
        const p3Radius = profData.p3_radius || Math.min(2, step2);
        activeStats.forEach(s => {
          if (lockedStats[s] !== undefined) {
            boundsP3[s] = bounds[s];
          } else {
            boundsP3[s] =[
              Math.max(0, bestP2[s] - p3Radius),
              Math.min(STAT_CAPS[s], bestP2[s] + p3Radius)
            ];
          }
        });

        const res3 = await runOptimizationPhase(
          `Phase 3 (Radius ±${p3Radius})`, targetMetricKey, activeStats, dynamicBudget, profData.step_3 || 1, 100,
          pool, fixedStats, boundsP3, baseStateDict, timeLimit, globalStartTime, onProgressCb
        );
        const bestP3 = topUpBuild(res3.bestDist, activeStats, dynamicBudget, STAT_CAPS, lockedStats);
        if (bestP3) { bestFinal = bestP3; finalSummary = res3.summary; }
      }

      // --- FINISH & CALIBRATE ---
      const elapsed = (Date.now() - globalStartTime) / 1000;
      pool.terminate();
      
      // Auto-Calibrate the AI's internal perception of the User's CPU cores for exact ETAs on future runs!
      if (elapsed > 0 && totalSimsExecuted > 0) {
          setSimsPerSec(Math.max(1, Math.floor(totalSimsExecuted / elapsed)));
      }
      
      if (bestFinal && finalSummary) {
          console.log("🏆 OPTIMIZATION COMPLETE:", bestFinal, finalSummary);
          
          const payload = {
              best_final: bestFinal,
              final_summary_out: finalSummary,
              elapsed: elapsed,
              time_limit_secs: timeLimit,
              run_target_metric: targetMetricKey,
              worst_val: finalSummary.worst_val || 0,
              avg_val: finalSummary.avg_val || 0,
              runner_up_val: finalSummary.runner_up_val || 0,
              // Convert flat floor array into a Death Histogram map: { "120": 5, "121": 15 }
              chart_hist: finalSummary.floors.reduce((acc, f) => { acc[f] = (acc[f] || 0) + 1; return acc; }, { }),
          };

          store.setOptResults(payload);
          store.addRunHistory({
              Include: true,
              Target: targetMetricKey,
              "Metric Score": finalSummary[targetMetricKey],
              "Avg Floor": finalSummary.avg_floor,
              "Max Floor": finalSummary.abs_max_floor,
              ...bestFinal,
              _restore_state: payload
          });

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
  
  const handleLockToggle = (stat) => {
    const newLocks = { ...lockedStats };
    if (newLocks[stat] !== undefined) {
      delete newLocks[stat];
    } else {
      newLocks[stat] = store.base_stats[stat] || 0;
    }
    setLockedStats(newLocks);
  };

  const handleLockValueChange = (stat, val) => {
    let parsed = parseInt(val) || 0;
    if (parsed > STAT_CAPS[stat]) parsed = STAT_CAPS[stat];
    if (parsed < 0) parsed = 0;
    
    setLockedStats({ ...lockedStats, [stat]: parsed });
  };

  return (
    <div className="animate-fade-in pb-24">
      
      {/* SUB-TABS ROUTING */}
      <div className="flex overflow-x-auto border-b border-st-border mb-6 no-scrollbar">
        {[
          { id: 'optimizer', label: '🚀 Optimizer' },
          { id: 'synth', label: '🧬 Build Synthesis & History' },
          { id: 'sandbox', label: '🧪 Hit Calculator (Sandbox)' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`px-4 py-2 font-medium whitespace-nowrap transition-colors duration-200 border-b-2 ${
              activeSubTab === tab.id 
                ? 'border-st-orange text-st-text' 
                : 'border-transparent text-st-text-light hover:text-st-orange hover:border-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* =========================================
          TAB: OPTIMIZER
      ========================================= */}
      {activeSubTab === 'optimizer' && (
        <div className="space-y-6">
          <h2 className="text-2xl font-bold">🚀 Monte Carlo Stat Optimizer</h2>
          <p className="text-st-text-light">Leverage Successive Halving to find the absolute mathematically perfect stat distribution using your browser's local CPU cores.</p>
          
          <div className="st-container border-l-4 border-l-st-orange">
            <h4 className="font-bold mb-2">💡 Best Practice: The 2-Step Optimization</h4>
            <p className="text-sm">
              <strong>1. The Scout Run:</strong> Leave your stats unlocked. Run a fast 10-30s simulation and look at the winning build. Did the AI drop any stats to 0? Did it push any to their Max?<br/><br/>
              <strong>2. The Refined Run:</strong> Open the <strong>Stat Constraints</strong> below and lock those obvious stats to 0 or Max. By locking just 1 or 2 stats, the AI can scan the remaining stats with vastly higher precision in a fraction of the time!
            </p>
          </div>

          <details className="st-container group cursor-pointer marker:text-st-orange mb-4">
            <summary className="font-bold">ℹ️ How accurate are these projections?</summary>
            <div className="mt-4 text-sm space-y-3 cursor-default">
              <p><strong>The Good News:</strong> The environment generation in this engine is now <strong>100% identical</strong> to the live game's source code! The stat distributions this tool provides are mathematically perfect for your current upgrades.</p>
              <p><strong>The Reality Check #1:</strong> While the combat math is exact, the absolute output numbers (Max Floor, Kills/hr) are built on <strong>Statistical Averages</strong>. The AI runs hundreds of simulations and optimizes for <em>consistent, reliable farming</em>. Treat these numbers as your highly accurate, reliable baseline!</p>
              <p><strong>The Reality Check #2:</strong> The engine calculates <strong>100% Theoretical Efficiency</strong>. In the simulator, 0.000 seconds pass between killing an ore and hitting the next one. In the actual live game, minor animation delays and frame drops consume fractions of a second. Expect your actual real-world Yields to be roughly <strong>~5% to 10% lower</strong> than the mathematical perfection projected here.</p>
              {store.asc2_unlocked && (
                <p>🌌 <strong>Ascension 2 Note:</strong> Because Asc2 unlocks the <em>Corruption</em> stat, the AI must search an entire extra dimension of math. Optimizations will naturally take longer to compute than Asc1 runs!</p>
              )}
            </div>
          </details>

          <hr className="border-st-border" />

          {/* Target Selection */}
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
                  <label className="block text-sm font-bold mb-1">Fragment Tier</label>
                  <select 
                    value={targetFrag} 
                    onChange={(e) => setTargetFrag(parseInt(e.target.value))}
                    className="w-full bg-st-bg border border-st-border rounded p-2 text-st-text focus:border-st-orange focus:outline-none"
                  >
                    {Object.entries(FRAG_NAMES).map(([val, name]) => (
                      <option key={val} value={val}>{name} (Tier {val})</option>
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
                    placeholder="e.g., com1, myth3"
                    className="w-full bg-st-bg border border-st-border rounded p-2 text-st-text focus:border-st-orange focus:outline-none"
                  />
                </>
              )}
            </div>
          </div>

          {/* Strategy Tip */}
          <div className="bg-blue-900/20 border-l-4 border-blue-500 p-3 rounded text-sm text-blue-800 bg-blue-50 mt-4">
            {optGoal === "Max Floor Push" ? (
              <p>💡 <strong>Strategy Tip:</strong> Pushing deep floors requires balancing Damage, Armor Pen, Max Stamina and Crits. To force the AI to scan at an extreme precision, try opening the <strong>Stat Constraints</strong> below and locking <strong>Intelligence</strong> to 0 and <strong>Luck</strong> to your max stat cap!</p>
            ) : (
              <p>💡 <strong>Strategy Tip:</strong> If your target spawns on early floors (e.g., Dirt), you don't need Max Stamina or Armor Pen to reach it! Lock <strong>Agility</strong> and <strong>Perception</strong> to 0 to massively increase the precision of the AI's search.<br/><br/>⚠️ <strong>Wait, what if my target is late-game?</strong> If you are farming Tier 4 blocks (which spawn on Floor 81+), you STILL have to survive the gauntlet of tough ores to get there. Do not lock your survival stats to 0, or the AI will die before reaching your target!</p>
            )}
          </div>

          <hr className="border-st-border" />

          {/* Stat Constraints */}
          <details className="st-container group cursor-pointer marker:text-st-orange">
            <summary className="font-bold text-lg">🔒 Stat Constraints / Locking (Optional)</summary>
            <div className="mt-4 text-sm text-st-text-light mb-4">
              Locking a stat removes an entire dimension from the AI's search grid. For every stat you lock, the AI can scan the remaining unlocked stats significantly faster and deeper.
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 cursor-default">
              {activeStats.map(stat => (
                <div key={stat} className="st-container flex flex-col items-center">
                  <div className="font-bold mb-2 text-sm">{stat}</div>
                  
                  {/* Toggles between stats folder and stats_small folder gracefully */}
                  <img 
                    src={`/assets/stats_small/${stat.toLowerCase()}.png`} 
                    onError={(e) => { e.target.onerror = null; e.target.src = `/assets/stats/${stat.toLowerCase()}.png` }}
                    alt={stat} 
                    className="h-10 w-10 pixelated mb-3"
                  />
                  
                  <label className="flex items-center space-x-2 text-sm mb-2 cursor-pointer">
                    <input 
                      type="checkbox"
                      checked={lockedStats[stat] !== undefined}
                      onChange={() => handleLockToggle(stat)}
                      className="accent-st-orange w-4 h-4"
                    />
                    <span>Lock Value</span>
                  </label>
                  
                  <input
                    type="number"
                    value={lockedStats[stat] !== undefined ? lockedStats[stat] : store.base_stats[stat] || 0}
                    onChange={(e) => handleLockValueChange(stat, e.target.value)}
                    disabled={lockedStats[stat] === undefined}
                    min="0"
                    max={STAT_CAPS[stat]}
                    className="st-input disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              ))}
            </div>
          </details>

          <hr className="border-st-border" />

          {/* Time Target Slider */}
          <div>
            <label className="block font-bold mb-2">⏱️ Target Compute Time</label>
            <div className="flex items-center space-x-4 mb-6">
              <input 
                type="range" 
                min="10" 
                max="300" 
                step="10" 
                value={timeLimit} 
                onChange={(e) => setTimeLimit(parseInt(e.target.value))}
                className="w-full accent-st-orange"
              />
              <span className="font-mono bg-st-bg border border-st-border px-3 py-1 rounded min-w-[80px] text-center">
                {timeLimit}s
              </span>
            </div>

            {/* Precision Gauge */}
            {(() => {
              let gColor, gBg, gIcon, gTitle, gDesc;
              if (step1 >= 15) {
                gColor = "#ff4b4b"; gBg = "rgba(255, 75, 75, 0.1)"; gIcon = "🔴";
                gTitle = "Low Precision (Scout Only)";
                gDesc = `The search grid is too massive. The AI must take huge leaps of ${step1} stat points. This run is only useful for spotting which stats the AI completely ignores. Do not trust the final numbers! Increase time or lock stats.`;
              } else if (step1 >= 5) {
                gColor = "#ffa229"; gBg = "rgba(255, 162, 41, 0.1)"; gIcon = "🟡";
                gTitle = "Moderate Precision";
                gDesc = `The AI is searching in leaps of ${step1} stat points. It will find a strong general build, but might miss the absolute mathematical peak. Safe to use as a Scout Run.`;
              } else {
                gColor = "#4CAF50"; gBg = "rgba(76, 175, 80, 0.1)"; gIcon = "🟢";
                gTitle = "High Precision (Recommended)";
                gDesc = `The search area is extremely tight (leaps of ${step1} stat points). The AI has enough time to pinpoint the mathematically perfect build. Safe to trust!`;
              }

              return (
                <div style={{ border: `1px solid ${gColor}`, borderLeft: `5px solid ${gColor}`, backgroundColor: gBg }} className="p-4 rounded mb-4">
                  <div className="font-bold text-lg mb-1">{gIcon} Precision Gauge: {gTitle}</div>
                  <div className="text-sm">{gDesc}</div>
                </div>
              );
            })()}
          </div>

          {/* Engine Tuning */}
          <details className="st-container group cursor-pointer marker:text-st-orange mb-6">
            <summary className="font-bold">⚙️ Advanced: Engine Tuning & Hardware Benchmark</summary>
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
              <hr className="border-st-border" />
              <div className="flex items-center justify-between">
                <span>⚡ <strong>Hardware Speed:</strong> {simsPerSec} sims / second <em>(Auto-calibrated)</em></span>
                <button 
                  onClick={() => setSimsPerSec(150)}
                  className="px-4 py-1 bg-st-secondary border border-st-border rounded hover:border-st-orange text-xs font-bold transition-colors"
                >
                  🔄 Reset Calibration
                </button>
              </div>
            </div>
          </details>

          <hr className="border-st-border" />

          {/* Run Warning (Updated for Web Workers!) */}
          <div className="bg-yellow-900/20 border-l-4 border-yellow-500 p-3 rounded text-sm text-yellow-800 bg-yellow-50 mb-4">
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
                <span>{progressMsg}</span>
                <span>{Math.floor(progressPct)}%</span>
              </div>
              <div className="w-full bg-[#1e1e1e] rounded-full h-4 overflow-hidden border border-st-border">
                <div 
                  className="bg-st-orange h-4 transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                ></div>
              </div>
            </div>
          )}

          {/* =========================================
              RESULTS DASHBOARD
          ========================================= */}
          {store.opt_results && !isOptimizing && (
            <div className="mt-8 animate-fade-in space-y-6" id="dashboard-anchor-optimizer">
              <div className="bg-[#1e1e1e] border-l-4 border-l-green-500 p-4 rounded shadow">
                <h3 className="text-xl font-bold text-green-400">✅ Simulation Complete in {store.opt_results.elapsed.toFixed(1)} seconds!</h3>
              </div>

              {/* Sub-Tabs for Results */}
              <div className="flex overflow-x-auto border-b border-st-border mb-6 no-scrollbar">
                {[
                  { id: 'build', label: '🏆 The Build' },
                  { id: 'data', label: '📊 Simulation Data' },
                  { id: 'roi', label: '🔮 Upgrade Guide (ROI)' }
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setResTab(t.id)}
                    className={`px-4 py-2 font-medium whitespace-nowrap transition-colors duration-200 border-b-2 ${
                      resTab === t.id 
                        ? 'border-st-orange text-st-text' 
                        : 'border-transparent text-st-text-light hover:text-st-orange hover:border-gray-300'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* 🏆 THE BUILD */}
              {resTab === 'build' && (
              <div className="st-container animate-fade-in">
                <h3 className="text-2xl font-bold mb-4">🏆 Optimal Stat Build</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                  {activeStats.map(stat => {
                    const allocated = store.opt_results.best_final[stat] || 0;
                    const current = store.base_stats[stat] || 0;
                    const delta = allocated - current;
                    
                    return (
                      <div key={stat} className="st-container flex flex-col items-center text-center">
                        <div className="font-bold">{stat}</div>
                        <div className="text-3xl font-mono mt-2 text-st-orange">{allocated}</div>
                        <div className={`text-sm font-bold ${delta > 0 ? 'text-green-400' : delta < 0 ? 'text-red-400' : 'text-st-text-light'}`}>
                          {delta > 0 ? `+${delta}` : delta < 0 ? delta : '-'}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-col md:flex-row gap-4 mt-6">
                  <button 
                    onClick={() => {
                      Object.entries(store.opt_results.best_final).forEach(([k, v]) => {
                        store.setBaseStat(k, v);
                      });
                      alert("✅ Optimal stats applied globally!");
                    }}
                    className="flex-1 py-2 bg-[#2b2b2b] border border-st-orange text-st-orange font-bold rounded hover:bg-st-orange hover:text-[#2b2b2b] transition-colors"
                  >
                    ✨ Apply Build Globally
                  </button>
                  <button className="flex-1 py-2 bg-[#2b2b2b] border border-st-border text-st-text-light font-bold rounded hover:text-st-text transition-colors cursor-not-allowed">
                    🧪 Send to Sandbox (Coming Soon)
                  </button>
                </div>
              </div>
              )}

              {/* 📊 ADVANCED ANALYTICS */}
              {resTab === 'data' && (
              <div className="st-container animate-fade-in">
                <h3 className="text-2xl font-bold mb-4">📊 Advanced Analytics</h3>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  
                  {/* Death Histogram (Progression Wall) */}
                  <div className="w-full h-[300px] border border-st-border rounded bg-st-bg p-2">
                    <Plot
                      data={[ {
                        x: Object.keys(store.opt_results.chart_hist),
                        y: Object.values(store.opt_results.chart_hist),
                        type: 'bar',
                        marker: { color: '#ff4b4b' },
                        text: Object.values(store.opt_results.chart_hist),
                        textposition: 'outside'
                      } ]}
                      layout={{
                        title: 'Progression Wall (Death Distribution)',
                        paper_bgcolor: 'rgba(0,0,0,0)',
                        plot_bgcolor: 'rgba(0,0,0,0)',
                        margin: { t: 40, b: 40, l: 40, r: 20 },
                        xaxis: { type: 'category', title: 'Floor' },
                        yaxis: { title: 'Deaths' }
                      }}
                      useResizeHandler={true}
                      style={{ width: '100%', height: '100%' }}
                      config={{ displayModeBar: false }}
                    />
                  </div>

                  {/* Stamina Trace (Sample Run) */}
                  {store.opt_results.final_summary_out.stamina_trace && (
                    <div className="w-full h-[300px] border border-st-border rounded bg-st-bg p-2">
                      <Plot
                        data={[ {
                          x: store.opt_results.final_summary_out.stamina_trace.floor,
                          y: store.opt_results.final_summary_out.stamina_trace.stamina,
                          type: 'scatter',
                          mode: 'lines',
                          fill: 'tozeroy',
                          line: { color: '#ffa229' },
                          fillcolor: 'rgba(255, 162, 41, 0.2)'
                        } ]}
                        layout={{
                          title: 'Stamina Depletion Trace (Sample Run)',
                          paper_bgcolor: 'rgba(0,0,0,0)',
                          plot_bgcolor: 'rgba(0,0,0,0)',
                          margin: { t: 40, b: 40, l: 40, r: 20 },
                          xaxis: { title: 'Floor Level' },
                          yaxis: { title: 'Stamina Remaining' }
                        }}
                        useResizeHandler={true}
                        style={{ width: '100%', height: '100%' }}
                        config={{ displayModeBar: false }}
                      />
                    </div>
                  )}

                </div>
              </div>
              )}

              {/* 🔮 UPGRADE GUIDE (ROI) */}
              {resTab === 'roi' && (
              <div className="st-container animate-fade-in">
                <h3 className="text-2xl font-bold mb-4">🔮 Upgrade Guide (Marginal ROI)</h3>
                
                {store.opt_results.run_target_metric === 'highest_floor' ? (
                  <div className="bg-yellow-900/40 border-l-4 border-yellow-500 p-4 rounded">
                    <p className="font-bold text-yellow-500">⚠️ ROI Analyzer is Disabled for Max Floor Push</p>
                    <p className="text-sm mt-2">Because floor progression relies on large, discrete math 'Breakpoints', adding a single +1 to a stat rarely shows an immediate gain. To calculate exactly what stats you need to beat your current wall, send your build to Tab 6 (Hit Calculator Sandbox) and manually inspect the HP and Armor Breakpoints!</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-st-text-light mb-4">Wondering what to buy next? The ROI Analyzer runs isolated micro-simulations, adding <strong>+1 Level</strong> to every stat and un-maxed upgrade, then ranks them by their immediate raw boost to your yields.</p>
                    <div className="bg-yellow-900/40 border-l-4 border-yellow-500 p-3 rounded mb-6 text-sm">
                      ⚠️ <strong>Note:</strong> This engine ranks <strong>raw output gain</strong>, not cost efficiency. You must weigh the AI's top recommendations against your actual in-game fragment costs!
                    </div>

                    {isRoiLoading && (
                      <div className="flex flex-col items-center justify-center p-6 border border-st-border rounded bg-st-bg mb-6">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-st-orange mb-4"></div>
                        <p className="text-st-orange font-bold animate-pulse">{roiProgressMsg}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      
                      {/* STATS ROI */}
                      <div className="border border-st-border rounded p-4 bg-black/20">
                        <h4 className="font-bold mb-2">1. Next Stat Point</h4>
                        <p className="text-sm text-st-text-light mb-4">Tests adding +1 to every stat to see which yields the highest increase.</p>
                        <button 
                          onClick={handleAnalyzeStats}
                          disabled={isRoiLoading}
                          className="w-full py-2 bg-[#2b2b2b] border border-st-border text-st-text font-bold rounded hover:border-st-orange hover:text-st-orange transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-4"
                        >
                          🔍 Analyze Next Stat Point
                        </button>
                        
                        {roiStatResults && (
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="border-b border-st-border text-st-text-light text-sm">
                                  <th className="py-2 pr-4">Stat (+1)</th>
                                  <th className="py-2">Marginal Gain (per 1k Arch Secs)</th>
                                </tr>
                              </thead>
                              <tbody>
                                {roiStatResults.map((r, i) => (
                                  <tr key={r.stat} className="border-b border-st-border/50 hover:bg-white/5 transition-colors">
                                    <td className="py-2 pr-4 font-bold">{r.stat}</td>
                                    <td className="py-2 font-mono text-st-orange">+{r.gain.toFixed(2)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      {/* UPGRADES ROI */}
                      <div className="border border-st-border rounded p-4 bg-black/20">
                        <h4 className="font-bold mb-2">2. Upgrade ROI (Internal)</h4>
                        <p className="text-sm text-st-text-light mb-4">Tests adding +1 level to every un-maxed internal upgrade.</p>
                        <button 
                          onClick={handleAnalyzeUpgrades}
                          disabled={isRoiLoading}
                          className="w-full py-2 bg-[#2b2b2b] border border-st-border text-st-text font-bold rounded hover:border-st-orange hover:text-st-orange transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-4"
                        >
                          🔍 Analyze Upgrades
                        </button>
                        
                        {roiUpgResults && (
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="border-b border-st-border text-st-text-light text-sm">
                                  <th className="py-2 pr-4">Upgrade (+1 Lvl)</th>
                                  <th className="py-2">Marginal Gain (per 1k Arch Secs)</th>
                                </tr>
                              </thead>
                              <tbody>
                                {roiUpgResults.map((r, i) => (
                                  <tr key={r.id} className="border-b border-st-border/50 hover:bg-white/5 transition-colors">
                                    <td className="py-2 pr-4 text-sm font-bold">{r.name}</td>
                                    <td className="py-2 font-mono text-st-orange">+{r.gain.toFixed(2)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                    </div>
                  </div>
                )}
              </div>
              )}

            </div>
          )}

        </div>
      )}

      {/* =========================================
          TAB: SYNTHESIS
      ========================================= */}
      {activeSubTab === 'synth' && (
        <div className="space-y-6">
          <h2 className="text-2xl font-bold">🧬 Build Synthesis & History</h2>
          <div className="st-container text-center text-st-text-light py-10">
            🚧 Run History Table & Tie-Breaker UI coming soon!
          </div>
        </div>
      )}

      {/* =========================================
          TAB: SANDBOX
      ========================================= */}
      {activeSubTab === 'sandbox' && (
        <div className="space-y-6">
          <h2 className="text-2xl font-bold">🧪 Block Hit Sandbox</h2>
          <div className="st-container text-center text-st-text-light py-10">
            🚧 Hit Calculator Table coming soon!
          </div>
        </div>
      )}

    </div>
  );
}
