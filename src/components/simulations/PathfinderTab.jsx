// src/components/simulations/PathfinderTab.jsx
import React, { useState } from 'react';
import useStore from '../../store';

export default function PathfinderTab() {
  const store = useStore();
  const [startMode, setStartMode] =[ useState('template') ]; // 'template' or 'current'
  const [isSimulating, setIsSimulating] =[ useState(false) ];
  const [pathData, setPathData] =[ useState(null) ];

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
    
    // We will build the Event Engine in Phase 2.
    // For now, mock a 1-second delay to test the UI state.
    setTimeout(() => {
      setPathData({
        message: "Engine hook pending...",
        nodes: [ ]
      });
      setIsSimulating(false);
    }, 1000);
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
          className="w-full py-3 bg-st-orange text-st-bg rounded font-bold text-lg hover:bg-opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
        >
          {isSimulating ? 'Initializing Engine...' : 'Run Path Simulation'}
        </button>
      </div>

      {/* RESULTS AREA (Stubbed) */}
      {pathData && (
        <div className="bg-st-bg border border-st-border rounded p-4 shadow-sm animate-fade-in">
          <h3 className="text-lg font-bold text-st-text mb-4">Trajectory Output</h3>
          <div className="h-64 flex items-center justify-center border border-dashed border-st-border text-st-text-light">[ Phase 4: Non-linear Node Timeline & Plotly Yield Charts will render here ]
          </div>
        </div>
      )}

    </div>
  );
}