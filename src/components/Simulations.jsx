// src/components/Simulations.jsx
import { useState } from 'react';
import useStore from '../store';
import { EngineWorkerPool } from '../utils/optimizer';
import OptimizerTab from './simulations/OptimizerTab';
import SynthesisTab from './simulations/SynthesisTab';
import DuelTab from './simulations/DuelTab';
import SandboxTab from './simulations/SandboxTab';

export default function Simulations() {
  const store = useStore();
  const activeSubTab = store.simActiveSubTab;
  const setActiveSubTab = store.setSimActiveSubTab;
  
  const cpuProfile = store.cpuProfile || 'balanced';
  const setCpuProfile = (v) => store.setSimsState('cpuProfile', v);
  const simsPerSec = store.simsPerSec || 15;
  const setSimsPerSec = (v) => store.setSimsState('simsPerSec', v);

  const [isBenchmarking, setIsBenchmarking] = useState(false);

  // Determine if any child tabs are running heavy tasks to disable the benchmark button
  // (We'll safely ignore this cross-component block for the Benchmark button)
  const isAnyRunning = isBenchmarking; 

  const handleRunBenchmark = async () => {
    if (isAnyRunning) return;
    setIsBenchmarking(true);
    try {
      const pool = new EngineWorkerPool();
      await pool.init();
      
      await pool.syncState({
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
      });
      
      const start = Date.now();
      const promises = [ ];
      
      // Fire 50 simultaneous tasks to instantly gauge multi-core throughput
      for (let i = 0; i < 50; i++) {
        promises.push(pool.runTask(store.base_stats));
      }
      
      await Promise.all(promises);
      const elapsed = (Date.now() - start) / 1000;
      pool.terminate();
      
      if (elapsed > 0) {
        setSimsPerSec(Math.max(1, Math.floor(50 / elapsed)));
      }
    } catch (err) {
      console.error("Benchmark failed:", err);
    }
    setIsBenchmarking(false);
  };

  return (
    <div className="animate-fade-in pb-24">
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
      
      {/* SUB-TABS ROUTING */}
      <div className="flex overflow-x-auto border-b border-st-border mb-6 no-scrollbar">
        {[
          { id: 'optimizer', label: '🚀 Optimizer' },
          { id: 'synth', label: '🧬 Build Synthesis & History' },
          { id: 'duel', label: '⚔️ Build Duel' },
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

      {/* GLOBAL ENGINE CONTROLS */}
      {activeSubTab !== 'sandbox' && (
        <div className="st-container mb-8 flex flex-col md:flex-row gap-6 justify-between items-start md:items-center border-l-4 border-l-st-orange bg-st-secondary/30">
          <div className="w-full md:w-2/3">
            <label className="block text-sm font-bold mb-2">🔥 Global CPU Thermal Profile</label>
            <select 
              value={cpuProfile} 
              onChange={(e) => setCpuProfile(e.target.value)}
              className="w-full bg-st-bg border border-st-border rounded p-2 text-sm text-st-text focus:border-st-orange focus:outline-none"
            >
              <option value="eco">Eco Mode / Mobile (Max 1-2 Cores) - Saves Battery</option>
              <option value="balanced">Balanced (Up to 6 Cores) - Safe for PCs</option>
              <option value="max">Max Performance (All Cores) - ⚠️ Thermal Warning</option>
            </select>
            <div className="text-xs text-st-text-light mt-2">
              Caps the engine's background Web Workers to prevent your device from thermal-throttling or draining battery during Monte Carlo simulations.
            </div>
          </div>
          <div className="w-full md:w-1/3 flex flex-col gap-2 bg-st-bg border border-st-border p-3 rounded shadow-sm">
            <div className="text-sm">
              ⚡ <strong>Hardware Speed:</strong><br/>{simsPerSec} sims/sec <em>(Calibrated)</em>
            </div>
            <button 
              onClick={handleRunBenchmark}
              disabled={isAnyRunning}
              className="w-full py-1 bg-st-secondary border border-st-border rounded hover:border-st-orange text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isBenchmarking ? '⏳ Benchmarking...' : '🔄 Recalibrate Speed'}
            </button>
          </div>
        </div>
      )}

      {/* TAB VIEWS */}
      {activeSubTab === 'optimizer' && <OptimizerTab />}
      {activeSubTab === 'synth' && <SynthesisTab />}
      {activeSubTab === 'duel' && <DuelTab />}
      {activeSubTab === 'sandbox' && <SandboxTab />}

    </div>
  );
}