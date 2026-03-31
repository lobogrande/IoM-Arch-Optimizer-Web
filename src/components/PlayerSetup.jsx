import { useState } from 'react';
import useStore from '../store';
import { UI_STAT_IMG_WIDTH, UI_BLOCK_CARD_WIDTH } from '../ui_config';
import { INTERNAL_UPGRADE_CAPS, UPGRADE_NAMES, ASC1_LOCKED_UPGS, ASC2_LOCKED_UPGS, CARD_TYPES } from '../game_data';

export default function PlayerSetup() {
  const { asc1_unlocked, asc2_unlocked, arch_level, current_max_floor, base_stats, upgrade_levels, cards, setSetting, setBaseStat, setUpgradeLevel, setCardLevel, loadStateFromJson } = useStore();
  const[hideMaxed, setHideMaxed] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState('stats');
  const [isDragging, setIsDragging] = useState(false);

  const processFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target.result);
        loadStateFromJson(json);
        console.log("✅ Player state loaded successfully!");
      } catch (err) {
        alert("❌ Error parsing JSON file.");
        console.error(err);
      }
    };
    reader.readAsText(file);
  };

  const handleFileUpload = (e) => {
    processFile(e.target.files[0]);
    e.target.value = null; // Reset input
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleExport = () => {
    // Construct the JSON exactly how Python expects it
    const exportData = {
      settings: {
        asc1_unlocked: useStore.getState().asc1_unlocked,
        asc2_unlocked: useStore.getState().asc2_unlocked,
        arch_level: useStore.getState().arch_level,
        current_max_floor: useStore.getState().current_max_floor,
        hades_idol_level: useStore.getState().hades_idol_level,
        total_infernal_cards: useStore.getState().total_infernal_cards
      },
      base_stats: useStore.getState().base_stats,
      cards: useStore.getState().cards,
      // We reconstruct the "ID - Name" format for internal upgrades
      internal_upgrades: Object.fromEntries(
        Object.entries(useStore.getState().upgrade_levels).map(([id, val]) => [`${id} - Upg`, val])
      ),
      external_upgrades: useStore.getState().raw_external_import || {}
    };

    // Trigger browser download
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 4));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "player_state.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

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
          
          <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center transition-colors duration-200 ${
              isDragging 
                ? 'border-st-orange bg-orange-50/50' 
                : 'border-gray-300 hover:border-st-orange bg-st-bg'
            }`}
          >
            <div className="text-4xl mb-2 opacity-50">📄</div>
            <p className="text-st-text font-medium mb-1">Drag and drop file here</p>
            <p className="text-st-text-light text-sm mb-4">Limit 200MB per file • JSON</p>
            
            <label className="cursor-pointer bg-st-bg text-st-text border border-st-border rounded px-4 py-2 hover:border-st-orange hover:text-st-orange transition-colors font-medium text-sm shadow-sm">
              Browse files
              <input 
                type="file" 
                accept=".json" 
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* --- 3. EXPORT DATA --- */}
        <div className="st-container">
          <h3 className="font-bold mb-4 flex items-center gap-2">💾 Export Data</h3>
          <p className="text-sm text-st-text-light mb-4">Download your current UI configuration.</p>
          <button 
            onClick={handleExport}
            className="w-full px-4 py-2 bg-st-secondary text-st-text border border-st-border rounded hover:border-st-orange transition-colors font-medium shadow-sm cursor-pointer"
          >
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

        {/* --- TAB: UPGRADES --- */}
        {activeSubTab === 'upgrades' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold">Internal Upgrades</h3>
              <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                <input type="checkbox" checked={hideMaxed} onChange={(e) => setHideMaxed(e.target.checked)} className="w-4 h-4 accent-st-orange" />
                👀 Hide Maxed Upgrades
              </label>
            </div>
            <hr className="border-st-border mb-6" />

            {/* In Streamlit we centered this via ratio. In React we can use a centered responsive grid. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(INTERNAL_UPGRADE_CAPS).map(([upg_id, max_lvl]) => {
                const id = parseInt(upg_id);
                if (!asc1_unlocked && ASC1_LOCKED_UPGS.includes(id)) return null;
                if (!asc2_unlocked && ASC2_LOCKED_UPGS.includes(id)) return null;
                
                const current_lvl = upgrade_levels[id] || 0;
                if (hideMaxed && current_lvl >= max_lvl) return null;

                const name = UPGRADE_NAMES[id] || `Upgrade ${id}`;

                return (
                  <div key={id} className="st-container flex flex-col items-center justify-center p-4">
                    <div className="text-center mb-2 h-10 flex flex-col justify-end">
                      <span className="font-bold text-sm">{name}</span>
                      <span className="text-xs text-st-text-light">(Max: {max_lvl})</span>
                    </div>
                    
                    <div className="w-full flex justify-center mb-4">
                      <img 
                        src={`/assets/upgrades/internal/${id}.png`} 
                        alt={name}
                        className="w-full max-w-[120px] object-contain"
                        style={{ imageRendering: 'pixelated' }}
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    </div>

                    <input 
                      type="number" 
                      className="st-input"
                      value={current_lvl}
                      onChange={(e) => setUpgradeLevel(id, e.target.value)}
                      min="0"
                      max={max_lvl}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* --- TAB: CARDS --- */}
        {activeSubTab === 'cards' && (
          <div>
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <img src="/assets/cards/cores/div1.png" alt="icon" className="w-8 h-8" style={{ imageRendering: 'pixelated' }} onError={(e) => e.target.style.display = 'none'}/>
              Block Card Collection
            </h3>
            <hr className="border-st-border mb-6" />

            {/* Responsive grid: 3 cols on mobile, 6 on tablet, 9 on desktop! */}
            <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-9 gap-2">
              {CARD_TYPES.map(o_type => {
                return[1, 2, 3, 4].map(tier_num => {
                  const card_id = `${o_type}${tier_num}`;
                  
                  // Lock logic identical to Streamlit
                  let is_locked = false;
                  if (tier_num === 4 && !asc2_unlocked) is_locked = true;
                  if (o_type === 'div' && !asc1_unlocked) is_locked = true;

                  const user_tier = cards[card_id] || 0;
                  const max_card_level = asc1_unlocked ? 4 : 3;

                  return (
                    <div key={card_id} className={`st-container p-2 flex flex-col items-center ${is_locked ? 'opacity-40' : ''}`}>
                      <div className="font-bold text-xs mb-2 capitalize">{card_id}</div>
                      
                      {/* CSS Magic: Overlaying background and core instantly */}
                      <div className="relative mb-3 flex items-center justify-center" style={{ width: UI_BLOCK_CARD_WIDTH * 0.6, height: UI_BLOCK_CARD_WIDTH * 0.8 }}>
                        {user_tier > 0 && !is_locked ? (
                          <>
                            <img src={`/assets/cards/backgrounds/${user_tier}.png`} className="absolute inset-0 w-full h-full object-contain" style={{ imageRendering: 'pixelated' }} />
                            <img src={`/assets/cards/cores/${card_id}.png`} className="absolute inset-0 w-full h-full object-contain drop-shadow-md" style={{ imageRendering: 'pixelated', transform: 'translate(1px, -4px)' }} />
                          </>
                        ) : (
                          <div className="text-xs text-st-text-light mt-4">(Locked)</div>
                        )}
                      </div>

                      <input 
                        type="number" 
                        className="st-input p-1 text-sm"
                        value={is_locked ? 0 : user_tier}
                        onChange={(e) => setCardLevel(card_id, e.target.value)}
                        min="0"
                        max={max_card_level}
                        disabled={is_locked}
                      />
                    </div>
                  );
                });
              })}
            </div>
          </div>
        )}

        {/* --- TAB: IDOLS --- */}
        {activeSubTab === 'idols' && (
          <div className="st-container text-center text-st-text-light py-10">
            🚧 Arch Idols coming soon...
          </div>
        )}

      </div>
    </div>
  );
}
