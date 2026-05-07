// src/components/simulations/PathfinderTab.jsx
import React, { useState } from 'react';
import useStore from '../../store';
import { EngineWorkerPool } from '../../utils/optimizer';
import { runPathfinderSimulation } from '../../utils/pathfinder_engine';

export default function PathfinderTab() {
  const store = useStore();
  const[startMode, setStartMode] =[ useState('template') ];
  const [isSimulating, setIsSimulating] =[ useState(false) ];
  const [pathData, setPathData] =[ useState(null) ];
  const[simStatus, setSimStatus] =[ useState('') ];
  const [simProgress, setSimProgress] =[ useState(0) ];

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

      {/* RESULTS AREA (Phase 2 Simple Log) */}
      {pathData && (
        <div className="bg-st-bg border border-st-border rounded p-4 shadow-sm animate-fade-in">
          <h3 className="text-lg font-bold text-st-text mb-4 border-b border-st-border pb-2">Phase 2 Event Log</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto font-mono text-xs">
            {pathData.history.map((node, idx) => (
              <div key={idx} className="p-2 border border-st-border rounded bg-st-secondary/10 flex gap-4 items-center">
                <div className="w-24 text-st-orange">
                  Day {(node.time_mins / 1440).toFixed(1)}
                </div>
                <div className="w-24 text-gray-400">
                  Lvl {node.level}
                </div>
                <div className="flex-1">
                  <strong className="text-st-text block">{node.event}</strong>
                  <span className="text-st-text-light">{node.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}