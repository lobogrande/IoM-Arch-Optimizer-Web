import { useEffect, useRef } from 'react';
import useStore from './store';
import { APP_VERSION } from './ui_config';
import PlayerSetup from './components/PlayerSetup';
import CalculatedStats from './components/CalculatedStats';
import BlockCompendium from './components/BlockCompendium';
import Simulations from './components/Simulations';
import Welcome from './components/Welcome';
import About from './components/About';

const TABS =[
  { id: 'welcome', label: '🏠 Welcome' },
  { id: 'setup', label: '⚙️ Player Setup' },
  { id: 'calc_stats', label: '📋 Calculated Stats' },
  { id: 'block_stats', label: '🪨 Block Compendium' },
  { id: 'simulations', label: '🧪 Simulations' },
  { id: 'about', label: '📚 About & Feedback' }
];

function App() {
  const store = useStore();
  const activeTab = store.activeTab;
  const setActiveTab = store.setActiveTab;
  const calcWorkerRef = useRef(null);

  // Apply Dark Mode Class to HTML body natively
  useEffect(() => {
    if (store.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  },[store.theme]);

  // ----------------------------------------------------
  // ROUTING: Bidirectional Hash Deep-Linking
  // ----------------------------------------------------
  useEffect(() => {
    // 1. Sync Store ➔ URL Hash (when user clicks tabs)
    let hash = `#/${activeTab}`;
    if (activeTab === 'setup' && store.activeSubTab) hash += `/${store.activeSubTab}`;
    if (activeTab === 'simulations' && store.simActiveSubTab) hash += `/${store.simActiveSubTab}`;
    
    if (window.location.hash !== hash) {
      window.history.replaceState(null, '', hash);
    }
  },[ activeTab, store.activeSubTab, store.simActiveSubTab ]);

  useEffect(() => {
    // 2. Sync URL Hash ➔ Store (On initial load & browser Back/Forward)
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#/', '');
      if (!hash) return; // Fallback to Zustand persisted state if no hash
      
      const parts = hash.split('/');
      const tab = parts[0];
      const sub = parts[1];

      const validTabs = TABS.map(t => t.id);
      if (validTabs.includes(tab)) {
        // We use useStore.getState() to avoid React batching dependency loops
        const st = useStore.getState();
        if (st.activeTab !== tab) st.setActiveTab(tab);
        if (tab === 'setup' && sub && st.activeSubTab !== sub) st.setActiveSubTab(sub);
        if (tab === 'simulations' && sub && st.simActiveSubTab !== sub) st.setSimActiveSubTab(sub);
      }
    };

    handleHashChange(); // Fire on mount to catch deep links
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [ ]);

  // Initialize the Calculation Worker
  useEffect(() => {
    calcWorkerRef.current = new Worker(`/calc_worker.js?v=${APP_VERSION}`);
    
    calcWorkerRef.current.onmessage = (e) => {
      if (e.data.type === 'CALC_RESULT') {
        store.setCalculatedStats(e.data.payload);
      } else if (e.data.type === 'SANDBOX_RESULT') {
        store.setSandboxCalculatedStats(e.data.payload);
      } else if (e.data.type === 'ERROR') {
        console.error("🚨 Python Math Worker Crashed:", e.data.payload);
      }
    };
    
    return () => calcWorkerRef.current.terminate();
  },[]); // Only runs once on mount

  // Trigger GLOBAL calculations only when global inputs change
  useEffect(() => {
    if (calcWorkerRef.current) {
      calcWorkerRef.current.postMessage({
        command: 'CALC_STATS',
        payload: {
          asc1_unlocked: store.asc1_unlocked,
          asc2_unlocked: store.asc2_unlocked,
          arch_level: store.arch_level,
          current_max_floor: store.current_max_floor,
          arch_ability_infernal_bonus: parseFloat(store.arch_ability_infernal_bonus) / 100.0 || 0.0,
          total_infernal_cards: store.total_infernal_cards,
          base_stats: store.base_stats,
          upgrade_levels: store.upgrade_levels,
          external_levels: { ...store.external_levels, 8: store.geoduck_unlocked ? (store.external_levels[ 8 ] || 0) : 0 },
          cards: store.cards,
          compendium_target_floor: store.compendium_target_floor || store.current_max_floor
        }
      });
    }
  },[
    store.asc1_unlocked, store.asc2_unlocked, store.arch_level,
    store.arch_ability_infernal_bonus, store.total_infernal_cards, store.base_stats, 
    store.upgrade_levels, store.external_levels, store.cards, store.compendium_target_floor, store.current_max_floor
  ]);

  // Trigger SANDBOX calculations only when Sandbox stats/floor change
  useEffect(() => {
    if (calcWorkerRef.current) {
      calcWorkerRef.current.postMessage({
        command: 'CALC_SANDBOX',
        payload: {
          asc1_unlocked: store.asc1_unlocked,
          asc2_unlocked: store.asc2_unlocked,
          arch_level: store.arch_level,
          current_max_floor: store.current_max_floor,
          arch_ability_infernal_bonus: parseFloat(store.arch_ability_infernal_bonus) / 100.0 || 0.0,
          total_infernal_cards: store.total_infernal_cards,
          base_stats: store.sandbox_stats,
          upgrade_levels: store.upgrade_levels,
          external_levels: store.external_levels,
          cards: store.cards,
          compendium_target_floor: store.sandbox_floor || store.current_max_floor
        }
      });
    }
  },[
    store.asc1_unlocked, store.asc2_unlocked, store.arch_level,
    store.arch_ability_infernal_bonus, store.total_infernal_cards, store.sandbox_stats, 
    store.upgrade_levels, store.external_levels, store.cards, store.sandbox_floor, store.current_max_floor
  ]);

  return (
    <div className="min-h-screen bg-st-bg text-st-text p-4 md:p-8">
      
      <div className="flex items-center gap-4 mb-6 w-full">
        <h1 className="text-3xl md:text-4xl font-bold">
          ⛏️ IoM Arch Optimizer
        </h1>
        <span className="bg-st-orange text-st-bg text-sm font-bold px-2 py-1 rounded shadow-sm">
          {APP_VERSION}
        </span>
        
        <button 
          onClick={store.toggleTheme}
          className="ml-auto flex items-center justify-center w-10 h-10 rounded-full bg-st-secondary border border-st-border hover:border-st-orange transition-colors text-xl shadow-sm"
          title="Toggle Light/Dark Mode"
        >
          {store.theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>

      {/* Streamlit Exact Tab Styling */}
      <div className="flex overflow-x-auto border-b border-st-border mb-6 no-scrollbar">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
              }}
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
        <div className={activeTab === 'welcome' ? 'block' : 'hidden'}><Welcome setActiveTab={setActiveTab} /></div>
        <div className={activeTab === 'setup' ? 'block' : 'hidden'}><PlayerSetup /></div>
        <div className={activeTab === 'calc_stats' ? 'block' : 'hidden'}><CalculatedStats /></div>
        <div className={activeTab === 'block_stats' ? 'block' : 'hidden'}><BlockCompendium /></div>
        <div className={activeTab === 'simulations' ? 'block' : 'hidden'}><Simulations /></div>
        <div className={activeTab === 'about' ? 'block' : 'hidden'}><About /></div>
      </div>

      {/* Floating Back to Top Button */}
      <button 
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className="back-to-top"
      >
        ⬆️ Back to Tabs
      </button>

    </div>
  );
}

export default App;