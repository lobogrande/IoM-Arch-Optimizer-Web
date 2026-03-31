import { useState, useEffect, useRef } from 'react';
import useStore from './store';
import PlayerSetup from './components/PlayerSetup';
import CalculatedStats from './components/CalculatedStats';
import BlockCompendium from './components/BlockCompendium';

const TABS =[
  { id: 'welcome', label: '🏠 Welcome' },
  { id: 'setup', label: '⚙️ Player Setup' },
  { id: 'calc_stats', label: '📋 Calculated Stats' },
  { id: 'block_stats', label: '🪨 Block Compendium' },
  { id: 'simulations', label: '🧪 Simulations' },
  { id: 'about', label: '📚 About & Feedback' }
];

function App() {
  const[activeTab, setActiveTab] = useState('setup'); 
  const store = useStore();
  const calcWorkerRef = useRef(null);

  // Initialize the Calculation Worker
  useEffect(() => {
    calcWorkerRef.current = new Worker('/calc_worker.js');
    
    calcWorkerRef.current.onmessage = (e) => {
      if (e.data.type === 'CALC_RESULT') {
        store.setCalculatedStats(e.data.payload);
      } else if (e.data.type === 'ERROR') {
        console.error("🚨 Python Math Worker Crashed:", e.data.payload);
      }
    };
    
    return () => calcWorkerRef.current.terminate();
  },[]); // Only runs once on mount

  // Trigger calculations automatically whenever the player's inputs change
  useEffect(() => {
    if (calcWorkerRef.current) {
      calcWorkerRef.current.postMessage({
        command: 'CALC_STATS',
        payload: {
          asc1_unlocked: store.asc1_unlocked,
          asc2_unlocked: store.asc2_unlocked,
          arch_level: store.arch_level,
          hades_idol_level: store.hades_idol_level,
          arch_ability_infernal_bonus: store.arch_ability_infernal_bonus,
          total_infernal_cards: store.total_infernal_cards,
          base_stats: store.base_stats,
          upgrade_levels: store.upgrade_levels,
          external_levels: store.external_levels,
          cards: store.cards,
          compendium_target_floor: store.compendium_target_floor || store.current_max_floor
        }
      });
    }
  },[
    store.asc1_unlocked, store.asc2_unlocked, store.arch_level, store.hades_idol_level, 
    store.arch_ability_infernal_bonus, store.total_infernal_cards, store.base_stats, 
    store.upgrade_levels, store.external_levels, store.cards, store.compendium_target_floor, store.current_max_floor
  ]);

  return (
    <div className="min-h-screen bg-st-bg text-st-text p-4 md:p-8">
      
      <h1 className="text-3xl md:text-4xl font-bold mb-6">
        ⛏️ AI Arch Mining Optimizer
      </h1>

      {/* Streamlit Exact Tab Styling */}
      <div className="flex overflow-x-auto border-b border-st-border mb-6 no-scrollbar">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 font-medium whitespace-nowrap transition-colors duration-200 border-b-2 ${
                isActive 
                  ? 'border-st-orange text-st-text' 
                  : 'border-transparent text-st-text-light hover:text-st-orange hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="w-full">
        {activeTab === 'setup' && <PlayerSetup />}
        {activeTab === 'calc_stats' && <CalculatedStats />}
        {activeTab === 'block_stats' && <BlockCompendium />}
        {(activeTab !== 'setup' && activeTab !== 'calc_stats' && activeTab !== 'block_stats') && (
          <div className="st-container text-center text-st-text-light py-20">
            🚧 Content for {activeTab} coming soon!
          </div>
        )}
      </div>

    </div>
  );
}

export default App;