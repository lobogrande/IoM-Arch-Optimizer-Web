import { useState } from 'react';
import useStore from '../store';

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

          <button 
            className="w-full py-3 bg-st-orange text-[#2b2b2b] font-bold rounded-lg shadow hover:bg-[#ffb045] transition-colors mt-4"
          >
            🚀 Run Optimizer
          </button>

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
