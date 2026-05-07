// src/components/simulations/PathfinderTab.jsx
import React, { useState } from 'react';
import useStore from '../../store';
import { EngineWorkerPool } from '../../utils/optimizer';
import { runPathfinderSimulation } from '../../utils/pathfinder_engine';

export default function PathfinderTab() {
  const store = useStore();
  const[startMode, setStartMode] = useState('template');
  const [isSimulating, setIsSimulating] = useState(false);
  const [pathData, setPathData] = useState(null);
  const[simStatus, setSimStatus] = useState('');
  const [simProgress, setSimProgress] = useState(0);
  const [groupBy, setGroupBy] = useState('level'); // 'level' or 'floor'

  // Generic Number Formatter to keep the UI clean
  const formatNum = (val) => {
    if (val == null) return "0";
    if (val >= 1000000000) return (val / 1000000000).toFixed(2) + "b";
    if (val >= 1000000) return (val / 1000000).toFixed(2) + "m";
    if (val >= 1000) return (val / 1000).toFixed(1) + "k";
    return Math.floor(val).toString();
  };

  // Hardcoded Ascension 2 Starting Template Baseline
  const asc2Template = {
    arch_level: 1,
    current_max_floor: 1,
    base_stats: { Str: 0, Agi: 0, Per: 0, Int: 0, Luck: 0, Div: 0, Corr: 0 },
    // Only keeping external upgrades that persist across Ascensions
    external_levels: { 4: 0, 5: store.external_levels[5] || 0, 6: store.external_levels[6] || 0, 8: store.geoduck_unlocked ? (store.external_levels[8] || 0) : 0, 21: store.external_levels[21] || 0 },
    upgrade_levels: { },
    cards: { } 
  };

  const handleStartPathfinder = async () => {
    setIsSimulating(true);
    setPathData(null);
    setSimProgress(0);
    setSimStatus('Booting Engine...');
    
    try {
      const pool = new EngineWorkerPool();
      await pool.init();
      
      setSimStatus('Syncing Engine State...');
      
      // Force Asc2 Unlocked for the template start!
      const activeState = startMode === 'template' ? { ...asc2Template, asc2_unlocked: true, asc1_unlocked: true } : {
        asc1_unlocked: store.asc1_unlocked,
        asc2_unlocked: store.asc2_unlocked,
        arch_level: store.arch_level,
        current_max_floor: store.current_max_floor,
        arch_ability_infernal_bonus: parseFloat(store.arch_ability_infernal_bonus) / 100.0,
        total_infernal_cards: store.total_infernal_cards,
        base_stats: store.base_stats,
        upgrade_levels: store.upgrade_levels,
        external_levels: store.external_levels,
        cards: store.cards
      };

      await pool.syncState(activeState);

      const result = await runPathfinderSimulation(activeState, pool, (prog) => {
        setSimProgress(prog.progress);
        setSimStatus(prog.status);
      });

      pool.terminate();
      setPathData(result);
      
    } catch (err) {
      console.error(err);
      setSimStatus('Engine Error: ' + err.message);
    }
    
    setIsSimulating(false);
  };

  return (
    <div className="animate-fade-in space-y-6">
      
      {/* HEADER */}
      <div className="bg-st-secondary/30 border-l-4 border-st-orange p-4 rounded shadow-sm">
        <h2 className="text-xl font-bold text-st-text mb-2">Ascension Pathfinder (Alpha)</h2>
        <p className="text-sm text-st-text-light">
          My experimental macro-optimizer. This tool attempts to project your optimal trajectory through Ascension 2 
          by forecasting milestones, fragment accumulation, and upgrade purchases over Expected Arch Time.
        </p>
      </div>

      {/* SETUP DASHBOARD */}
      <div className="bg-st-bg border border-st-border rounded p-4 shadow-sm">
        <h3 className="text-lg font-bold text-st-text mb-4 border-b border-st-border pb-2">1. Starting Point</h3>
        
        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setStartMode('template')}
            className={`px-4 py-2 rounded font-bold text-sm transition-colors border ${
              startMode === 'template'
                ? 'bg-st-orange border-st-orange text-st-bg'
                : 'bg-transparent border-st-border text-st-text hover:border-st-orange'
            }`}
          >
            Fresh Asc2 Start (Template)
          </button>
          <button
            onClick={() => setStartMode('current')}
            className={`px-4 py-2 rounded font-bold text-sm transition-colors border ${
              startMode === 'current'
                ? 'bg-st-orange border-st-orange text-st-bg'
                : 'bg-transparent border-st-border text-st-text hover:border-st-orange'
            }`}
          >
            Current Workspace State
          </button>
        </div>

        <div className="bg-[#0E1117] p-3 rounded border border-st-border text-xs font-mono text-st-text-light mb-6">
          {startMode === 'template' ? (
            <div>
              <p>Arch Level: {asc2Template.arch_level}</p>
              <p>Max Floor: {asc2Template.current_max_floor}</p>
              <p>Upgrades: None</p>
              <p className="mt-2 text-[#FAFAFA]">Goal Director Logic:</p>
              <ul className="list-disc ml-4 opacity-80 mt-1">
                <li>Priority 1: Push Floor 200</li>
                <li>Priority 2: Max Internal Upgrades via Fragment Farming</li>
                <li>Priority 3: Farm Divine Fragments (Hades Idol)</li>
                <li>Priority 4: Div4 Farming / Infernal Completion</li>
              </ul>
            </div>
          ) : (
            <div>
              <p>Arch Level: {store.arch_level}</p>
              <p>Max Floor: {store.current_max_floor}</p>
              <p>Targeting remaining goals based on current state...</p>
            </div>
          )}
        </div>

        <button
          onClick={handleStartPathfinder}
          disabled={isSimulating}
          className="w-full py-3 bg-st-orange text-st-bg rounded font-bold text-lg hover:bg-opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md flex flex-col items-center justify-center"
        >
          <span>{isSimulating ? simStatus : 'Run Path Simulation'}</span>
          {isSimulating && (
            <div className="w-1/2 bg-st-bg/20 rounded h-1.5 mt-2 overflow-hidden">
              <div className="bg-white h-full transition-all duration-300" style={{ width: `${simProgress}%` }} />
            </div>
          )}
        </button>
      </div>

      {/* RESULTS AREA (Phase 2 Grouped Log) */}
      {pathData && (
        <div className="bg-st-bg border border-st-border rounded p-4 shadow-sm animate-fade-in">
          <div className="flex justify-between items-center mb-4 border-b border-st-border pb-2">
            <h3 className="text-lg font-bold text-st-text">Phase 2 Event Log</h3>
            <div className="flex bg-st-secondary/50 rounded border border-st-border text-xs font-bold overflow-hidden">
              <button 
                onClick={() => setGroupBy('level')}
                className={`px-3 py-1.5 transition-colors ${groupBy === 'level' ? 'bg-st-orange text-st-bg' : 'text-st-text hover:bg-st-secondary'}`}
              >
                Group by Arch Level
              </button>
              <button 
                onClick={() => setGroupBy('floor')}
                className={`px-3 py-1.5 transition-colors border-l border-st-border ${groupBy === 'floor' ? 'bg-st-orange text-st-bg' : 'text-st-text hover:bg-st-secondary'}`}
              >
                Group by Max Floor
              </button>
            </div>
          </div>
          
          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
            {Object.entries(
              pathData.history.reduce((acc, node) => {
                const key = groupBy === 'level' ? node.level : node.floor;
                if (!acc[ key ]) acc[ key ] =[ ];
                acc[ key ].push(node);
                return acc;
              }, { })
            ).map(([ groupKey, nodes ]) => (
              <details 
                key={groupKey} 
                className="bg-st-secondary/10 border border-st-border rounded overflow-hidden" 
                open={groupKey === "1" || groupKey === "30"}
              >
                <summary className="p-3 bg-st-secondary/20 font-bold cursor-pointer hover:bg-st-secondary/30 transition-colors flex justify-between items-center text-sm text-st-text outline-none select-none group">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-st-text-light transform transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <span>{groupBy === 'level' ? 'Arch Level' : 'Max Floor'} {groupKey} Progression</span>
                  </div>
                  <span className="text-xs text-st-text-light">{nodes.length} Events</span>
                </summary>
                <div className="p-3 space-y-2 text-xs font-mono">
                  {nodes.map((node, idx) => (
                    <div key={idx} className="flex gap-4 items-start border-b border-st-border/50 pb-2 last:border-0 last:pb-0">
                      <div className="w-24 text-st-orange shrink-0 font-bold">
                        {formatNum(node.arch_sec)} Arch Sec
                      </div>
                      <div className="flex-1">
                        <strong className={`block ${node.type === 'level' ? 'text-green-400' : node.type === 'floor' ? 'text-purple-400' : 'text-st-text'}`}>
                          {node.event}
                        </strong>
                        <span className="text-st-text-light">{node.desc}</span>
                        
                        {/* DEBUG SNAPSHOT */}
                        {node.yields && node.frags && (
                          <details className="mt-1 group/debug text-[10px] text-gray-500">
                            <summary className="cursor-pointer hover:text-gray-300 w-max select-none">
                              🔍 View Snapshot
                            </summary>
                            <div className="pl-2 pt-1 mt-1 border-l border-st-border grid grid-cols-1 md:grid-cols-2 gap-2">
                              <div>
                                <strong className="text-st-text-light">Yields / min:</strong><br/>
                                XP: {formatNum(node.yields.xp_per_min)}<br/>
                                C: {node.yields.frag_1_per_min?.toFixed(1) || 0} | R: {node.yields.frag_2_per_min?.toFixed(1) || 0} | E: {node.yields.frag_3_per_min?.toFixed(1) || 0}
                              </div>
                              <div>
                                <strong className="text-st-text-light">Fragment Bank:</strong><br/>
                                C: {(node.frags?.com || 0).toFixed(1)} | R: {(node.frags?.rare || 0).toFixed(1)}<br/>
                                E: {(node.frags?.epic || 0).toFixed(1)} | L: {(node.frags?.leg || 0).toFixed(1)}
                              </div>
                            </div>
                          </details>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}