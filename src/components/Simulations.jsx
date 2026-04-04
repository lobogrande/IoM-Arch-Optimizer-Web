import { useState, useMemo, useEffect } from 'react';
import useStore from '../store';
import { EngineWorkerPool, getOptimalStepProfile, runOptimizationPhase, topUpBuild } from '../utils/optimizer';
import PlotWrapper from 'react-plotly.js';
import { INTERNAL_UPGRADE_CAPS, UPGRADE_NAMES, ASC1_LOCKED_UPGS, ASC2_LOCKED_UPGS, UPGRADE_LEVEL_REQS, EXTERNAL_UI_GROUPS } from '../game_data';
import { UI_BLOCK_CARD_WIDTH, UI_BLOCK_CARD_X_OFFSET, UI_BLOCK_CARD_Y_OFFSET, UI_CARD_CBLOCK_SCALE } from '../ui_config';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css'; // Modern, clean light theme

// Register all community features for AG Grid (Required for v32+)
ModuleRegistry.registerModules([ AllCommunityModule ]);

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

const ORE_MIN_FLOORS = {
  'dirt1': 1, 'com1': 1, 'rare1': 3, 'epic1': 6, 'leg1': 12, 'myth1': 20, 'div1': 50,
  'dirt2': 12, 'com2': 18, 'rare2': 26, 'epic2': 30, 'leg2': 32, 'myth2': 36, 'div2': 75,
  'dirt3': 24, 'com3': 30, 'rare3': 36, 'epic3': 42, 'leg3': 45, 'myth3': 50, 'div3': 100,
  'dirt4': 81, 'com4': 96, 'rare4': 111, 'epic4': 126, 'leg4': 136, 'myth4': 141, 'div4': 150
};

export default function Simulations() {
  const store = useStore();
  const chartFontColor = store.theme === 'dark' ? '#A3A8B8' : '#7D808D';
  const chartGridColor = store.theme === 'dark' ? 'rgba(250,250,250,0.1)' : 'rgba(49,51,63,0.1)';
  const activeSubTab = store.simActiveSubTab;
  const setActiveSubTab = store.setSimActiveSubTab;
  
  // Optimizer Settings State (Persisted in Zustand)
  const optGoal = store.optGoal || "Max Floor Push";
  const targetFrag = store.targetFrag ? Math.max(1, store.targetFrag) : 1; // Fallback to 1 (Common) if 0 (Dirt) is cached
  const targetBlock = store.targetBlock ?? "myth3";
  const timeLimit = store.timeLimit ?? 60;
  const lockedStats = store.lockedStats || {};
  const simsPerSec = store.simsPerSec || 15; // Pessimistic WebAssembly baseline until auto-calibrated

  const setOptGoal = (v) => store.setSimsState('optGoal', v);
  const setTargetFrag = (v) => store.setSimsState('targetFrag', v);
  const setTargetBlock = (v) => store.setSimsState('targetBlock', v);
  const setTimeLimit = (v) => store.setSimsState('timeLimit', v);
  const setLockedStats = (v) => store.setSimsState('lockedStats', v);
  const setSimsPerSec = (v) => store.setSimsState('simsPerSec', v);

  const [displayTime, setDisplayTime] = useState(store.timeLimit || 60); // Visual slider state

  // Debounce the visual slider so it reliably updates the engine math without freezing the browser
  useEffect(() => {
    const timer = setTimeout(() => {
      setTimeLimit(displayTime);
    }, 300);
    return () => clearTimeout(timer);
  }, [displayTime]);

  // Execution Engine State (Optimizer)
  const [isOptimizing, setIsOptimizing] = useState(false);
  const[optProgressMsg, setOptProgressMsg] = useState("");
  const [optProgressPct, setOptProgressPct] = useState(0);

  // Execution Engine State (Synthesizer)
  const[isSynthesizing, setIsSynthesizing] = useState(false);
  const [synthProgressMsg, setSynthProgressMsg] = useState("");
  const [synthProgressPct, setSynthProgressPct] = useState(0);

  // Results Dashboard & ROI State
  const resTab = store.simResTab;
  const setResTab = store.setSimResTab;
  const dataTab = store.simDataTab;
  const setDataTab = store.setSimDataTab;
  const[curXp, setCurXp] = useState(0);
  const [tarXp, setTarXp] = useState(0);
  const [cardSelBlock, setCardSelBlock] = useState('');
  
  const[isRoiLoading, setIsRoiLoading] = useState(false);
  const[roiProgressMsg, setRoiProgressMsg] = useState("");

  const isAnyRunning = isOptimizing || isSynthesizing || isRoiLoading;

  // Synthesis Tab State
  const [viewTargets, setViewTargets] = useState(null);

  // Sandbox UI State
  const sandboxMinHits = store.sandboxMinHits;
  const setSandboxMinHits = store.setSandboxMinHits;
  const sandboxShowUnreachable = store.sandboxShowUnreachable;
  const setSandboxShowUnreachable = store.setSandboxShowUnreachable;
  const sandboxShowCrits = store.sandboxShowCrits;
  const setSandboxShowCrits = store.setSandboxShowCrits;
  const sandboxBlockFilters = store.sandboxBlockFilters;
  const setSandboxBlockFilters = store.setSandboxBlockFilters;
  const sandbox_baseline = store.sandbox_baseline;
  const sandbox_baseline_stats = store.sandbox_baseline_stats;
  const setSandboxBaseline = store.setSandboxBaseline;

  // Dynamically generate the Profile Tag for history logging
  const profileTag = useMemo(() => {
    const activeProfile = store.profiles?.find(p => p.id === store.activeProfileId);
    if (!activeProfile) return "Guest";
    
    const currentSnapshot = {
      asc1_unlocked: store.asc1_unlocked, asc2_unlocked: store.asc2_unlocked, arch_level: store.arch_level, current_max_floor: store.current_max_floor, geoduck_unlocked: store.geoduck_unlocked,
      arch_ability_infernal_bonus: store.arch_ability_infernal_bonus, total_infernal_cards: store.total_infernal_cards,
      base_stats: { ...store.base_stats },
      upgrade_levels: { ...store.upgrade_levels },
      external_levels: { ...store.external_levels },
      cards: { ...store.cards }
    };
    
    return JSON.stringify(currentSnapshot) !== JSON.stringify(activeProfile.data) ? `${activeProfile.name} *` : activeProfile.name;
  },[ store.activeProfileId, store.profiles, store.asc1_unlocked, store.asc2_unlocked, store.arch_level, store.current_max_floor, store.geoduck_unlocked, store.arch_ability_infernal_bonus, store.total_infernal_cards, store.base_stats, store.upgrade_levels, store.external_levels, store.cards ]);

  // --- HOISTED SANDBOX MEMOS (Must be at the top level to obey React Hook Rules) ---
  const sbData = store.sandbox_calculated_stats;
  const tFloor = store.sandbox_floor ?? store.current_max_floor;

  const baselineMap = useMemo(() => {
    if (!sandbox_baseline || !sandbox_baseline.blocks_data) return null;
    const map = new Map();
    sandbox_baseline.blocks_data.forEach(b => map.set(b.name, b));
    return map;
  }, [sandbox_baseline]);

  const sandboxBlocks = useMemo(() => {
    if (!sbData) return[];
    let filtered = sbData.blocks_data;
    if (!sandboxShowUnreachable) {
      filtered = filtered.filter(b => tFloor >= b.min_floor);
    }
    if (sandboxMinHits > 1) filtered = filtered.filter(b => b.avg_hits >= sandboxMinHits);
    if (sandboxBlockFilters.length > 0) filtered = filtered.filter(b => sandboxBlockFilters.includes(b.name));
    return filtered;
  }, [sbData, tFloor, sandboxShowUnreachable, sandboxMinHits, sandboxBlockFilters]);

  const uniqueBlockNames = sbData ? Array.from(new Set(sbData.blocks_data.map(b => b.name))) :[];

  const sandboxDefaultColDef = useMemo(() => ({
    sortable: true,
    filter: true,
    resizable: true
  }), [ ]);

  const sandboxAutoSizeStrategy = useMemo(() => ({
    type: 'fitCellContents'
  }), [ ]);

  const sandboxColumns = useMemo(() => {
    
    // Custom React Renderer to automatically inject (+X) or (-X) if a baseline is locked!
    const createDiffRenderer = (field, isLowerBetter = false) => (p) => {
      const val = p.data[field];
      let baseVal = null;
      if (baselineMap && baselineMap.has(p.data.name)) {
        baseVal = baselineMap.get(p.data.name)[field];
      }

      const formattedVal = Math.floor(val).toLocaleString();
      if (baseVal === null || baseVal === undefined || Math.floor(val) === Math.floor(baseVal)) {
        return <span>{formattedVal}</span>;
      }

      const diff = Math.floor(val) - Math.floor(baseVal);
      const diffStr = diff > 0 ? `+${diff.toLocaleString()}` : diff.toLocaleString();
      
      // If we are looking at 'Hits', negative is green. If EDPS, positive is green!
      const isGood = isLowerBetter ? diff < 0 : diff > 0;
      
      // Hardcoded inline hex values because AG grid can sometimes swallow global Tailwind classes
      const colorClass = isGood ? '#4CAF50' : '#ff4b4b';

      return (
        <div className="flex items-center justify-end w-full gap-1 h-full">
          <span>{formattedVal}</span>
          <span style={{ color: colorClass, fontSize: '0.75rem', fontWeight: 'bold' }}>({diffStr})</span>
        </div>
      );
    };

    const cols =[
      { 
        field: "id", headerName: "Icon", pinned: "left", minWidth: 70, sortable: false, filter: false,
        cellRenderer: (p) => (
          <div className="flex justify-center items-center h-full">
            <img src={`/assets/cards/cores/${p.value}.png`} alt={p.value} className="w-8 h-8 pixelated" />
          </div>
        )
      },
      { field: "name", headerName: "Block", pinned: "left" },
      { field: "mod_hp", headerName: "HP", valueFormatter: p => Math.floor(p.value).toLocaleString(), type: 'numericColumn' },
      { field: "mod_eff_armor", headerName: "Armor", valueFormatter: p => Math.floor(p.value).toLocaleString(), type: 'numericColumn' },
      { field: "edps", headerName: "EDPS", cellRenderer: createDiffRenderer("edps", false), type: 'numericColumn', cellStyle: { color: '#ffa229', fontWeight: 'bold' } },
      { field: "enr_edps", headerName: "Enr EDPS", cellRenderer: createDiffRenderer("enr_edps", false), type: 'numericColumn', cellStyle: { color: '#f87171', fontWeight: 'bold' } },
      { field: "reg_hit", headerName: "Reg Hit", cellRenderer: createDiffRenderer("reg_hit", false), type: 'numericColumn' },
      { field: "avg_hits", headerName: "Avg Hits", cellRenderer: createDiffRenderer("avg_hits", true), type: 'numericColumn', cellStyle: { fontWeight: 'bold' } },
      { field: "max_hits", headerName: "Max Hits", cellRenderer: createDiffRenderer("max_hits", true), type: 'numericColumn', cellStyle: { color: '#7D808D' } }
    ];

    if (sandboxShowCrits) {
      cols.push(
        { field: "crit", headerName: "Crit", cellRenderer: createDiffRenderer("crit", false), type: 'numericColumn', cellStyle: { backgroundColor: 'rgba(0,0,0,0.05)' } },
        { field: "scrit", headerName: "sCrit", cellRenderer: createDiffRenderer("scrit", false), type: 'numericColumn', cellStyle: { backgroundColor: 'rgba(0,0,0,0.05)' } },
        { field: "ucrit", headerName: "uCrit", cellRenderer: createDiffRenderer("ucrit", false), type: 'numericColumn', cellStyle: { backgroundColor: 'rgba(0,0,0,0.05)' } },
        { field: "enr_hit", headerName: "Enr Hit", cellRenderer: createDiffRenderer("enr_hit", false), type: 'numericColumn', cellStyle: { color: '#fca5a5', backgroundColor: 'rgba(127,29,29,0.05)' } },
        { field: "enr_crit", headerName: "Enr Crit", cellRenderer: createDiffRenderer("enr_crit", false), type: 'numericColumn', cellStyle: { color: '#fca5a5', backgroundColor: 'rgba(127,29,29,0.05)' } },
        { field: "enr_scrit", headerName: "Enr sCrit", cellRenderer: createDiffRenderer("enr_scrit", false), type: 'numericColumn', cellStyle: { color: '#fca5a5', backgroundColor: 'rgba(127,29,29,0.05)' } },
        { field: "enr_ucrit", headerName: "Enr uCrit", cellRenderer: createDiffRenderer("enr_ucrit", false), type: 'numericColumn', cellStyle: { color: '#fca5a5', backgroundColor: 'rgba(127,29,29,0.05)' } }
      );
    }
    return cols;
  },[sandboxShowCrits, baselineMap]);

  // Dynamic Limits based on Ascensions and Caps
  const totalAllowed = parseInt(store.arch_level) + parseInt(store.upgrade_levels[12] || 0);
  const capInc = parseInt(store.upgrade_levels[45] || 0) * 5; // H45 scales by 5
  const STAT_CAPS = {
    Str: 50 + capInc, Agi: 50 + capInc, Per: 25 + capInc, Int: 25 + capInc, Luck: 25 + capInc,
    Div: store.asc1_unlocked ? (10 + capInc) : 0, 
    Corr: store.asc2_unlocked ? (10 + capInc) : 0
  };

  const MAX_STAT_CAPS = {
    Str: 55, Agi: 55, Per: 30, Int: 30, Luck: 30,
    Div: store.asc1_unlocked ? 15 : 0, 
    Corr: store.asc2_unlocked ? 15 : 0
  };

  const activeStats = [ 'Str', 'Agi', 'Per', 'Int', 'Luck' ];
  if (store.asc1_unlocked) activeStats.push('Div');
  if (store.asc2_unlocked) activeStats.push('Corr');

  // --- REACTIVE AI CALIBRATION ---
  const dynamicBudget = parseInt(store.arch_level) + parseInt(store.upgrade_levels[12] || 0);
  const bounds = {};
  let lockedSum = 0;
  activeStats.forEach(s => {
    if (lockedStats[s] !== undefined) {
      bounds[s] = [lockedStats[s], lockedStats[s]];
      lockedSum += lockedStats[s];
    } else {
      bounds[s] =[0, STAT_CAPS[s]];
    }
  });
  const isOverBudget = lockedSum > dynamicBudget;

  // Memoize the heavy AI Profile calculation so it doesn't freeze the browser thread!
  const profData = useMemo(() => {
    if (isOverBudget) return null;
    return getOptimalStepProfile(activeStats, dynamicBudget, bounds, simsPerSec, timeLimit);
  },[JSON.stringify(activeStats), dynamicBudget, JSON.stringify(bounds), simsPerSec, timeLimit, isOverBudget]);
  
  const step1 = profData ? profData.step_1 : 100;

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

  // --- ROI ANALYZERS ---
  const handleAnalyzeStats = async (context) => {
    setIsRoiLoading(true);
    setRoiProgressMsg("Testing marginal stat values (15 sims each)...");
    
    try {
      const pool = new EngineWorkerPool();
      await pool.init();
      const statResults = {};
      const promises =[];
      const targetMetric = store.opt_results.run_target_metric;
      const baseVal = store.opt_results.final_summary_out[targetMetric];
      const bestFinal = store.opt_results.best_final;
      
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

      await pool.syncState(baseStateDict);

      activeStats.forEach(stat => {
        const maxCap = STAT_CAPS[stat] || 99;
        if (bestFinal[stat] < maxCap) {
          statResults[stat] = { sum: 0, count: 0 };
          for (let i = 0; i < 15; i++) {
            const testStats = { ...bestFinal,[stat]: bestFinal[stat] + 1 };
            const p = pool.runTask(testStats).then(res => {
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
        store.saveRoiToCurrentRun(context, 'roi_stats', finalRes);
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

  const handleAnalyzeUpgrades = async (context) => {
    setIsRoiLoading(true);
    setRoiProgressMsg("Testing marginal upgrade values (This may take a minute)...");
    
    try {
      const pool = new EngineWorkerPool();
      await pool.init();
      const upgResults = {};
      const promises =[];
      const targetMetric = store.opt_results.run_target_metric;
      const baseVal = store.opt_results.final_summary_out[targetMetric];
      const bestFinal = store.opt_results.best_final;
      const asc2LockedRows =[19, 27, 34, 46, 52, 55];

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

      await pool.syncState(baseStateDict);

      Object.keys(INTERNAL_UPGRADE_CAPS || {}).forEach(upgIdStr => {
        const upgId = parseInt(upgIdStr);
        const currentLvl = store.upgrade_levels[upgId] || 0;
        const maxLvl = INTERNAL_UPGRADE_CAPS[upgId] || 99;

        if (!store.asc1_unlocked && ASC1_LOCKED_UPGS.includes(upgId)) return;
        if (!store.asc2_unlocked && ASC2_LOCKED_UPGS.includes(upgId)) return;
        
        const currentFloor = Number(store.current_max_floor) || 1;
        if (currentFloor < (UPGRADE_LEVEL_REQS[upgId] || 0)) return;
        
        if (currentLvl >= maxLvl) return;

        const upgData = UPGRADE_NAMES && UPGRADE_NAMES[upgId];
        const upgName = upgData ? (Array.isArray(upgData) ? upgData[0] : upgData) : `Upg ${upgId}`;
        upgResults[upgId] = { sum: 0, count: 0, name: upgName, action: `Lvl ${currentLvl} ➔ ${currentLvl + 1}` };

        for (let i = 0; i < 15; i++) {
          // Pass the upgrade variation directly via the test_upgrades parameter!
          const p = pool.runTask(bestFinal, { [upgId]: currentLvl + 1 }).then(res => {
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
          return { id: k, name: upgResults[k].name, gain: gain, action: upgResults[k].action };
        }).sort((a, b) => b.gain - a.gain);
        store.saveRoiToCurrentRun(context, 'roi_upgrades', finalRes.slice(0, 10));
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

  const handleAnalyzeExternal = async (context) => {
    setIsRoiLoading(true);
    setRoiProgressMsg("Testing marginal external values (This may take a minute)...");
    
    try {
      const pool = new EngineWorkerPool();
      await pool.init();
      const extResults = {};
      const promises = [ ];
      const targetMetric = store.opt_results.run_target_metric;
      const baseVal = store.opt_results.final_summary_out[targetMetric];
      const bestFinal = store.opt_results.best_final;

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

      await pool.syncState(baseStateDict);

      EXTERNAL_UI_GROUPS.forEach(group => {
        const currentVal = store.external_levels[group.rows[0]] || 0;
        let maxVal = group.max !== undefined ? group.max : ((group.ui_type === 'skill' || group.ui_type === 'bundle') ? 1 : 9999);
        
        // Geoduck level maxes out based on the 0.0025 per level scaling vs the % cap.
        // Cap is 75% for Asc2 (300 levels), and 50% for Asc1/Asc0 (200 levels).
        if (group.id === 'geoduck') {
          maxVal = store.asc2_unlocked ? 300 : 200;
        }

        // Safety Gating
        if (group.id === 'geoduck' && !store.geoduck_unlocked) return;
        if (group.id === 'hestia' && !store.asc1_unlocked) return;
        if (group.id === 'hades' && !store.asc1_unlocked) return;
        if (group.id === 'asc_bundle' && !store.asc1_unlocked) return;
        if (group.id === 'arch_card' && !store.asc1_unlocked) return;
        if (currentVal >= maxVal) return;

        let actionText = "";
        if (group.ui_type === 'skill' || group.ui_type === 'bundle') {
          actionText = "Unlock";
        } else if (group.ui_type === 'pet') {
          if (currentVal === -1) actionText = "Obtain Pet";
          else actionText = `Rank ${currentVal} ➔ ${currentVal + 1}`;
        } else {
          actionText = `Lvl ${currentVal} ➔ ${currentVal + 1}`;
        }

        // Isolate payload dynamically over mapped rows
        const testExt = {};
        group.rows.forEach(r => testExt[r] = currentVal + 1);

        extResults[group.id] = { sum: 0, count: 0, name: group.name, action: actionText };

        for (let i = 0; i < 15; i++) {
          const p = pool.runTask(bestFinal, undefined, testExt).then(res => {
            extResults[group.id].sum += (res[targetMetric] || 0);
            extResults[group.id].count++;
          });
          promises.push(p);
        }
      });

      if (promises.length > 0) {
        await Promise.all(promises);
        const finalRes = Object.keys(extResults).map(k => {
          const avg = extResults[k].sum / extResults[k].count;
          const gain = ((avg - baseVal) / 60.0) * 1000.0;
          return { id: k, name: extResults[k].name, gain: gain, action: extResults[k].action };
        }).sort((a, b) => b.gain - a.gain);
        store.saveRoiToCurrentRun(context, 'roi_externals', finalRes.slice(0, 10));
      } else {
        alert("All eligible external upgrades are maxed out!");
      }
      pool.terminate();
    } catch (err) {
      console.error(err);
      alert("ROI Analyzer failed: " + err.message);
    }
    setIsRoiLoading(false);
  };

  const handleAnalyzeCards = async (context) => {
    setIsRoiLoading(true);
    setRoiProgressMsg("Testing marginal block card values (This may take a minute)...");
    
    try {
      const pool = new EngineWorkerPool();
      await pool.init();
      const cardResults = {};
      const promises = [ ];
      const targetMetric = store.opt_results.run_target_metric;
      const baseVal = store.opt_results.final_summary_out[targetMetric];
      const bestFinal = store.opt_results.best_final;

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

      await pool.syncState(baseStateDict);

      Object.keys(ORE_MIN_FLOORS).forEach(cardId => {
        // Floor and Ascension Access Gating
        if (!store.asc1_unlocked && (cardId.startsWith('div') || cardId.endsWith('4'))) return;
        if (!store.asc2_unlocked && cardId.endsWith('4')) return;
        if (store.current_max_floor < ORE_MIN_FLOORS[cardId]) return;

        const currentLvl = store.cards[cardId] || 0;
        const maxLvl = store.asc1_unlocked ? 4 : 3;
        if (currentLvl >= maxLvl) return;

        let targetLvlName = "";
        if (currentLvl === 0) targetLvlName = "Unlock Regular";
        else if (currentLvl === 1) targetLvlName = "Upgrade to Gilded";
        else if (currentLvl === 2) targetLvlName = "Upgrade to Poly";
        else if (currentLvl === 3) targetLvlName = "Upgrade to Infernal";

        cardResults[cardId] = { sum: 0, count: 0, name: cardId, action: targetLvlName };

        for (let i = 0; i < 15; i++) {
          const p = pool.runTask(bestFinal, undefined, undefined, { [cardId]: currentLvl + 1 }).then(res => {
            cardResults[cardId].sum += (res[targetMetric] || 0);
            cardResults[cardId].count++;
          });
          promises.push(p);
        }
      });

      if (promises.length > 0) {
        await Promise.all(promises);
        const finalRes = Object.keys(cardResults).map(k => {
          const avg = cardResults[k].sum / cardResults[k].count;
          const gain = ((avg - baseVal) / 60.0) * 1000.0;
          return { id: k, name: cardResults[k].name, gain: gain, action: cardResults[k].action };
        }).sort((a, b) => b.gain - a.gain);
        store.saveRoiToCurrentRun(context, 'roi_cards', finalRes.slice(0, 10));
      } else {
        alert("All eligible block cards are maxed out!");
      }
      pool.terminate();
    } catch (err) {
      console.error(err);
      alert("ROI Analyzer failed: " + err.message);
    }
    setIsRoiLoading(false);
  };

  // --- ENGINE EXECUTION LOOP ---
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

      setOptProgressMsg(`Booting AI Cores...`);
      const pool = new EngineWorkerPool();
      await pool.init(
        () => {}, 
        (ready, total) => setOptProgressMsg(`Booting Engine Cores: ${ready}/${total}`)
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
        if (!activeStats.includes(k)) fixedStats[k] = store.base_stats[k];
      });

      let totalSimsExecuted = 0;
      let lastProgressUpdate = 0;

      const onProgressCb = (phase, rnd, totRnd, comp, tot) => {
        totalSimsExecuted++;
        const now = Date.now();
        
        // Throttle UI updates to twice a second to prevent React from choking
        if (now - lastProgressUpdate > 500 || comp === tot) {
          const elapsed = (now - globalStartTime) / 1000;
          setOptProgressMsg(`⚙️ ${phase} | Round ${rnd}/${totRnd} | ${comp}/${tot} sims | ⏱️ Elapsed: ${elapsed.toFixed(1)}s / ${timeLimit}s`);
          setOptProgressPct((comp / tot) * 100);
          lastProgressUpdate = now;
        }
      };

      // --- PHASE 1 (Coarse) ---
      const remP1 = (dynamicBudget - lockedSum) % step1;
      const p1Budget = dynamicBudget - remP1;
      
      let { bestDist: bestP1, summary: sumP1 } = await runOptimizationPhase(
        "Phase 1 (Coarse)", targetMetricKey, activeStats, p1Budget, step1, 25,
        pool, fixedStats, bounds, timeLimit, globalStartTime, onProgressCb
      );

      bestP1 = topUpBuild(bestP1, activeStats, dynamicBudget, STAT_CAPS, lockedStats);

      let bestFinal = bestP1;
      let finalSummary = sumP1;

      // --- PHASE 2 (Fine) ---
      let bestP2, sumP2;
      if (bestP1 && ((Date.now() - globalStartTime) / 1000) < timeLimit) {
        const boundsP2 = {};
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
          pool, fixedStats, boundsP2, timeLimit, globalStartTime, onProgressCb
        );
        bestP2 = topUpBuild(res2.bestDist, activeStats, dynamicBudget, STAT_CAPS, lockedStats);
        sumP2 = res2.summary;
        if (bestP2) { bestFinal = bestP2; finalSummary = sumP2; }
      }

      // --- PHASE 3 (Exact) ---
      if (bestP2 && ((Date.now() - globalStartTime) / 1000) < timeLimit) {
        const boundsP3 = {};
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
          pool, fixedStats, boundsP3, timeLimit, globalStartTime, onProgressCb
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
          
          const chartHillScores = [sumP1 ? sumP1[targetMetricKey] : null, sumP2 ? sumP2[targetMetricKey] : null, finalSummary[targetMetricKey]].filter(x => x !== null);
          const chartHillLabels = ["P1 (Coarse)", sumP2 ? "P2 (Fine)" : null, "P3 (Exact)"].filter(x => x !== null);
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
              Include: true,
              Profile: profileTag,
              Target: targetMetricKey,
              "Metric Score": finalSummary[targetMetricKey],
              "Avg Floor": finalSummary.avg_floor,
              "Max Floor": finalSummary.abs_max_floor,
              ...bestFinal,
              _restore_state: payload
          });

          // Force the UI back to the default result tabs for the new run
          setResTab('build');
          setDataTab('performance');

          // Auto-select the target block in the Card Drops tab if applicable
          if (targetMetricKey.startsWith('block_')) {
              setCardSelBlock(targetBlock);
          } else {
              setCardSelBlock('');
          }

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

 // --- REUSABLE RESULTS DASHBOARD ---
  const renderResultsDashboard = (context) => {
    if (!store.opt_results || !store.opt_results.final_summary_out) return null;
    const runMetric = store.opt_results.run_target_metric;
    const isFloorTarget = runMetric === 'highest_floor';
    const scaleScore = (v) => isFloorTarget ? v : (v / 60.0) * 1000.0;
    const unitLabel = isFloorTarget ? "Floor Reached" : "Yield per 1k Arch Secs";
    const finalSum = store.opt_results.final_summary_out;

    const innerTabs =[{ id: 'performance', label: '📈 Performance' }];
    if (!isFloorTarget) innerTabs.push({ id: 'cards', label: '🎴 Card Drops' });
    if (store.opt_results.show_loot) innerTabs.push({ id: 'loot', label: '🎒 Loot Breakdown' });
    if (store.opt_results.show_wall) innerTabs.push({ id: 'wall', label: '🧱 Progression Wall' });

    const avgMetrics = finalSum.avg_metrics || {};
    const availableBlocks = Object.keys(avgMetrics)
      .filter(k => k.startsWith("block_"))
      .map(k => k.replace("block_", "").replace("_per_min", ""))
      .sort();

    return (
      <div className="mt-8 animate-fade-in space-y-6" id={`dashboard-anchor-${context}`}>
        <div className="bg-[#1e1e1e] border-l-4 border-l-green-500 p-4 rounded shadow">
          <h3 className="text-xl font-bold text-green-400">✅ Simulation Complete in {store.opt_results.elapsed.toFixed(1)} seconds!</h3>
        </div>

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
                onClick={(e) => {
                  store.setBaseStats(store.opt_results.best_final);
                  const btn = e.target;
                  const originalText = btn.innerText;
                  btn.innerText = "✅ Applied!";
                  setTimeout(() => { btn.innerText = originalText; }, 2000);
                }}
                className="flex-1 py-2 bg-[#2b2b2b] border border-st-orange text-st-orange font-bold rounded hover:bg-st-orange hover:text-[#2b2b2b] transition-colors"
              >
                ✨ Apply Build Globally
              </button>
              <button 
                onClick={() => {
                  store.setSandboxStats(store.opt_results.best_final);
                  setActiveSubTab('sandbox');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="flex-1 py-2 bg-[#2b2b2b] border border-st-orange text-st-orange font-bold rounded hover:bg-st-orange hover:text-[#2b2b2b] transition-colors"
              >
                🧪 Send to Sandbox
              </button>
            </div>
          </div>
        )}

        {/* 📊 ADVANCED ANALYTICS */}
        {resTab === 'data' && (
          <div className="st-container animate-fade-in">
            <h3 className="text-2xl font-bold mb-4">📊 Advanced Analytics Dashboard</h3>
            
            <div className="flex overflow-x-auto border-b border-st-border mb-6 no-scrollbar">
              {innerTabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setDataTab(t.id)}
                  className={`px-4 py-2 font-medium whitespace-nowrap transition-colors duration-200 border-b-2 ${
                    dataTab === t.id ? 'border-st-orange text-st-text' : 'border-transparent text-st-text-light hover:text-st-orange'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {dataTab === 'performance' && (
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  {isFloorTarget ? (
                    <div className="space-y-4">
                      <h4 className="font-bold text-lg border-b border-st-border pb-2">🏆 Push Potential</h4>
                      <div className="flex flex-col">
                        <span className="text-st-text-light text-sm">Theoretical Peak Floor</span>
                        <span className="text-2xl font-bold">Floor {finalSum.abs_max_floor}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-st-text-light text-sm">Peak Probability</span>
                        <span className="text-2xl font-bold">{(finalSum.abs_max_chance * 100).toFixed(1)}%</span>
                      </div>

                      {/* 🎲 Reality Check Injection */}
                      {(() => {
                        const peakChance = finalSum.abs_max_chance || 0;
                        const runsNeeded = peakChance > 0 ? Math.ceil(1.0 / peakChance) : 0;
                        
                        // Pull the true mathematical Total Time (Arch Seconds) directly from the engine metrics!
                        const maxSta = (finalSum.avg_metrics && finalSum.avg_metrics.total_time) 
                          ? finalSum.avg_metrics.total_time 
                          : ((finalSum.stamina_trace && finalSum.stamina_trace.stamina && finalSum.stamina_trace.stamina.length > 0) 
                            ? finalSum.stamina_trace.stamina[0] 
                            : 0);
                            
                        const archSecsCost = (runsNeeded * maxSta) / 1000.0;
                        
                        return peakChance > 0 ? (
                          <div className="bg-yellow-900/20 border-l-4 border-yellow-500 p-3 rounded text-sm text-yellow-500">
                            🎲 <strong>Reality Check:</strong> Requires avg <strong>{runsNeeded.toLocaleString()} runs</strong> (~<strong>{archSecsCost.toFixed(1)}k</strong> Arch Secs) to replicate peak.
                          </div>
                        ) : null;
                      })()}

                      <div className="flex flex-col">
                        <span className="text-st-text-light text-sm">Average Consistency Floor</span>
                        <span className="text-2xl font-bold">Floor {finalSum.avg_floor.toFixed(1)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div>
                        <h4 className="font-bold text-lg">💰 Banked Yields</h4>
                        <p className="text-sm text-st-text-light mb-2">Target {runMetric.includes("frag") ? "Fragments" : runMetric.includes("block") ? "Kills" : "EXP"} per <b>1k Arch Seconds</b></p>
                        <div className="text-3xl font-bold text-st-orange">{scaleScore(finalSum[runMetric]).toLocaleString(undefined, {minimumFractionDigits:1, maximumFractionDigits:1})}</div>
                      </div>
                      <hr className="border-st-border" />
                      <div>
                        <h4 className="font-bold text-lg">⏱️ Real-Time Yield</h4>
                        <p className="text-sm text-st-text-light mb-2">{runMetric.includes("frag") ? "Fragments" : runMetric.includes("block") ? "Kills" : "EXP"} / minute</p>
                        <div className="text-2xl font-bold">{finalSum[runMetric].toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</div>
                      </div>
                      
                      {runMetric === 'xp_per_min' && (
                        <>
                          <hr className="border-st-border" />
                          <div>
                            <h4 className="font-bold text-lg">🆙 Level Up Calculator</h4>
                            <p className="text-sm text-st-text-light mb-4">Based on {finalSum[runMetric].toLocaleString(undefined, {minimumFractionDigits:2})} EXP/min</p>
                            <div className="grid grid-cols-2 gap-4 mb-4">
                              <div>
                                <label className="block text-sm mb-1">Current EXP</label>
                                <input 
                                  type="number" 
                                  value={curXp} 
                                  onFocus={(e) => e.target.select()}
                                  onChange={(e) => setCurXp(e.target.value === '' ? '' : parseFloat(e.target.value))}
                                  onBlur={(e) => setCurXp(Math.max(0, parseFloat(e.target.value) || 0))}
                                  className="st-input"
                                />
                              </div>
                              <div>
                                <label className="block text-sm mb-1">Target EXP</label>
                                <input 
                                  type="number" 
                                  value={tarXp} 
                                  onFocus={(e) => e.target.select()}
                                  onChange={(e) => setTarXp(e.target.value === '' ? '' : parseFloat(e.target.value))}
                                  onBlur={(e) => setTarXp(Math.max(0, parseFloat(e.target.value) || 0))}
                                  className="st-input"
                                />
                              </div>
                            </div>
                            {tarXp > curXp && finalSum[runMetric] > 0 && (
                              <div className="bg-green-900/20 border-l-4 border-green-500 p-3 rounded text-green-700 text-sm">
                                <strong>Required:</strong> ~{(((tarXp - curXp) / finalSum[runMetric]) * 60.0 / 1000.0).toFixed(1)}k Arch Seconds ({((tarXp - curXp) / finalSum[runMetric]).toFixed(1)} mins real-time)
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  
                  <hr className="border-st-border" />
                  <div className="flex flex-col">
                    <h4 className="font-bold text-lg mb-1">🧱 Average Death</h4>
                    <span className="text-st-text-light text-sm mb-1">Floor reached per run</span>
                    <span className="text-2xl font-bold">Floor {finalSum.avg_floor.toFixed(1)}</span>
                  </div>
                </div>

                <div className="lg:col-span-3 space-y-6">
                  <div className="border border-st-border rounded bg-st-bg p-2">
                    <h4 className="font-bold ml-2 mt-2">AI Convergence (Hill Climb)</h4>
                    <p className="text-xs text-st-text-light ml-2 mb-2">Y-Axis: {unitLabel}</p>
                    <Plot
                      data={[{
                        x: store.opt_results.chart_hill_labels,
                        y: store.opt_results.chart_hill_scores,
                        type: 'scatter', mode: 'lines+markers',
                        line: { color: '#4CAF50' }, marker: { size: 10 }
                      }]}
                      layout={{
                        font: { color: store.theme === 'dark' ? '#FAFAFA' : '#31333F' },
                        paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
                        margin: { t: 10, b: 30, l: 40, r: 20 },
                        height: 250
                      }}
                      useResizeHandler={true} style={{ width: '100%' }} config={{ displayModeBar: false }}
                    />
                  </div>
                  <div className="border border-st-border rounded bg-st-bg p-2">
                    <h4 className="font-bold ml-2 mt-2">Engine Confidence Analysis</h4>
                    <p className="text-xs text-st-text-light ml-2 mb-2">X-Axis: {unitLabel}</p>
                    <Plot
                      data={[{
                        y:["Worst Tested", "Average", "Runner-Up", "🏆 Optimal"],
                        x:[
                          scaleScore(store.opt_results.worst_val),
                          scaleScore(store.opt_results.avg_val),
                          scaleScore(store.opt_results.runner_up_val),
                          scaleScore(finalSum[runMetric])
                        ],
                        type: 'bar', orientation: 'h', textposition: 'auto',
                        marker: { color:["#ff4b4b", "#ffa229", "#6495ED", "#4CAF50"] }
                      }]}
                      layout={{
                        font: { color: store.theme === 'dark' ? '#FAFAFA' : '#31333F' },
                        paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
                        margin: { t: 10, b: 30, l: 100, r: 20 },
                        height: 250
                      }}
                      useResizeHandler={true} style={{ width: '100%' }} config={{ displayModeBar: false }}
                    />
                  </div>
                </div>
              </div>
            )}

            {dataTab === 'cards' && (() => {
              const displayBlocks = [...availableBlocks];
              if (cardSelBlock && !displayBlocks.includes(cardSelBlock)) {
                displayBlocks.push(cardSelBlock);
                displayBlocks.sort();
              }

              return (
              <div className="space-y-6">
                <h4 className="font-bold text-lg">🎴 Block Card Drop Estimates</h4>
                {displayBlocks.length === 0 ? (
                  <div className="text-st-text-light">No block kill data available for this run.</div>
                ) : (
                  <>
                    <div className="flex flex-col md:flex-row items-center gap-4">
                      <label className="font-bold whitespace-nowrap">Select Block:</label>
                      <select 
                        value={cardSelBlock || displayBlocks[0]} 
                        onChange={(e) => setCardSelBlock(e.target.value)}
                        className="w-full md:w-auto bg-st-bg border border-st-border rounded p-2 text-st-text focus:border-st-orange focus:outline-none"
                      >
                        {displayBlocks.map(b => (
                          <option key={b} value={b}>{b.charAt(0).toUpperCase() + b.slice(1)}</option>
                        ))}
                      </select>
                    </div>
                    
                    {(() => {
                      const selB = cardSelBlock || displayBlocks[0];
                      const valMins = avgMetrics[`block_${selB}_per_min`] || 0;
                      
                      const formatTime = (reqKills) => {
                        if (valMins <= 0) return { rt: "N/A", arch: 0 };
                        const rtMins = reqKills / valMins;
                        const rtStr = rtMins < 60 ? `${rtMins.toFixed(1)}m` : `${(rtMins/60).toFixed(1)}h`;
                        const arch1k = (reqKills / (valMins / 60.0)) / 1000.0;
                        return { rt: rtStr, arch: arch1k };
                      };

                      const drops =[
                        { name: "Base Card", odds: 1500, bg: "1" },
                        { name: "Poly Fragments", odds: 7500, bg: "2" },
                        { name: "Infernal Fragments", odds: 200000, bg: "4" }
                      ];

                      return (
                        <div>
                          <div className="text-st-text-light text-sm mb-6">Based on {valMins.toFixed(2)} <b>{selB}</b> kills/min</div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {drops.map((d, i) => {
                              const rt50 = formatTime(0.693 * d.odds);
                              const rt90 = formatTime(2.302 * d.odds);
                              const rt99 = formatTime(4.605 * d.odds);
                              
                              return (
                                <div key={i} className="border border-st-border rounded bg-st-bg p-4 flex flex-col items-center text-center shadow-sm">
                                  <div className="relative flex items-center justify-center mb-3" style={{ width: UI_BLOCK_CARD_WIDTH * 0.8, height: UI_BLOCK_CARD_WIDTH * 1.0 }}>
                                    <img src={`/assets/cards/backgrounds/${d.bg}.png`} className="absolute inset-0 w-full h-full object-contain" style={{ imageRendering: 'pixelated' }} />
                                    <img src={`/assets/cards/cores/${selB}.png`} className="absolute inset-0 w-full h-full object-contain drop-shadow-md" style={{ imageRendering: 'pixelated', transform: `translate(${UI_BLOCK_CARD_X_OFFSET}px, ${UI_BLOCK_CARD_Y_OFFSET}px) scale(${UI_CARD_CBLOCK_SCALE})` }} onError={(e) => e.target.style.display = 'none'} />
                                  </div>
                                  <div className="font-bold mb-1">{d.name}</div>
                                  <div className="text-xs text-st-text-light mb-4">(1 in {d.odds.toLocaleString()})</div>
                                  <hr className="border-st-border mb-4"/>
                                  {valMins > 0 ? (
                                    <div className="space-y-3 text-sm">
                                      <div><strong>50% (Lucky):</strong><br/>~{rt50.rt} | ~{rt50.arch.toFixed(1)}k Arch Secs</div>
                                      <div><strong>90% (Safe):</strong><br/>~{rt90.rt} | ~{rt90.arch.toFixed(1)}k Arch Secs</div>
                                      <div><strong>99% (Guaranteed):</strong><br/>~{rt99.rt} | ~{rt99.arch.toFixed(1)}k Arch Secs</div>
                                    </div>
                                  ) : (
                                    <div className="text-st-text-light text-sm py-8">N/A (0 kills)</div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
              );
            })()}

            {dataTab === 'loot' && store.opt_results.chart_loot && (
              <div className="space-y-4">
                <h4 className="font-bold text-lg">🎒 Collateral Loot Distribution</h4>
                <p className="text-sm text-st-text-light">On average, every <b>1k Arch Seconds</b> of simulated mining yields the following collateral fragments alongside your target:</p>
                <div className="w-full h-[400px] border border-st-border rounded bg-st-bg p-2">
                  <Plot
                    data={[{
                      x: Object.keys(store.opt_results.chart_loot),
                      y: Object.values(store.opt_results.chart_loot).map(v => (v / 60.0) * 1000.0),
                      type: 'bar',
                      text: Object.values(store.opt_results.chart_loot).map(v => ((v / 60.0) * 1000.0).toFixed(1)),
                      textposition: 'outside',
                      marker: { color:['#636EFA', '#EF553B', '#00CC96', '#AB63FA', '#FFA15A', '#19D3F3', '#FF6692'] }
                    }]}
                    layout={{
                      font: { color: store.theme === 'dark' ? '#FAFAFA' : '#31333F' },
                      paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
                      margin: { t: 20, b: 40, l: 40, r: 20 }
                    }}
                    useResizeHandler={true} style={{ width: '100%', height: '100%' }} config={{ displayModeBar: false }}
                  />
                </div>
              </div>
            )}

            {dataTab === 'wall' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="w-full h-[350px] border border-st-border rounded bg-st-bg p-2">
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
                      font: { color: store.theme === 'dark' ? '#FAFAFA' : '#31333F' },
                      title: 'Death Distribution (Progression Wall)',
                      paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
                      margin: { t: 40, b: 40, l: 40, r: 20 },
                      xaxis: { type: 'category', title: 'Floor', color: chartFontColor, gridcolor: chartGridColor }, yaxis: { title: 'Deaths', color: chartFontColor, gridcolor: chartGridColor }
                    }}
                    useResizeHandler={true} style={{ width: '100%', height: '100%' }} config={{ displayModeBar: false }}
                  />
                </div>
                {store.opt_results.final_summary_out.stamina_trace && (
                  <div className="w-full h-[350px] border border-st-border rounded bg-st-bg p-2">
                    <Plot
                      data={[ {
                        x: store.opt_results.final_summary_out.stamina_trace.floor,
                        y: store.opt_results.final_summary_out.stamina_trace.stamina,
                        type: 'scatter', mode: 'lines', fill: 'tozeroy',
                        line: { color: '#ffa229' }, fillcolor: 'rgba(255, 162, 41, 0.2)'
                      } ]}
                      layout={{
                        font: { color: store.theme === 'dark' ? '#FAFAFA' : '#31333F' },
                        title: 'Stamina Depletion Trace (Sample Run)',
                        paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
                        margin: { t: 40, b: 40, l: 40, r: 20 },
                        xaxis: { title: 'Floor Level', color: chartFontColor, gridcolor: chartGridColor }, yaxis: { title: 'Stamina Remaining', color: chartFontColor, gridcolor: chartGridColor }
                      }}
                      useResizeHandler={true} style={{ width: '100%', height: '100%' }} config={{ displayModeBar: false }}
                    />
                  </div>
                )}
              </div>
            )}
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
                  <div className="border border-st-border rounded p-4 bg-st-bg">
                    <h4 className="font-bold mb-2">1. Base Stats ROI</h4>
                    <p className="text-sm text-st-text-light mb-4">Tests adding +1 to every stat to see which yields the highest increase.</p>
                    <button 
                      onClick={() => handleAnalyzeStats(context)}
                      disabled={isRoiLoading}
                      className="w-full py-2 bg-st-secondary border border-st-border text-st-text font-bold rounded hover:border-st-orange hover:text-st-orange transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-4"
                    >
                      🔍 Analyze Next Stat Point
                    </button>
                    
                    {store.opt_results.roi_stats && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-st-border text-st-text-light text-sm">
                              <th className="py-2 pr-4">Stat (+1)</th>
                              <th className="py-2">Marginal Gain (per 1k Arch Secs)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {store.opt_results.roi_stats.map((r, i) => (
                              <tr key={r.stat} className="border-b border-st-border/50 hover:bg-black/5 transition-colors">
                                <td className="py-2 pr-4 font-bold">{r.stat}</td>
                                <td className="py-2 font-mono text-st-orange">{r.gain > 0 ? '+' : ''}{r.gain.toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* UPGRADES ROI */}
                  <div className="border border-st-border rounded p-4 bg-st-bg">
                    <h4 className="font-bold mb-2">2. Internal Upgrades ROI</h4>
                    <p className="text-sm text-st-text-light mb-4">Tests adding +1 level to every un-maxed internal upgrade.</p>
                    <button 
                      onClick={() => handleAnalyzeUpgrades(context)}
                      disabled={isRoiLoading}
                      className="w-full py-2 bg-st-secondary border border-st-border text-st-text font-bold rounded hover:border-st-orange hover:text-st-orange transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-4"
                    >
                      🔍 Analyze Upgrades
                    </button>
                    
                    {store.opt_results.roi_upgrades && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-st-border text-st-text-light text-sm">
                              <th className="py-2 pr-4">Upgrade</th>
                              <th className="py-2 pr-4">Action</th>
                              <th className="py-2">Marginal Gain (per 1k Arch Secs)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {store.opt_results.roi_upgrades.map((r, i) => (
                              <tr key={r.id} className="border-b border-st-border/50 hover:bg-black/5 transition-colors">
                                <td className="py-2 pr-4 text-sm font-bold">{r.name}</td>
                                <td className="py-2 pr-4 text-xs text-st-text-light">{r.action}</td>
                                <td className="py-2 font-mono text-st-orange">{r.gain > 0 ? '+' : ''}{r.gain.toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* EXTERNAL ROI */}
                  <div className="border border-st-border rounded p-4 bg-st-bg">
                    <h4 className="font-bold mb-2">3. External Upgrades ROI</h4>
                    <p className="text-sm text-st-text-light mb-4">Tests adding +1 to every un-maxed accessible external element (Skills, Pets, Idols).</p>
                    <button 
                      onClick={() => handleAnalyzeExternal(context)}
                      disabled={isRoiLoading}
                      className="w-full py-2 bg-st-secondary border border-st-border text-st-text font-bold rounded hover:border-st-orange hover:text-st-orange transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-4"
                    >
                      🔍 Analyze Externals
                    </button>
                    
                    {store.opt_results.roi_externals && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-st-border text-st-text-light text-sm">
                              <th className="py-2 pr-4">External</th>
                              <th className="py-2 pr-4">Action</th>
                              <th className="py-2">Marginal Gain (per 1k Arch Secs)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {store.opt_results.roi_externals.map((r, i) => (
                              <tr key={r.id} className="border-b border-st-border/50 hover:bg-black/5 transition-colors">
                                <td className="py-2 pr-4 text-sm font-bold">{r.name}</td>
                                <td className="py-2 pr-4 text-xs text-st-text-light">{r.action}</td>
                                <td className="py-2 font-mono text-st-orange">{r.gain > 0 ? '+' : ''}{r.gain.toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* CARDS ROI */}
                  <div className="border border-st-border rounded p-4 bg-st-bg">
                    <h4 className="font-bold mb-2">4. Block Cards ROI</h4>
                    <p className="text-sm text-st-text-light mb-4">Tests adding +1 level to every valid, accessible Block Card based on your max floor.</p>
                    <button 
                      onClick={() => handleAnalyzeCards(context)}
                      disabled={isRoiLoading}
                      className="w-full py-2 bg-st-secondary border border-st-border text-st-text font-bold rounded hover:border-st-orange hover:text-st-orange transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-4"
                    >
                      🔍 Analyze Cards
                    </button>
                    
                    {store.opt_results.roi_cards && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-st-border text-st-text-light text-sm">
                              <th className="py-2 pr-4">Block Card</th>
                              <th className="py-2 pr-4">Action</th>
                              <th className="py-2">Marginal Gain (per 1k Arch Secs)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {store.opt_results.roi_cards.map((r, i) => (
                              <tr key={r.id} className="border-b border-st-border/50 hover:bg-black/5 transition-colors">
                                <td className="py-2 pr-4 text-sm font-bold capitalize">{r.name}</td>
                                <td className="py-2 pr-4 text-xs text-st-text-light">{r.action}</td>
                                <td className="py-2 font-mono text-st-orange">{r.gain > 0 ? '+' : ''}{r.gain.toFixed(2)}</td>
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
    );
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
                  <label className="block text-sm font-bold mb-1">Target Fragment</label>
                  <select 
                    value={targetFrag} 
                    onChange={(e) => setTargetFrag(parseInt(e.target.value))}
                    className="w-full bg-st-bg border border-st-border rounded p-2 text-st-text focus:border-st-orange focus:outline-none"
                  >
                    {Object.entries(FRAG_NAMES)
                      .filter(([val]) => {
                        const fragTier = parseInt(val);
                        if (fragTier === 0) return false; // Filter out Dirt (0)
                        if (fragTier === 6 && !store.asc1_unlocked) return false; // Filter out Divine (6) if Asc1 locked
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
                </>
              )}
            </div>
          </div>

          {/* Strategy Tip */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-400 dark:border-blue-500 p-3 rounded text-sm text-blue-800 dark:text-blue-200 mt-4">
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
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => handleLockValueChange(stat, e.target.value)}
                    disabled={lockedStats[stat] === undefined}
                    className="st-input disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              ))}
            </div>
          </details>

          <hr className="border-st-border" />

          {/* Time Target Slider */}
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

          {/* Run Warning */}
          <div className="bg-yellow-900/20 border-l-4 border-yellow-500 p-3 rounded text-sm text-yellow-800 dark:text-yellow-200 bg-yellow-50 dark:bg-yellow-900/20 dark:text-yellow-200 mb-4">
            ⚠️ <strong>CRITICAL:</strong> Unlike the old server version, you <strong>CAN</strong> safely change tabs while the AI is running! However, do not refresh or close this browser window or the simulation will be aborted.
          </div>

          {!isAnyRunning ? (
            <button 
              onClick={handleRunOptimizer}
              className="w-full py-3 bg-st-orange text-[#2b2b2b] font-bold rounded-lg shadow hover:bg-[#ffb045] transition-colors mt-4"
            >
              🚀 Run Optimizer
            </button>
          ) : isOptimizing ? (
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
          ) : (
            <div className="w-full py-3 bg-st-secondary text-st-text-light font-bold rounded-lg shadow mt-4 text-center cursor-not-allowed">
              ⏳ Wait for active background task to finish...
            </div>
          )}

          {store.opt_results && !store.synthesis_result && !isOptimizing && renderResultsDashboard('optimizer')}

        </div>
      )}

      {/* =========================================
          TAB: SYNTHESIS
      ========================================= */}
      {activeSubTab === 'synth' && (() => {
        const history = store.run_history || [];
        const uniqueTargets =[...new Set(history.map(r => r.Target))];
        const lastTgt = store.opt_results?.run_target_metric;
        
        // Use stored filter, otherwise default to the last run's target, or all if none
        const currentViewTargets = viewTargets !== null ? viewTargets : (lastTgt && uniqueTargets.includes(lastTgt) ? [lastTgt] : uniqueTargets);
        
        const visibleHistory = history.map((r, idx) => ({ ...r, _global_idx: idx }))
                                      .filter(r => currentViewTargets.includes(r.Target));
        
        const checkedRuns = visibleHistory.filter(r => r.Include);

        const handleRestore = (runData, isMetaBuild = false) => {
          if (runData._restore_state) {
            // Restore dashboard state cleanly for both regular runs and meta-builds
            if (runData._restore_state.opt_results) {
                store.setOptResults(runData._restore_state.opt_results);
                store.setSimsState('synthesis_result', runData._restore_state.synthesis_result);
            } else {
                store.setOptResults(runData._restore_state);
                store.setSimsState('synthesis_result', null);
            }
            
            // Clear stale ROI data
            setRoiStatResults(null);
            setRoiUpgResults(null);
            setRoiExtResults(null);
            setRoiCardResults(null);
            
            // Snap to the appropriate tab based on what we are restoring
            setActiveSubTab(isMetaBuild ? 'synth' : 'optimizer');
            setResTab('build');
            setDataTab('performance');

            if (runData.Target && runData.Target.startsWith('block_')) {
                setCardSelBlock(runData.Target.replace('block_', '').replace('_per_min', ''));
            } else {
                setCardSelBlock('');
            }
            
            // Allow React a split second to render the tab, then scroll down to the appropriate dashboard anchor
            setTimeout(() => {
              const anchorId = isMetaBuild ? 'synth-results-anchor' : 'dashboard-anchor-optimizer';
              const el = document.getElementById(anchorId);
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              } else {
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }, 150);
          }
        };

        const toggleInclude = (globalIdx) => {
          const newHistory = [...history];
          newHistory[globalIdx].Include = !newHistory[globalIdx].Include;
          store.setSimsState('run_history', newHistory);
        };

        const deleteUnchecked = () => {
          const kept = history.filter(r => !currentViewTargets.includes(r.Target) || r.Include);
          store.setSimsState('run_history', kept);
        };

        const handleSynthesize = async () => {
          if (checkedRuns.length === 0) {
            alert("⚠️ You must have at least 1 visible run checked to synthesize!");
            return;
          }
          if (checkedRuns.length > 10) {
            alert("⚠️ Safety Limit Reached: Synthesizing creates dozens of permutations. Please select 10 or fewer builds.");
            return;
          }

          setIsSynthesizing(true);
          setSynthProgressPct(0);
          setSynthProgressMsg("Calculating center and generating permutations...");
          
          try {
            const runTargetMetric = checkedRuns[0].Target;
            const uniqueSelectedTargets = [...new Set(checkedRuns.map(r => r.Target))];
            if (uniqueSelectedTargets.length > 1) {
                console.warn(`🧬 Hybrid Build Detected: Combining builds optimized for different targets. Evaluating based on primary target: ${runTargetMetric}`);
            }

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

            const statKeys = activeStats;
            const candidatesMap = new Map();
            const originalBIds =[];

            // 1. Add original runs
            checkedRuns.forEach(r => {
                const dist = {};
                statKeys.forEach(s => dist[s] = r[s]);
                const bId = JSON.stringify(dist);
                if (!originalBIds.includes(bId)) originalBIds.push(bId);
                candidatesMap.set(bId, dist);
            });

            // 2. Add Average Build (Center)
            const avgDist = {};
            let sumAvg = 0;
            statKeys.forEach(s => {
                const avg = Math.round(checkedRuns.reduce((acc, r) => acc + r[s], 0) / checkedRuns.length);
                avgDist[s] = avg;
                sumAvg += avg;
            });
            const expectedSum = statKeys.reduce((acc, s) => acc + checkedRuns[0][s], 0);
            const diff = expectedSum - sumAvg;
            if (diff !== 0) {
                // Modulo aligner: Add remainder to the highest stat
                let maxStat = statKeys[0];
                statKeys.forEach(s => { if (avgDist[s] > avgDist[maxStat]) maxStat = s; });
                avgDist[maxStat] += diff;
            }
            const avgBId = JSON.stringify(avgDist);
            candidatesMap.set(avgBId, { ...avgDist });

            // 3. Smart Mutation (Radii generation)
            const baseDists = Array.from(candidatesMap.values());
            baseDists.forEach(baseDist => {
                const isAvg = JSON.stringify(baseDist) === avgBId;
                const radii = isAvg ?[1, 2] : [1];
                radii.forEach(radius => {
                    statKeys.forEach(sFrom => {
                        if (baseDist[sFrom] >= radius && lockedStats[sFrom] === undefined) {
                            statKeys.forEach(sTo => {
                                if (sFrom !== sTo && baseDist[sTo] <= STAT_CAPS[sTo] - radius && lockedStats[sTo] === undefined) {
                                    const neighbor = { ...baseDist };
                                    neighbor[sFrom] -= radius;
                                    neighbor[sTo] += radius;
                                    candidatesMap.set(JSON.stringify(neighbor), neighbor);
                                }
                            });
                        }
                    });
                });
            });

            const candidates = Array.from(candidatesMap.values());
            const totalR1Sims = candidates.length * 50;
            const estR2Count = Math.min(5, candidates.length) + originalBIds.length;
            const totalR2Sims = estR2Count * 450;
            const totalSims = totalR1Sims + totalR2Sims;

            setSynthProgressMsg(`Booting Engine Cores for ${totalSims.toLocaleString()} sims...`);
            const pool = new EngineWorkerPool();
            await pool.init(() => {}, (ready, total) => setSynthProgressMsg(`Booting Engine Cores: ${ready}/${total}`));
            await pool.syncState(baseStateDict);

            const buildRes = new Map();
            let completedSims = 0;
            let lastUpdate = Date.now();
            const synthStartTime = Date.now();

            // ===================================
            // TOURNAMENT ROUND 1: 50 sims each
            // ===================================
            const r1Promises =[];
            candidates.forEach(dist => {
                const bId = JSON.stringify(dist);
                if (!buildRes.has(bId)) buildRes.set(bId, { dist, sum_t: 0, sum_f: 0, floors:[], metricsSum: {} });
                
                for (let i = 0; i < 50; i++) {
                    const p = pool.runTask(dist).then(res => {
                        if (res.aborted) return;
                        const tr = buildRes.get(bId);
                        tr.sum_t += (res[runTargetMetric] || 0);
                        tr.sum_f += (res.highest_floor || 0);
                        tr.floors.push(res.highest_floor || 0);
                        
                        // FIX: Record advanced telemetry during Round 1 so chart averages are mathematically perfect
                        for (const[mk, mv] of Object.entries(res)) {
                            if (mk !== 'stamina_trace_floor' && mk !== 'stamina_trace_stamina' && mk !== 'total_time') {
                                tr.metricsSum[mk] = (tr.metricsSum[mk] || 0.0) + mv;
                            }
                        }
                        if (!tr.staminaTrace && res.stamina_trace_floor) {
                            tr.staminaTrace = { floor: res.stamina_trace_floor, stamina: res.stamina_trace_stamina };
                        }

                        completedSims++;
                        
                        const now = Date.now();
                        if (now - lastUpdate > 500 || completedSims === totalR1Sims) {
                            setSynthProgressMsg(`⚔️ Round 1/2: Testing ${candidates.length} builds (${completedSims}/${totalSims} sims)`);
                            setSynthProgressPct((completedSims / totalSims) * 100);
                            lastUpdate = now;
                        }
                    });
                    r1Promises.push(p);
                }
            });

            await Promise.all(r1Promises);

            // Sort Round 1
            const getCeilingScore = (floors, count=3) => {
                if (!floors || floors.length === 0) return 0;
                const sorted = [...floors].sort((a,b) => a - b);
                const top = sorted.slice(-count);
                return top.reduce((a,b)=>a+b,0) / top.length;
            };

            let sortedBIds = Array.from(buildRes.keys());
            if (runTargetMetric === "highest_floor") {
                sortedBIds.sort((a, b) => getCeilingScore(buildRes.get(b).floors, 3) - getCeilingScore(buildRes.get(a).floors, 3));
            } else {
                sortedBIds.sort((a, b) => buildRes.get(b).sum_t - buildRes.get(a).sum_t);
            }

            const top5Ids = sortedBIds.slice(0, 5);
            const r2Ids = [...new Set([...top5Ids, ...originalBIds])];

            // ===================================
            // TOURNAMENT ROUND 2: 450 sims for finalists
            // ===================================
            const r2Promises =[];
            r2Ids.forEach(bId => {
                const dist = buildRes.get(bId).dist;
                for (let i = 0; i < 450; i++) {
                    const p = pool.runTask(dist).then(res => {
                        if (res.aborted) return;
                        const tr = buildRes.get(bId);
                        tr.sum_t += (res[runTargetMetric] || 0);
                        tr.sum_f += (res.highest_floor || 0);
                        tr.floors.push(res.highest_floor || 0);
                        
                        for (const [mk, mv] of Object.entries(res)) {
                            if (mk !== 'stamina_trace_floor' && mk !== 'stamina_trace_stamina' && mk !== 'total_time') {
                                tr.metricsSum[mk] = (tr.metricsSum[mk] || 0.0) + mv;
                            }
                        }
                        if (!tr.staminaTrace && res.stamina_trace_floor) {
                            tr.staminaTrace = { floor: res.stamina_trace_floor, stamina: res.stamina_trace_stamina };
                        }

                        completedSims++;
                        const now = Date.now();
                        if (now - lastUpdate > 500 || completedSims === totalSims) {
                            setSynthProgressMsg(`⚔️ Round 2/2: Deep verifying ${r2Ids.length} finalists (${completedSims}/${totalSims} sims)`);
                            setSynthProgressPct((completedSims / totalSims) * 100);
                            lastUpdate = now;
                        }
                    });
                    r2Promises.push(p);
                }
            });

            await Promise.all(r2Promises);
            pool.terminate();

            const synthElapsed = (Date.now() - synthStartTime) / 1000;
            if (synthElapsed > 0) setSimsPerSec(Math.max(1, Math.floor(totalSims / synthElapsed)));

            // Sort Finalists
            let finalSortedIds = [...r2Ids];
            if (runTargetMetric === "highest_floor") {
                finalSortedIds.sort((a, b) => getCeilingScore(buildRes.get(b).floors, 5) - getCeilingScore(buildRes.get(a).floors, 5));
            } else {
                finalSortedIds.sort((a, b) => buildRes.get(b).sum_t - buildRes.get(a).sum_t);
            }

            const bestBId = finalSortedIds[0];
            const bestData = buildRes.get(bestBId);
            const finalMetaDist = bestData.dist;

            const absMax = bestData.floors.length ? Math.max(...bestData.floors) : 0;
            const avgF = bestData.sum_f / 500.0;
            const avgMetrics = {};
            for(const [mk, mv] of Object.entries(bestData.metricsSum)) avgMetrics[mk] = mv / 500.0;

            const synthSummary = {[runTargetMetric]: runTargetMetric === "highest_floor" ? absMax : bestData.sum_t / 500.0,
                avg_floor: avgF,
                abs_max_floor: absMax,
                abs_max_chance: bestData.floors.filter(f => f === absMax).length / 500.0,
                worst_val: 0,
                avg_val: avgF,
                runner_up_val: 0,
                floors: bestData.floors,
                avg_metrics: avgMetrics,
                stamina_trace: bestData.staminaTrace
            };

            const sameTargetRuns = checkedRuns.map(r => {
                const bId = JSON.stringify(statKeys.reduce((acc, s) => { acc[s] = r[s]; return acc; }, {}));
                if (runTargetMetric === "highest_floor") return getCeilingScore(buildRes.get(bId).floors, 5);
                else return buildRes.get(bId).sum_t / 500.0;
            });

            let metaScore, chartLabel;
            if (runTargetMetric === "highest_floor") {
                metaScore = getCeilingScore(bestData.floors, 5);
                chartLabel = "🏆 Theoretical Peak";
            } else {
                metaScore = bestData.sum_t / 500.0;
                chartLabel = "📈 Optimal Farm-Build";
            }

            const avgHistoryScore = sameTargetRuns.reduce((a,b)=>a+b,0) / (sameTargetRuns.length || 1);

            const chartLoot = {};
            Object.entries(FRAG_NAMES).forEach(([tier, name]) => {
                const k = `frag_${tier}_per_min`;
                if (avgMetrics[k] > 0) chartLoot[name] = avgMetrics[k];
            });

            const payload = {
                run_id: Date.now(),
                best_final: finalMetaDist,
                final_summary_out: synthSummary,
                elapsed: synthElapsed,
                time_limit_secs: 999, // Unlocked
                run_target_metric: runTargetMetric,
                worst_val: 0,
                avg_val: avgF,
                runner_up_val: 0,
                chart_hill_labels: [chartLabel, "🧬 Polished Meta-Build"],
                chart_hill_scores: [avgHistoryScore, metaScore],
                chart_hist: bestData.floors.reduce((acc, f) => { acc[f] = (acc[f] || 0) + 1; return acc; }, {}),
                chart_loot: chartLoot,
                show_loot: runTargetMetric !== 'highest_floor',
                show_wall: runTargetMetric === 'highest_floor'
            };

            const absMaxChance = synthSummary.abs_max_chance;
            let tempMaxSta = 1000;
            if (synthSummary.avg_metrics && synthSummary.avg_metrics.total_time) {
                tempMaxSta = synthSummary.avg_metrics.total_time;
            } else if (synthSummary.stamina_trace && synthSummary.stamina_trace.stamina.length > 0) {
                tempMaxSta = synthSummary.stamina_trace.stamina[0];
            }
            const archSecsCost = absMaxChance > 0 ? Math.ceil(1.0 / absMaxChance) * tempMaxSta : 0;

            const synthesisResult = {
                stats: finalMetaDist,
                meta_score: metaScore,
                history_scores: sameTargetRuns,
                metric_name: runTargetMetric,
                abs_max: absMax,
                abs_max_chance: absMaxChance,
                arch_secs_cost: archSecsCost
            };

            const synthEntry = {
                Profile: profileTag,
                Target: runTargetMetric,
                "Ceiling Score": metaScore,
                "Sources Data": checkedRuns,
                ...finalMetaDist
            };
            if (runTargetMetric === "highest_floor") {
                synthEntry["Theoretical Peak"] = absMax;
                synthEntry["Peak Probability"] = absMaxChance;
                synthEntry["Arch Secs Cost"] = archSecsCost;
            }
            synthEntry._restore_state = {
                synthesis_result: synthesisResult,
                opt_results: payload
            };

            store.setOptResults(payload);
            store.setSimsState('synthesis_result', synthesisResult);
            store.setSimsState('synth_history',[synthEntry, ...(store.synth_history || [])]);
            
            // Force the UI back to the default result tabs for the new run
            setResTab('build');
            setDataTab('performance');

            if (runTargetMetric.startsWith('block_')) {
                setCardSelBlock(runTargetMetric.replace('block_', '').replace('_per_min', ''));
            } else {
                setCardSelBlock('');
            }

            setTimeout(() => {
                const el = document.getElementById('synth-results-anchor');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 150);

          } catch (err) {
              console.error(err);
              alert("🚨 SYNTHESIS CRASH:\n" + err.message);
          } finally {
              setIsSynthesizing(false);
          }
        };

        return (
        <div className="space-y-6 animate-fade-in">
          <h2 className="text-2xl font-bold">🧬 Build Synthesis & History</h2>
          <p className="text-st-text-light">Because blocks only take whole hits, multiple different stat builds can tie for 1st place (a <strong>Stat Plateau</strong>). Use this tool to merge your best historical runs and calculate the absolute mathematical peak.</p>

          <details className="st-container group cursor-pointer marker:text-st-orange mb-6">
            <summary className="font-bold">🤓 Deep Dive: The Stat Plateau & RNG Tie-Breakers</summary>
            <div className="mt-4 text-sm space-y-2 cursor-default">
              <p>• <strong>The Math:</strong> If 50 Strength kills a block in exactly 3 hits, having 54 Strength <em>also</em> kills it in 3 hits. This creates a "Stat Plateau" where wildly different builds are mathematically identical.</p>
              <p>• <strong>The Tie-Breaker (RNG):</strong> To break the tie, the AI forces your selected builds to race 500 times. Whichever tied build happens to get slightly luckier with Critical Hits across a massive sample size wins the gold medal!</p>
              <p>• <strong>The Synthesis:</strong> The engine calculates the statistical center of your checked builds, generates nearby hybrid combinations, and runs the exhaustive 500-iteration tournament to find the true Meta-Build.</p>
              <p className="italic text-st-text-light mt-2">The Takeaway: If your stats bounce around slightly between 1-minute scout runs, congratulations—you've reached the absolute peak!</p>
            </div>
          </details>

          {history.length === 0 ? (
            <div className="st-container text-center text-st-text-light py-10">
              No simulation history available. Head over to the Optimizer tab and run a Monte Carlo simulation first!
            </div>
          ) : (
            <>
              {/* Filters & Actions */}
              <div className="flex flex-col md:flex-row gap-4 items-start">
                <div className="w-full md:w-2/3">
                  <label className="block text-sm font-bold mb-1">🔍 Filter visible runs by optimization target:</label>
                  <select 
                    multiple
                    value={currentViewTargets}
                    onChange={(e) => setViewTargets(Array.from(e.target.selectedOptions, option => option.value))}
                    className="w-full bg-st-bg border border-st-border rounded p-2 text-st-text focus:border-st-orange focus:outline-none"
                    style={{ height: '80px' }}
                  >
                    {uniqueTargets.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <div className="text-xs text-st-text-light mt-1">Hold Ctrl/Cmd to select multiple</div>
                </div>
                <div className="w-full md:w-1/3 mt-0 md:mt-[28px]">
                  <button 
                    onClick={() => {
                      const newHistory = [...history];
                      visibleHistory.forEach(r => { newHistory[r._global_idx].Include = !r.Include; });
                      store.setSimsState('run_history', newHistory);
                    }}
                    className="w-full py-2 bg-st-secondary border border-st-border text-st-text font-bold rounded hover:border-st-orange transition-colors"
                  >
                    ☑️ Toggle All Visible
                  </button>
                </div>
              </div>

              {/* Tournament Controls */}
              <div className="st-container">
                <h4 className="text-lg font-bold mb-2">🏆 Run Tie-Breaker Tournament</h4>
                <p className="text-sm text-st-text-light mb-4">Once you have checked the <strong>Include</strong> box for a few of your top runs (we recommend 2 to 5) in the history table below, click Synthesize to merge them.</p>
                <div className="flex flex-col md:flex-row gap-4">
                  {!isAnyRunning ? (
                    <button 
                      onClick={handleSynthesize}
                      className="flex-1 py-3 bg-st-orange text-[#2b2b2b] font-bold rounded-lg shadow hover:bg-[#ffb045] transition-colors"
                    >
                      🧬 Synthesize Ultimate Meta-Build
                    </button>
                  ) : isSynthesizing ? (
                    <div className="flex-1 p-2 border border-st-border rounded bg-st-bg">
                      <div className="flex justify-between text-sm font-bold mb-1 text-st-orange">
                        <span>{synthProgressMsg}</span>
                        <span>{Math.floor(synthProgressPct)}%</span>
                      </div>
                      <div className="w-full bg-[#1e1e1e] rounded-full h-3 overflow-hidden border border-st-border">
                        <div className="bg-st-orange h-3 transition-all duration-300" style={{ width: `${synthProgressPct}%` }}></div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 py-3 bg-st-secondary text-st-text-light text-center font-bold rounded-lg shadow cursor-not-allowed">
                      ⏳ Wait for active background task to finish...
                    </div>
                  )}
                  <button
                    onClick={deleteUnchecked}
                    className="flex-1 py-3 bg-[#2b2b2b] border border-red-900 text-red-400 font-bold rounded-lg hover:bg-red-900 hover:text-white transition-colors"
                  >
                    🗑️ Delete Unchecked Runs
                  </button>
                </div>
              </div>

              {/* History Table */}
              <div>
                <h4 className="text-lg font-bold mb-1">📋 Run History Table</h4>
                <div className="flex flex-col md:flex-row gap-4 items-center justify-between mb-4">
                  <p className="text-sm text-st-text-light m-0">Check the boxes for your top runs to mix them into your Meta-Build.</p>
                  <button 
                    onClick={() => handleRestore(checkedRuns[0], false)}
                    disabled={checkedRuns.length !== 1}
                    className="px-6 py-2 bg-[#2b2b2b] border border-st-orange text-st-orange font-bold rounded hover:bg-st-orange hover:text-[#2b2b2b] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title={checkedRuns.length !== 1 ? "Check exactly ONE run to view its dashboard" : ""}
                  >
                    📊 View Dashboard for Checked Run
                  </button>
                </div>

                <div className="overflow-x-auto border border-st-border rounded bg-st-bg">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-st-border bg-black/10">
                        <th className="p-3 w-10 text-center">Incl.</th>
                        <th className="p-3">Profile</th>
                        <th className="p-3">Target</th>
                        <th className="p-3">Score / Yield</th>
                        <th className="p-3">Avg Floor</th>
                        <th className="p-3">Max Floor</th>
                        {activeStats.map(s => <th key={s} className="p-3">{s}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleHistory.length === 0 ? (
                        <tr><td colSpan="12" className="p-4 text-center text-st-text-light">No runs match current filter.</td></tr>
                      ) : visibleHistory.map((r) => {
                        const isFloor = r.Target === 'highest_floor';
                        const score = isFloor ? r['Metric Score'] : ((r['Metric Score'] / 60.0) * 1000.0).toFixed(1);
                        
                        return (
                          <tr key={r._global_idx} className="border-b border-st-border/50 hover:bg-black/5 transition-colors">
                            <td className="p-3 text-center">
                              <input 
                                type="checkbox" 
                                checked={r.Include || false} 
                                onChange={() => toggleInclude(r._global_idx)}
                                className="accent-st-orange w-4 h-4 cursor-pointer"
                              />
                            </td>
                            <td className="p-3 font-bold text-xs truncate max-w-[100px]" title={r.Profile || 'Legacy'}>{r.Profile || 'Legacy'}</td>
                            <td className="p-3 font-mono text-xs">{r.Target.replace('_per_min', '')}</td>
                            <td className="p-3 font-bold text-st-orange">{score}</td>
                            <td className="p-3">{r['Avg Floor'].toFixed(1)}</td>
                            <td className="p-3">{r['Max Floor']}</td>
                            {activeStats.map(s => <td key={s} className="p-3 text-st-text-light">{r[s] !== undefined ? r[s] : '-'}</td>)}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* =========================================
                  SYNTHESIS RESULTS DASHBOARD
              ========================================= */}
              <div id="synth-results-anchor" className="mt-8"></div>
              
              {store.synthesis_result && !isOptimizing && (() => {
                const sr = store.synthesis_result;
                const isFloorTarget = sr.metric_name === 'highest_floor';
                const scaleScore = (v) => isFloorTarget ? v : (v / 60.0) * 1000.0;
                
                const chartLabels = sr.history_scores.map((_, i) => `Run ${i + 1}`).concat(["🧬 Meta-Build"]);
                const chartScores = sr.history_scores.map(s => scaleScore(s)).concat([scaleScore(sr.meta_score)]);
                const chartColors = sr.history_scores.map(() => "#6495ED").concat(["#4CAF50"]);

                return (
                  <div className="animate-fade-in space-y-6">
                    <div className="st-container">
                      <h4 className="text-xl font-bold mb-2">📊 Synthesis Performance Proof</h4>
                      <p className="text-sm text-st-text-light mb-4">How the optimized Meta-Build compares to the individual historical runs you selected. <em>(Note: To ensure a mathematically fair comparison, your historical runs were re-evaluated alongside the new combinations using the same 500-simulation baseline to remove RNG variance).</em></p>
                      
                      <div className="w-full h-[300px] border border-st-border rounded bg-st-bg p-2">
                        <Plot
                          data={[ {
                            x: chartLabels,
                            y: chartScores,
                            type: 'bar',
                            marker: { color: chartColors },
                            text: chartScores.map(v => v.toFixed(2)),
                            textposition: 'outside'
                          } ]}
                          layout={{
                            font: { color: store.theme === 'dark' ? '#FAFAFA' : '#31333F' },
                            paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
                            margin: { t: 20, b: 40, l: 40, r: 20 }
                          }}
                          useResizeHandler={true} style={{ width: '100%', height: '100%' }} config={{ displayModeBar: false }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })()}

              {store.opt_results && store.synthesis_result && !isOptimizing && renderResultsDashboard('synthesizer')}

              <hr className="border-st-border my-8" />

              {/* Meta-Build History Log */}
              {store.synth_history && store.synth_history.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-xl font-bold">📚 Meta-Build History Log</h3>
                  <p className="text-sm text-st-text-light mb-4">A permanent record of your optimized Meta-Builds.</p>
                  
                  {store.synth_history.map((synth, idx) => {
                    const isFloorTarget = synth.Target === 'highest_floor';
                    const dispScore = isFloorTarget ? synth['Ceiling Score'] : ((synth['Ceiling Score'] / 60.0) * 1000.0).toFixed(1);
                    
                    return (
                      <div key={idx} className="st-container space-y-3">
                        <div className="font-bold text-lg text-st-orange">
                          🧬 Meta-Build | Profile: `{synth.Profile || 'Legacy'}` | Target: `{synth.Target}` | Ceiling: `{dispScore}`
                          {!isFloorTarget && " (per 1k Arch Secs)"}
                          {synth['Theoretical Peak'] && ` | Peak: ${synth['Theoretical Peak']}`}
                        </div>
                        
                        <div className="bg-st-secondary p-2 rounded text-sm font-mono border border-st-border">
                          {activeStats.map(s => `${s}: ${synth[s] !== undefined ? synth[s] : '-'}`).join('  |  ')}
                        </div>

                        {synth['Peak Probability'] > 0 && (
                          <div className="text-xs text-st-text-light italic">
                            🎲 Reality Check: Floor {synth['Theoretical Peak']} hit in {(synth['Peak Probability']*100).toFixed(1)}% of sims. Requires avg {Math.ceil(1/synth['Peak Probability'])} runs (~{(synth['Arch Secs Cost']/1000).toFixed(1)}k Arch Secs) to replicate.
                          </div>
                        )}

                        <div className="flex flex-col md:flex-row gap-2 mt-3">
                          <button 
                            onClick={() => handleRestore(synth, true)}
                            className="flex-1 py-1 bg-st-orange text-[#2b2b2b] font-bold rounded hover:bg-[#ffb045] transition-colors text-sm"
                          >
                            📊 View Dashboard
                          </button>
                          <button 
                            onClick={() => {
                              const kept = [...store.synth_history];
                              kept.splice(idx, 1);
                              store.setSimsState('synth_history', kept);
                              if (store.synthesis_result && store.synthesis_result.stats === synth) {
                                store.setSimsState('synthesis_result', null);
                              }
                            }}
                            className="flex-1 py-1 bg-[#2b2b2b] border border-red-900 text-red-400 font-bold rounded hover:bg-red-900 hover:text-white transition-colors text-sm"
                          >
                            🗑️ Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
        );
      })()}

      {/* =========================================
          TAB: SANDBOX
      ========================================= */}
      {activeSubTab === 'sandbox' && (
        <div className="space-y-6 animate-fade-in">
          <h2 className="text-2xl font-bold">🧪 Block Hit Sandbox</h2>
          <div className="text-sm text-st-text-light">
            <p>💡 <strong>What is a Breakpoint?</strong></p>
            <p>A breakpoint is the exact stat number required to reduce the hits needed to break a block (e.g., dropping from 3 hits down to 2). Because blocks can only take whole hits, any stat points you spend that <em>don't</em> push you past the next breakpoint are mathematically wasted!</p>
          </div>

          <details className="st-container group cursor-pointer marker:text-st-orange mb-6">
            <summary className="font-bold">📚 Math & Formulas Breakdown (Click to expand)</summary>
            <div className="mt-4 text-sm space-y-2 cursor-default font-mono">
              <p><strong>Legend:</strong> P[x] = Probability of x | M[x] = Multiplier of x</p>
              <p><strong>Formulas:</strong></p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Armor = (Base Armor) - (Armor Pen)</li>
                <li>Regular Hit = (Damage - Armor)</li>
                <li>Crit Hit = (Damage - Armor) × M[Crit]</li>
                <li>Super Crit Hit = (Damage - Armor) × M[Crit] × M[sCrit]</li>
                <li>Ultra Crit Hit = (Damage - Armor) × M[Crit] × M[sCrit] × M[uCrit]</li>
              </ul>
              <p className="mt-3 text-st-orange font-bold">Expected Damage Per Swing (EDPS):</p>
              <p>EDPS = (P[Reg]×1.0 + P[Crit]×M[Crit] + P[sCrit]×M[sCrit] + P[uCrit]×M[uCrit]) × (Damage - Armor)</p>
            </div>
          </details>

          <hr className="border-st-border" />

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* LEFT PANEL: CONTROLS */}
            <div className="lg:col-span-1 space-y-6">
              <div className="st-container bg-black/10">
                <div className="flex gap-2 mb-6">
                  <button 
                    onClick={() => {
                      activeStats.forEach(s => store.setSandboxStat(s, store.base_stats[s] || 0));
                    }}
                    className="flex-1 py-2 bg-st-secondary border border-st-border text-xs font-bold rounded hover:border-st-orange transition-colors"
                  >
                    🔄 Pull Global Stats
                  </button>
                  <button 
                    onClick={() => {
                      const sbTotal = activeStats.reduce((acc, s) => acc + (store.sandbox_stats[s] || 0), 0);
                      if (sbTotal > totalAllowed) {
                        alert(`❌ Cannot push: Sandbox uses ${sbTotal} points but budget is ${totalAllowed}!`);
                        return;
                      }
                      activeStats.forEach(s => store.setBaseStat(s, store.sandbox_stats[s] || 0));
                      alert("✅ Sandbox stats pushed to Global UI!");
                    }}
                    className="flex-1 py-2 bg-st-secondary border border-st-border text-xs font-bold rounded hover:border-st-orange transition-colors"
                  >
                    📤 Push to Global
                  </button>
                </div>
                
                {/* NEW BASELINE BUTTONS */}
                <div className="flex gap-2 mb-2">
                  <button 
                    onClick={() => setSandboxBaseline(sbData, store.sandbox_stats)}
                    disabled={!sbData}
                    className="flex-1 py-2 bg-[#2b2b2b] border border-st-orange text-st-orange text-xs font-bold rounded hover:bg-st-orange hover:text-[#2b2b2b] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    🔒 Lock Baseline
                  </button>
                  {sandbox_baseline && (
                    <button 
                      onClick={() => {
                        if (sandbox_baseline_stats) store.setSandboxStats(sandbox_baseline_stats);
                      }}
                      className="flex-1 py-2 bg-[#2b2b2b] border border-blue-500 text-blue-400 text-xs font-bold rounded hover:bg-blue-900 hover:text-white transition-colors"
                    >
                      ⏪ Restore
                    </button>
                  )}
                  {sandbox_baseline && (
                    <button 
                      onClick={() => setSandboxBaseline(null, null)}
                      className="flex-1 py-2 bg-st-secondary border border-red-900 text-red-400 text-xs font-bold rounded hover:bg-red-900 hover:text-white transition-colors"
                    >
                      🔓 Clear
                    </button>
                  )}
                </div>
                <div className="text-xs text-st-text-light mb-6 leading-tight">
                  Take a snapshot of the current table. Tweak your stats below to instantly see exactly how much damage you gain or lose!
                </div>

                <h4 className="font-bold mb-4">Sandbox Stats</h4>
                <div className="grid grid-cols-2 gap-3 mb-6">
                  {activeStats.map(stat => (
                    <div key={stat} className="st-container flex flex-col items-center bg-st-bg p-2">
                      <div className="text-center mb-1">
                        <span className="font-bold text-xs">{stat}</span><br/>
                        <span className="text-[10px] text-st-text-light">(Max: {MAX_STAT_CAPS[stat]})</span>
                      </div>
                      <img 
                        src={`/assets/stats_small/${stat.toLowerCase()}.png`} 
                        onError={(e) => { e.target.onerror = null; e.target.src = `/assets/stats/${stat.toLowerCase()}.png` }}
                        alt={stat} 
                        className="h-6 w-6 pixelated mb-2"
                      />
                      <input
                        type="number"
                        min="0"
                        max={MAX_STAT_CAPS[stat]}
                        value={store.sandbox_stats[stat] !== undefined ? store.sandbox_stats[stat] : 0}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => store.setSandboxStat(stat, e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0))}
                        onBlur={(e) => {
                          let parsed = parseInt(e.target.value) || 0;
                          if (parsed > MAX_STAT_CAPS[stat]) parsed = MAX_STAT_CAPS[stat];
                          if (parsed < 0) parsed = 0;
                          store.setSandboxStat(stat, parsed);
                        }}
                        className="st-input p-1 text-sm h-8"
                      />
                      <div className="flex flex-wrap justify-center gap-1 mt-2 w-full">
                        <button onClick={() => store.setSandboxStat(stat, Math.max(0, (store.sandbox_stats[stat] || 0) - 5))} className="flex-1 px-1 py-1 text-[10px] bg-st-secondary text-st-text rounded border border-st-border hover:border-st-orange transition-colors">-5</button>
                        <button onClick={() => store.setSandboxStat(stat, Math.min(MAX_STAT_CAPS[stat], (store.sandbox_stats[stat] || 0) + 5))} className="flex-1 px-1 py-1 text-[10px] bg-st-secondary text-st-text rounded border border-st-border hover:border-st-orange transition-colors">+5</button>
                        <button onClick={() => store.setSandboxStat(stat, MAX_STAT_CAPS[stat])} className="flex-1 px-1 py-1 text-[10px] font-bold bg-st-secondary text-st-text rounded border border-st-border hover:border-st-orange transition-colors">Max</button>
                      </div>
                    </div>
                  ))}
                </div>

                <hr className="border-st-border mb-4" />
                <h4 className="font-bold mb-4">Settings</h4>
                
                <div className="space-y-4 text-sm">
                 <div>
                    <label className="block mb-1">Target Floor:</label>
                    <input 
                      type="number"
                      value={store.sandbox_floor ?? store.current_max_floor}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => store.setSimsState('sandbox_floor', e.target.value === '' ? '' : parseInt(e.target.value))}
                      onBlur={(e) => store.setSimsState('sandbox_floor', Math.max(1, parseInt(e.target.value) || 1))}
                      className="st-input h-8" 
                    />
                  </div>
                  <div>
                    <label className="block mb-1">Min Avg Hits to Kill:</label>
                    <input 
                      type="number"
                      value={sandboxMinHits}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setSandboxMinHits(e.target.value === '' ? '' : parseInt(e.target.value))}
                      onBlur={(e) => setSandboxMinHits(Math.max(1, parseInt(e.target.value) || 1))}
                      className="st-input h-8" 
                    />
                  </div>
                  <label className="flex items-center space-x-2 cursor-pointer mt-2">
                    <input 
                      type="checkbox" 
                      checked={sandboxShowUnreachable}
                      onChange={() => setSandboxShowUnreachable(!sandboxShowUnreachable)}
                      className="accent-st-orange w-4 h-4"
                    />
                    <span>Show Unreachable Blocks</span>
                  </label>
                </div>
              </div>
            </div>

            {/* RIGHT PANEL: DATA TABLE */}
            <div className="lg:col-span-3">
              <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-end mb-4">
                <div className="w-full md:w-1/2">
                  <label className="block font-bold mb-1">🎯 Target Breakpoints</label>
                  <select 
                    multiple
                    value={sandboxBlockFilters}
                    onChange={(e) => setSandboxBlockFilters(Array.from(e.target.selectedOptions, o => o.value))}
                    className="w-full bg-st-bg border border-st-border rounded p-2 text-st-text focus:border-st-orange focus:outline-none h-[80px]"
                  >
                    {uniqueBlockNames.map(name => <option key={name} value={name}>{name}</option>)}
                  </select>
                </div>
                
                <div className="w-full md:w-1/2 flex flex-col items-start md:items-end space-y-3">
                  <div className="text-xs text-st-text-light text-left md:text-right">
                    <div><strong>Avg Hits:</strong> Number of hits to destroy the block based on EDPS (Average Damage over time).</div>
                    <div><strong>Max Hits:</strong> Number of hits to destroy the block based purely on Regular (Non-Crit) damage.</div>
                  </div>
                  <label className="flex items-center justify-center w-full md:w-auto space-x-2 cursor-pointer bg-st-secondary px-3 py-2 border border-st-border rounded hover:border-st-orange transition-colors text-sm">
                    <input 
                      type="checkbox" 
                      checked={sandboxShowCrits}
                      onChange={() => setSandboxShowCrits(!sandboxShowCrits)}
                      className="accent-st-orange w-4 h-4"
                    />
                    <span className="font-bold">🔍 Show Detailed Crits</span>
                  </label>
                </div>
              </div>

              <div 
                className={`border border-st-border rounded bg-st-bg h-[600px] w-full outline-none ${store.theme === 'dark' ? 'ag-theme-quartz-dark' : 'ag-theme-quartz'}`}
                tabIndex={-1}
                onMouseEnter={(e) => {
                  // Silently focus the table so the mouse wheel works instantly without clicking!
                  if (!e.currentTarget.contains(document.activeElement)) {
                    e.currentTarget.focus();
                  }
                }}
              >
                <style>{`
                  /* ☢️ ABSOLUTE NUCLEAR OPTION: Target AG Grid's structural DOM elements directly */
                  .ag-theme-quartz, .ag-theme-quartz-dark {
                    --ag-background-color: ${store.theme === 'dark' ? '#0E1117' : '#FFFFFF'} !important;
                    --ag-foreground-color: ${store.theme === 'dark' ? '#FAFAFA' : '#31333F'} !important;
                    --ag-header-background-color: ${store.theme === 'dark' ? '#262730' : '#F0F2F6'} !important;
                    --ag-header-foreground-color: ${store.theme === 'dark' ? '#FAFAFA' : '#31333F'} !important;
                    --ag-border-color: ${store.theme === 'dark' ? 'rgba(250, 250, 250, 0.15)' : 'rgba(49, 51, 63, 0.15)'} !important;
                  }

                  /* 1. Fix the empty right-side background & global wrapper */
                  .ag-theme-quartz .ag-root-wrapper,
                  .ag-theme-quartz-dark .ag-root-wrapper,
                  .ag-theme-quartz .ag-body-viewport,
                  .ag-theme-quartz-dark .ag-body-viewport {
                    background-color: ${store.theme === 'dark' ? '#0E1117' : '#FFFFFF'} !important;
                  }

                  /* 2. Fix the Headers (White with black text issue) */
                  .ag-theme-quartz .ag-header,
                  .ag-theme-quartz-dark .ag-header {
                    background-color: ${store.theme === 'dark' ? '#262730' : '#F0F2F6'} !important;
                    color: ${store.theme === 'dark' ? '#FAFAFA' : '#31333F'} !important;
                    border-bottom: 1px solid ${store.theme === 'dark' ? 'rgba(250, 250, 250, 0.15)' : 'rgba(49, 51, 63, 0.15)'} !important;
                  }

                  /* 3. Fix the Rows */
                  .ag-theme-quartz .ag-row,
                  .ag-theme-quartz-dark .ag-row {
                    background-color: ${store.theme === 'dark' ? '#0E1117' : '#FFFFFF'} !important;
                    color: ${store.theme === 'dark' ? '#FAFAFA' : '#31333F'} !important;
                    border-bottom: 1px solid ${store.theme === 'dark' ? 'rgba(250, 250, 250, 0.1)' : 'rgba(49, 51, 63, 0.1)'} !important;
                  }
                  .ag-theme-quartz .ag-row:hover,
                  .ag-theme-quartz-dark .ag-row:hover {
                    background-color: ${store.theme === 'dark' ? '#262730' : '#F0F2F6'} !important;
                  }

                  /* 4. Fix the Dashed Vertical Lines & Centering */
                  .ag-theme-quartz .ag-header-cell, .ag-theme-quartz .ag-cell,
                  .ag-theme-quartz-dark .ag-header-cell, .ag-theme-quartz-dark .ag-cell {
                    border-right: 1px solid ${store.theme === 'dark' ? 'rgba(250, 250, 250, 0.15)' : 'rgba(49, 51, 63, 0.15)'} !important;
                    border-left: none !important; /* Prevents overlapping dashed effect */
                  }

                  /* Force Headers to Center */
                  .ag-theme-quartz .ag-header-cell-label,
                  .ag-theme-quartz-dark .ag-header-cell-label {
                    justify-content: center !important;
                    color: ${store.theme === 'dark' ? '#FAFAFA' : '#31333F'} !important;
                  }
                  /* Force Cells to Center */
                  .ag-theme-quartz .ag-cell,
                  .ag-theme-quartz-dark .ag-cell {
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    text-align: center !important;
                  }
                `}</style>
                
                {!sbData ? (
                  <div className="flex items-center justify-center h-full text-st-text-light">Calculating sandbox math...</div>
                ) : (
                  <AgGridReact
                    theme="legacy"
                    rowData={sandboxBlocks}
                    defaultColDef={sandboxDefaultColDef}
                    autoSizeStrategy={sandboxAutoSizeStrategy}
                    columnDefs={sandboxColumns}
                    onFirstDataRendered={(p) => { try { p.api.autoSizeColumns(p.api.getColumns().map(c => c.getColId())); } catch(e){} }}
                    onRowDataUpdated={(p) => { try { p.api.autoSizeColumns(p.api.getColumns().map(c => c.getColId())); } catch(e){} }}
                    onNewColumnsLoaded={(p) => { try { p.api.autoSizeColumns(p.api.getColumns().map(c => c.getColId())); } catch(e){} }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}