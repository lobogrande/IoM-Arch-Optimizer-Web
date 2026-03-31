import { useState } from 'react';
import useStore from '../store';
import { EngineWorkerPool, getOptimalStepProfile, runOptimizationPhase, topUpBuild } from '../utils/optimizer';

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
  const[activeSubTab, setActiveSubTab] = useState('optimizer');
  
  // Optimizer Settings State
  const[optGoal, setOptGoal] = useState("Max Floor Push");
  const [targetFrag, setTargetFrag] = useState(0);
  const [targetBlock, setTargetBlock] = useState("myth3");
  const[timeLimit, setTimeLimit] = useState(60); // 1 Minute default
  
  // Stat Locking State
  const [lockedStats, setLockedStats] = useState({ });

  // Execution Engine State
  const [isOptimizing, setIsOptimizing] = useState(false);
  const[progressMsg, setProgressMsg] = useState("");
  const [progressPct, setProgressPct] = useState(0);
  const [simsPerSec, setSimsPerSec] = useState(150); // Fallback assumption until auto-calibrated

  const handleRunOptimizer = async () => {
    setIsOptimizing(true);
    setProgressMsg("Calculating Execution Plan...");
    setProgressPct(0);

    try {
      const dynamicBudget = parseInt(store.arch_level) + parseInt(store.upgrade_levels[12] || 0);
      
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

      const bounds = { };
      let lockedSum = 0;
      activeStats.forEach(s => {
        if (lockedStats[s] !== undefined) {
          bounds[s] =[lockedStats[s], lockedStats[s]];
          lockedSum += lockedStats[s];
        } else {
          bounds[s] =[0, STAT_CAPS[s]];
        }
      });

      if (lockedSum > dynamicBudget) {
        alert(`❌ Invalid Locks: You locked ${lockedSum} points, but budget is only ${dynamicBudget}.`);
        setIsOptimizing(false);
        return;
      }

      const profData = getOptimalStepProfile(activeStats, dynamicBudget, bounds, simsPerSec, timeLimit);
      if (!profData) {
        alert("❌ Curse of Dimensionality! The AI could not find a mathematical step profile to fit the time limit. Lock more stats or increase the time limit.");
        setIsOptimizing(false);
        return;
      }

      const step1 = profData.step_1;
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
          alert(`✅ Simulation Complete in ${elapsed.toFixed(1)}s!\nBest Build: ${JSON.stringify(bestFinal)}`);
          // Note: In the final step we will save this payload to Zustand and render the graphs!
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
    <div className="animate-fade-in">
      
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
                    className="w-full bg-[#1e1e1e] border border-st-border rounded p-1 text-center text-st-text focus:border-st-orange focus:outline-none disabled:opacity-50"
                  />
                </div>
              ))}
            </div>
          </details>

          <hr className="border-st-border" />

          {/* Time Target Slider */}
          <div>
            <label className="block font-bold mb-2">⏱️ Target Compute Time</label>
            <div className="flex items-center space-x-4">
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
