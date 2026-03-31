import { useState } from 'react';
import useStore from '../store';
import { UI_STAT_IMG_WIDTH } from '../ui_config';

export default function PlayerSetup() {
  const { asc1_unlocked, asc2_unlocked, arch_level, current_max_floor, base_stats, setSetting, setBaseStat } = useStore();
  const [activeSubTab, setActiveSubTab] = useState('stats');

  // Replicate the Budget Tracker Logic
  const total_allowed = arch_level; // (Skipping upgrade 12 for this quick mockup)
  const current_allocated = Object.values(base_stats).reduce((a, b) => a + b, 0);
  const remaining = total_allowed - current_allocated;

  const STAT_CAPS = {
    Str: 50, Agi: 50, Per: 25, Int: 25, Luck: 25, Div: 10, Corr: 10
  };

  const renderStat = (label, statKey) => {
    // Only show Div if Asc1, only show Corr if Asc2
    if (statKey === 'Div' && !asc1_unlocked) return null;
    if (statKey === 'Corr' && !asc2_unlocked) return null;

    return (
      <div className="st-container flex flex-col items-center justify-center p-4">
        <div className="text-center mb-2">
          <span className="font-bold">{label}</span>
          <br/>
          <span className="text-sm text-st-text-light">(Max: {STAT_CAPS[statKey]})</span>
        </div>
        
        {/* Crisp Pixel-Art Image Rendering */}
        <div style={{ width: UI_STAT_IMG_WIDTH }} className="flex items-center justify-center mb-4 mx-auto">
          <img 
            src={`/assets/stats/${statKey.toLowerCase()}.png`} 
            alt={label}
            className="w-full object-contain"
            style={{ imageRendering: 'pixelated' }}
            onError={(e) => {
              // Fallback if the image is missing
              e.target.style.display = 'none';
              e.target.parentNode.innerHTML = '<span class="text-xs text-gray-400">No Img</span>';
            }}
          />
        </div>

        <input 
          type="number" 
          className="st-input"
          value={base_stats[statKey]}
          onChange={(e) => setBaseStat(statKey, e.target.value)}
          min="0"
          max={STAT_CAPS[statKey]}
        />
      </div>
    );
  };

  return (
    <div className="flex flex-col md:flex-row gap-6">
      
      {/* LEFT COLUMN: col_setup_menu (Ratio 1) */}
      <div className="w-full md:w-1/4 flex flex-col gap-4">
        
        {/* st.expander("⚙️ Global Settings") */}
        <div className="st-container">
          <h3 className="font-bold mb-4 flex items-center gap-2">⚙️ Global Settings</h3>
          
          <label className="flex items-center gap-2 mb-2 cursor-pointer">
            <input type="checkbox" checked={asc1_unlocked} onChange={(e) => {
              setSetting('asc1_unlocked', e.target.checked);
              if (!e.target.checked) setSetting('asc2_unlocked', false);
            }} className="w-4 h-4 accent-st-orange" />
            <span>Ascension 1 Unlocked</span>
          </label>

          <label className="flex items-center gap-2 mb-4 cursor-pointer text-st-text">
            <input type="checkbox" disabled={!asc1_unlocked} checked={asc2_unlocked} onChange={(e) => setSetting('asc2_unlocked', e.target.checked)} className="w-4 h-4 accent-st-orange" />
            <span className={!asc1_unlocked ? "opacity-50" : ""}>Ascension 2 Unlocked</span>
          </label>

          <div className="mb-4">
            <label className="text-sm text-st-text-light block mb-1">Arch Level</label>
            <input type="number" className="st-input" value={arch_level} onChange={(e) => setSetting('arch_level', parseInt(e.target.value)||1)} />
          </div>

          <div>
            <label className="text-sm text-st-text-light block mb-1">Max Floor Reached</label>
            <input type="number" className="st-input" value={current_max_floor} onChange={(e) => setSetting('current_max_floor', parseInt(e.target.value)||1)} />
          </div>
        </div>

        {/* --- 2. IMPORT DATA --- */}
        <div className="st-container">
          <h3 className="font-bold mb-4 flex items-center gap-2">📂 Import Data</h3>
          <p className="text-sm text-st-text-light mb-4">Upload your player_state.json</p>
          <input 
            type="file" 
            accept=".json" 
            className="block w-full text-sm text-st-text-light file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-st-secondary file:text-st-text hover:file:bg-gray-200 cursor-pointer"
          />
        </div>

        {/* --- 3. EXPORT DATA --- */}
        <div className="st-container">
          <h3 className="font-bold mb-4 flex items-center gap-2">💾 Export Data</h3>
          <p className="text-sm text-st-text-light mb-4">Download your current UI configuration.</p>
          <button className="w-full px-4 py-2 bg-st-secondary text-st-text border border-st-border rounded hover:border-st-orange transition-colors font-medium">
            📥 Download JSON
          </button>
        </div>

      </div>

      {/* RIGHT COLUMN: col_setup_content (Ratio 3) */}
      <div className="w-full md:w-3/4">
        
        {/* Sub-Tabs exactly like Streamlit */}
        <div className="flex border-b border-st-border mb-4">
          {['📊 Base Stats', '⬆️ Upgrades', '🎴 Block Cards', '🗿 Arch Idols'].map((tab, idx) => {
            const tabId = ['stats', 'upgrades', 'cards', 'idols'][idx];
            const isActive = activeSubTab === tabId;
            return (
              <button key={tabId} onClick={() => setActiveSubTab(tabId)}
                className={`px-4 py-2 font-medium border-b-2 transition-colors ${isActive ? 'border-st-orange text-st-text' : 'border-transparent text-st-text hover:text-st-orange hover:border-gray-300'}`}>
                {tab}
              </button>
            )
          })}
        </div>

        {/* Sub-Tab Content */}
        {activeSubTab === 'stats' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">Base Stat Allocation</h3>
              <div className="text-right">
                <div className="text-sm text-st-text-light">Unallocated Points</div>
                <div className={`text-2xl font-bold ${remaining < 0 ? 'text-st-red' : 'text-st-text'}`}>{remaining}</div>
                <div className="text-xs text-st-text-light">{current_allocated} / {total_allowed} Used</div>
              </div>
            </div>
            <hr className="border-st-border mb-6" />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {renderStat("Strength", "Str")}
              {renderStat("Agility", "Agi")}
              {renderStat("Perception", "Per")}
              {renderStat("Intelligence", "Int")}
              {renderStat("Luck", "Luck")}
              {renderStat("Divine", "Div")}
              {renderStat("Corruption", "Corr")}
            </div>
          </div>
        )}

        {activeSubTab !== 'stats' && (
          <div className="st-container text-center text-st-text-light py-10">
            🚧 {activeSubTab} tab coming soon...
          </div>
        )}

      </div>
    </div>
  );
}
