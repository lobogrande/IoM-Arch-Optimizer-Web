// src/components/simulations/SynthesisTab.jsx
import { useState, useMemo, useRef } from 'react';
import useStore from '../../store';
import { EngineWorkerPool } from '../../utils/optimizer';
import ResultsDashboard from './ResultsDashboard';
import PlotWrapper from 'react-plotly.js';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';

ModuleRegistry.registerModules([ AllCommunityModule ]);

const Plot = PlotWrapper.default || PlotWrapper;

const FRAG_NAMES = {
  0: "Dirt", 1: "Common", 2: "Rare", 3: "Epic", 4: "Legendary", 5: "Mythic", 6: "Divine"
};

export default function SynthesisTab() {
  const store = useStore();
  const synthGridRef = useRef(null);

  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [synthProgressMsg, setSynthProgressMsg] = useState("");
  const[synthProgressPct, setSynthProgressPct] = useState(0);
  const[viewTargets, setViewTargets] = useState(null);

  const simsPerSec = store.simsPerSec || 15;
  const setSimsPerSec = (v) => store.setSimsState('simsPerSec', v);

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

  const lockedStats = store.lockedStats || {};

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

  const getProfileDisplayName = (r) => {
    if (r.ProfileId) {
      const p = store.profiles?.find(x => x.id === r.ProfileId);
      const baseName = p ? p.name : (r.ProfileName || "Deleted");
      return baseName + (r.IsModified ? " *" : "");
    }
    if (r.Profile && r.Profile !== 'Guest' && r.Profile !== 'Legacy') {
      const cleanName = r.Profile.replace(' *', '');
      const isMod = r.Profile.endsWith(' *');
      const p = store.profiles?.find(x => x.name === cleanName);
      if (p) return p.name + (isMod ? " *" : "");
    }
    return r.Profile || 'Legacy';
  };

  const handleRestore = (runData, isMetaBuild = false) => {
    if (runData._restore_state) {
      if (runData._restore_state.opt_results) {
          store.setOptResults(runData._restore_state.opt_results);
          store.setSimsState('synthesis_result', runData._restore_state.synthesis_result);
      } else {
          store.setOptResults(runData._restore_state);
          store.setSimsState('synthesis_result', null);
      }
      
      store.setSimActiveSubTab(isMetaBuild ? 'synth' : 'optimizer');
      store.setSimResTab('build');
      store.setSimDataTab('performance');

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

  const synthHistoryColumns = useMemo(() => {
    const cols =[
      { headerName: "Profile", valueGetter: (p) => getProfileDisplayName(p.data), minWidth: 150, pinned: "left" },
      {
        headerName: "Date",
        valueGetter: (p) => p.data.Timestamp || (p.data._restore_state?.opt_results?.run_id) || 0,
        valueFormatter: (p) => p.value ? new Date(p.value).toLocaleString(undefined, { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '-',
        filterValueGetter: (p) => {
          const val = p.data.Timestamp || (p.data._restore_state?.opt_results?.run_id) || 0;
          return val ? new Date(val).toLocaleString(undefined, { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '-';
        },
        filter: 'agTextColumnFilter', minWidth: 150, sortable: true
      },
      { field: "Target", headerName: "Target", valueFormatter: p => p.value ? p.value.replace('_per_min', '') : '', minWidth: 120 },
      { 
        field: "Ceiling Score", headerName: "Ceiling Score",
        valueFormatter: p => {
          if (p.value === undefined || p.value === null) return "0";
          const isFloor = p.data.Target === 'highest_floor';
          return isFloor ? p.value.toFixed(2) : ((p.value / 60.0) * 1000.0).toFixed(1);
        },
        filter: 'agNumberColumnFilter', cellStyle: { color: '#ffa229', fontWeight: 'bold' }
      },
      { field: "Theoretical Peak", headerName: "Peak Flr", valueFormatter: p => p.value ? p.value : '-', filter: 'agNumberColumnFilter', width: 100 }
    ];

    const tableStats = [ ...activeStats ];
    if (store.synth_history && store.synth_history.some(r => r.Unassigned !== undefined)) {
      tableStats.push('Unassigned');
    }

    tableStats.forEach(s => {
      cols.push({
        field: s, headerName: s === 'Unassigned' ? 'Unspent' : s, width: 90, filter: 'agNumberColumnFilter',
        cellStyle: s === 'Unassigned' ? { color: '#ffa229', fontWeight: 'bold' } : { }
      });
    });

    cols.push({
        headerName: "Actions", flex: 1, suppressAutoSize: true, minWidth: 140, sortable: false, filter: false,
        cellRenderer: (p) => {
        return (
          <div className="flex gap-2 items-center justify-center h-full">
            <button onClick={() => handleRestore(p.data, true)} className="px-2 py-1 bg-st-orange text-[#2b2b2b] font-bold text-xs rounded hover:bg-[#ffb045] transition-colors">📊 View</button>
            <button 
              onClick={() => {
                const kept = [ ...store.synth_history ];
                const idx = kept.indexOf(p.data);
                if (idx > -1) {
                  kept.splice(idx, 1);
                  store.setSimsState('synth_history', kept);
                  if (store.synthesis_result && store.synthesis_result.stats === p.data) {
                    store.setSimsState('synthesis_result', null);
                  }
                }
              }}
              className="px-2 py-1 bg-[#2b2b2b] border border-red-900 text-red-400 font-bold text-xs rounded hover:bg-red-900 hover:text-white transition-colors"
            >🗑️ Del</button>
          </div>
        );
      }
    });

    return cols;
  }, [ activeStats, store.synth_history, store.synthesis_result ]);

  const history = store.run_history || [];
  const uniqueTargets =[...new Set(history.map(r => r.Target))];
  const lastTgt = store.opt_results?.run_target_metric;
  const currentViewTargets = viewTargets !== null ? viewTargets : (lastTgt && uniqueTargets.includes(lastTgt) ? [lastTgt] : uniqueTargets);
  const visibleHistory = history.map((r, idx) => ({ ...r, _global_idx: idx })).filter(r => currentViewTargets.includes(r.Target));
  const checkedRuns = visibleHistory.filter(r => r.Include);

  const toggleInclude = (globalIdx) => {
    const newHistory =[...history];
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
      const uniqueSelectedTargets =[...new Set(checkedRuns.map(r => r.Target))];
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

      const statKeys = [...activeStats];
      if (checkedRuns.some(r => r.Unassigned !== undefined)) {
          statKeys.push('Unassigned');
      }
      const candidatesMap = new Map();
      const originalBIds =[];

      checkedRuns.forEach(r => {
          const dist = {};
          statKeys.forEach(s => dist[s] = r[s]);
          const bId = JSON.stringify(dist);
          if (!originalBIds.includes(bId)) originalBIds.push(bId);
          candidatesMap.set(bId, dist);
      });

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
          let maxStat = statKeys[0];
          statKeys.forEach(s => { if (avgDist[s] > avgDist[maxStat]) maxStat = s; });
          avgDist[maxStat] += diff;
      }
      const avgBId = JSON.stringify(avgDist);
      candidatesMap.set(avgBId, { ...avgDist });

      const getBounds = (s) => {
         const lock = lockedStats[s];
         if (!lock) return [0, STAT_CAPS[s]];
         if (typeof lock === 'number') return[lock, lock];
         if (lock.type === 'exact') return [lock.val, lock.val];
         if (lock.type === 'min') return [lock.val, STAT_CAPS[s]];
         if (lock.type === 'max') return [0, lock.val];
         if (lock.type === 'range') return [lock.min, lock.max];
         return[0, STAT_CAPS[s]];
      };

      const baseDists = Array.from(candidatesMap.values());
      baseDists.forEach(baseDist => {
          const isAvg = JSON.stringify(baseDist) === avgBId;
          const radii = isAvg ? [1, 2] : [1];
          radii.forEach(radius => {
              statKeys.forEach(sFrom => {
                  const boundsFrom = getBounds(sFrom);
                  if (baseDist[sFrom] - radius >= boundsFrom[0] && boundsFrom[0] !== boundsFrom[1]) {
                      statKeys.forEach(sTo => {
                          const boundsTo = getBounds(sTo);
                          if (sFrom !== sTo && baseDist[sTo] + radius <= boundsTo[1] && boundsTo[0] !== boundsTo[1]) {
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

      setSynthProgressMsg(`Booting Cores for ${totalSims.toLocaleString()} sims...`);
      const pool = new EngineWorkerPool();
      await pool.init(() => {}, (ready, total) => setSynthProgressMsg(`Booting Cores: ${ready}/${total}`));
      await pool.syncState(baseStateDict);

      const buildRes = new Map();
      let completedSims = 0;
      let lastUpdate = Date.now();
      const synthStartTime = Date.now();

      const r1Promises =[];
      candidates.forEach(dist => {
          const bId = JSON.stringify(dist);
          if (!buildRes.has(bId)) buildRes.set(bId, { dist, sum_t: 0, sum_f: 0, floors:[], metricsSum: {}, traces: {} });
          
          for (let i = 0; i < 50; i++) {
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
                  if (res.highest_floor && res.stamina_trace_floor && !tr.traces[res.highest_floor]) {
                      tr.traces[res.highest_floor] = { floor: res.stamina_trace_floor, stamina: res.stamina_trace_stamina };
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
                  if (res.highest_floor && res.stamina_trace_floor && !tr.traces[res.highest_floor]) {
                      tr.traces[res.highest_floor] = { floor: res.stamina_trace_floor, stamina: res.stamina_trace_stamina };
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

      const allSynthScores = r2Ids.map(bId => {
          if (runTargetMetric === "highest_floor") return getCeilingScore(buildRes.get(bId).floors, 5);
          else return buildRes.get(bId).sum_t / 500.0;
      }).sort((a, b) => b - a);

      const synthWorst = allSynthScores.length > 0 ? allSynthScores[allSynthScores.length - 1] : 0;
      const synthAvg = allSynthScores.length > 0 ? allSynthScores.reduce((a,b)=>a+b,0) / allSynthScores.length : 0;
      const synthRunnerUp = allSynthScores.length > 1 ? allSynthScores[1] : (allSynthScores.length > 0 ? allSynthScores[0] : 0);

      const sortedFloors = [...bestData.floors].sort((a,b) => a - b);
      const medianFloor = sortedFloors[Math.floor(sortedFloors.length / 2)];
      
      const synthSummary = { [runTargetMetric]: runTargetMetric === "highest_floor" ? absMax : bestData.sum_t / 500.0,
          avg_floor: avgF,
          abs_max_floor: absMax,
          abs_max_chance: bestData.floors.filter(f => f === absMax).length / 500.0,
          worst_val: synthWorst,
          avg_val: synthAvg,
          runner_up_val: synthRunnerUp,
          floors: bestData.floors,
          avg_metrics: avgMetrics,
          stamina_trace_max: bestData.traces[absMax] || null,
          stamina_trace_median: bestData.traces[medianFloor] || null,
          stamina_trace: bestData.traces[medianFloor] || null
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
          time_limit_secs: 999,
          run_target_metric: runTargetMetric,
          worst_val: synthWorst,
          avg_val: synthAvg,
          runner_up_val: synthRunnerUp,
          chart_hill_labels:[chartLabel, "🧬 Polished Meta-Build"],
          chart_hill_scores: [avgHistoryScore, metaScore],
          chart_hist: bestData.floors.reduce((acc, f) => { acc[f] = (acc[f] || 0) + 1; return acc; }, {}),
          chart_loot: chartLoot,
          show_loot: runTargetMetric !== 'highest_floor',
          show_wall: runTargetMetric === 'highest_floor'
      };

      const absMaxChance = synthSummary.abs_max_chance;
      let tempMaxSta = 1000;
      if (synthSummary.avg_metrics && synthSummary.avg_metrics.in_game_time) {
          tempMaxSta = synthSummary.avg_metrics.in_game_time;
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
          Timestamp: Date.now(),
          ProfileId: profileContext.id,
          ProfileName: profileContext.name,
          IsModified: profileContext.isModified,
          Profile: profileContext.tag,
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
      store.setSimsState('synth_history', [synthEntry, ...(store.synth_history || [])]);
      
      store.setSimResTab('build');
      store.setSimDataTab('performance');

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

          <div className="st-container">
            <h4 className="text-lg font-bold mb-2">🏆 Run Tie-Breaker Tournament</h4>
            <p className="text-sm text-st-text-light mb-4">Once you have checked the <strong>Include</strong> box for a few of your top runs (recommend to use 2 to 5) in the history table below, click Synthesize to merge them.</p>
            
            {checkedRuns.some(r => r.Unassigned !== undefined) && (
              <div className="bg-red-900/20 border-l-4 border-red-500 p-3 rounded text-sm text-red-500 mb-4">
                ⚠️ <strong>Crippled Build Synthesis:</strong> You selected builds with <strong>Unspent Points</strong>! The tournament will dynamically mutate across the 8th dimension to find the mathematically perfect balance of unassigned stats for this specific target.
              </div>
            )}

            <div className="flex flex-col md:flex-row gap-4">
              {!isSynthesizing ? (
                <button 
                  onClick={handleSynthesize}
                  className="flex-1 py-3 bg-st-orange text-[#2b2b2b] font-bold rounded-lg shadow hover:bg-[#ffb045] transition-colors"
                >
                  🧬 Synthesize Ultimate Meta-Build
                </button>
              ) : (
                <div className="flex-1 p-2 border border-st-border rounded bg-st-bg">
                  <div className="flex justify-between text-sm font-bold mb-1 text-st-orange">
                    <span>{synthProgressMsg}</span>
                    <span>{Math.floor(synthProgressPct)}%</span>
                  </div>
                  <div className="w-full bg-[#1e1e1e] rounded-full h-3 overflow-hidden border border-st-border">
                    <div className="bg-st-orange h-3 transition-all duration-300" style={{ width: `${synthProgressPct}%` }}></div>
                  </div>
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

          <div>
            <h4 className="text-lg font-bold mb-1">📋 Run History Table</h4>
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between mb-4">
              <div className="text-sm text-st-text-light">
                <p className="mb-1">Check the boxes for your top runs to mix them into your Meta-Build.</p>
                <p className="italic text-st-orange/80 text-xs">⚠️ The Score/Yields below are from 100-simulation sprints. Expect up to ±10% variance on high-RNG floors until you Synthesize them!</p>
              </div>
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
              {(() => {
                const tableStats = [...activeStats];
                if (visibleHistory.some(r => r.Unassigned !== undefined)) tableStats.push('Unassigned');

                return (
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-st-border bg-black/10">
                        <th className="p-3 w-10 text-center">
                          <input 
                            type="checkbox" 
                            checked={visibleHistory.length > 0 && visibleHistory.every(r => r.Include)}
                            onChange={() => {
                              const newHistory = [ ...history ];
                              const targetState = !(visibleHistory.length > 0 && visibleHistory.every(r => r.Include));
                              visibleHistory.forEach(r => { newHistory[r._global_idx].Include = targetState; });
                              store.setSimsState('run_history', newHistory);
                            }}
                            className="accent-st-orange w-4 h-4 cursor-pointer"
                            title="Select/Deselect All Visible"
                          />
                        </th>
                        <th className="p-3">Profile</th>
                        <th className="p-3">Date</th>
                        <th className="p-3">Target</th>
                        <th className="p-3">Score / Yield</th>
                        <th className="p-3">Avg Floor</th>
                        <th className="p-3">Max Floor</th>
                        {tableStats.map(s => <th key={s} className="p-3">{s === 'Unassigned' ? 'Unspent' : s}</th>)}
                        <th className="p-3 w-10 text-center"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleHistory.length === 0 ? (
                        <tr><td colSpan="15" className="p-4 text-center text-st-text-light">No runs match current filter.</td></tr>
                      ) : visibleHistory.map((r) => {
                        const isFloor = r.Target === 'highest_floor';
                        const score = isFloor ? r['Metric Score'] : ((r['Metric Score'] / 60.0) * 1000.0).toFixed(1);
                        const runTime = r.Timestamp || r._restore_state?.opt_results?.run_id || r._restore_state?.run_id;
                        const timeStr = runTime ? new Date(runTime).toLocaleString(undefined, { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '-';
                        
                        return (
                          <tr key={r._global_idx} className="border-b border-st-border/50 hover:bg-black/5 transition-colors group">
                            <td className="p-3 text-center">
                              <input 
                                type="checkbox" 
                                checked={r.Include || false} 
                                onChange={() => toggleInclude(r._global_idx)}
                                className="accent-st-orange w-4 h-4 cursor-pointer"
                              />
                            </td>
                            <td className="p-3 font-bold text-xs truncate max-w-[100px]" title={getProfileDisplayName(r)}>{getProfileDisplayName(r)}</td>
                            <td className="p-3 text-xs text-st-text-light whitespace-nowrap">{timeStr}</td>
                            <td className="p-3 font-mono text-xs">{r.Target.replace('_per_min', '')}</td>
                            <td className="p-3 font-bold text-st-orange">{score}</td>
                            <td className="p-3">{r['Avg Floor'].toFixed(1)}</td>
                            <td className="p-3">{r['Max Floor']}</td>
                            {tableStats.map(s => <td key={s} className={`p-3 ${s === 'Unassigned' ? 'text-st-orange font-bold' : 'text-st-text-light'}`}>{r[s] !== undefined ? r[s] : '-'}</td>)}
                            <td className="p-3 text-center">
                              <button
                                onClick={() => {
                                  const newHistory =[ ...history ];
                                  newHistory.splice(r._global_idx, 1);
                                  store.setSimsState('run_history', newHistory);
                                }}
                                className="text-red-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Delete this run"
                              >
                                🗑️
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                );
              })()}
            </div>
          </div>

          <div id="synth-results-anchor" className="mt-8"></div>
          
          {store.synthesis_result && !isSynthesizing && (() => {
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

          {store.opt_results && store.synthesis_result && !isSynthesizing && <ResultsDashboard context="synthesizer" />}

          <hr className="border-st-border my-8" />

          {store.synth_history && store.synth_history.length > 0 && (
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold">📚 Meta-Build History Log</h3>
                  <p className="text-sm text-st-text-light">A permanent record of your optimized Meta-Builds.</p>
                </div>
                <button 
                  onClick={() => synthGridRef.current?.api.setFilterModel(null)}
                  className="px-4 py-2 bg-st-secondary border border-st-border text-st-text font-bold rounded hover:border-st-orange transition-colors text-sm whitespace-nowrap"
                >
                  🔄 Reset Filters
                </button>
              </div>
              
              <div 
                className={`border border-st-border rounded bg-st-bg h-[400px] w-full outline-none ${store.theme === 'dark' ? 'ag-theme-quartz-dark' : 'ag-theme-quartz'}`}
                tabIndex={-1}
                onMouseEnter={(e) => {
                  if (!e.currentTarget.contains(document.activeElement)) {
                    e.currentTarget.focus();
                  }
                }}
              >
                <AgGridReact
                  ref={synthGridRef}
                  theme="legacy"
                  rowData={store.synth_history}
                  defaultColDef={{ sortable: true, filter: true, resizable: true }}
                  columnDefs={synthHistoryColumns}
                  onFirstDataRendered={(p) => { 
                    try { 
                      const colsToSize = p.api.getColumns().filter(c => !c.getColDef().suppressAutoSize).map(c => c.getColId());
                      p.api.autoSizeColumns(colsToSize); 
                    } catch(e){} 
                  }}
                  onRowDataUpdated={(p) => { 
                    try { 
                      const colsToSize = p.api.getColumns().filter(c => !c.getColDef().suppressAutoSize).map(c => c.getColId());
                      p.api.autoSizeColumns(colsToSize); 
                    } catch(e){} 
                  }}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}