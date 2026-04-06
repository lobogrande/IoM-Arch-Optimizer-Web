import { useState, useMemo } from 'react';
import useStore from '../store';
import { 
  UI_STAT_IMG_WIDTH, UI_BLOCK_CARD_WIDTH, 
  UI_BLOCK_CARD_X_OFFSET, UI_BLOCK_CARD_Y_OFFSET, 
  UI_EXT_IMG_STD, UI_EXT_SKILL_ICON, UI_EXT_SKILL_TEXT,
  UI_EXT_CARD_CBLOCK_X_OFFSET, UI_EXT_CARD_CBLOCK_Y_OFFSET,
  UI_CARD_CBLOCK_SCALE
} from '../ui_config';
import { INTERNAL_UPGRADE_CAPS, UPGRADE_NAMES, ASC1_LOCKED_UPGS, ASC2_LOCKED_UPGS, CARD_TYPES, EXTERNAL_UI_GROUPS, UPGRADE_LEVEL_REQS } from '../game_data';

export default function PlayerSetup() {
  const { asc1_unlocked, asc2_unlocked, arch_level, current_max_floor, base_stats, upgrade_levels, external_levels, cards, arch_ability_infernal_bonus, total_infernal_cards, geoduck_unlocked, calculated_stats, setSetting, setBaseStat, setUpgradeLevel, setCardLevel, setExternalGroup, loadStateFromJson, setSandboxStat, hideMaxed, setHideMaxed, activeSubTab, setActiveSubTab, upgradeView, setUpgradeView, profiles, activeProfileId, createProfile, loadProfile, saveToProfile, renameProfile, deleteProfile } = useStore();
  const [isDragging, setIsDragging] = useState(false);

  // Deep equality check: Compares the active workspace to the saved profile snapshot
  const hasUnsavedChanges = useMemo(() => {
    if (!activeProfileId || profiles.length === 0) return false;
    const active = profiles.find(p => p.id === activeProfileId);
    if (!active) return false;

    const isEq = (a, b) => {
      const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
      for (const k of keys) if (Number(a[k] || 0) !== Number(b[k] || 0)) return false;
      return true;
    };

    if (asc1_unlocked !== active.data.asc1_unlocked) return true;
    if (asc2_unlocked !== active.data.asc2_unlocked) return true;
    if (arch_level !== active.data.arch_level) return true;
    if (current_max_floor !== active.data.current_max_floor) return true;
    if (!!geoduck_unlocked !== !!active.data.geoduck_unlocked) return true;
    if (parseFloat(arch_ability_infernal_bonus || 0) !== parseFloat(active.data.arch_ability_infernal_bonus || 0)) return true;
    if ((total_infernal_cards || 0) !== (active.data.total_infernal_cards || 0)) return true;
    if (!isEq(base_stats, active.data.base_stats)) return true;
    if (!isEq(upgrade_levels, active.data.upgrade_levels)) return true;
    if (!isEq(external_levels, active.data.external_levels)) return true;
    if (!isEq(cards, active.data.cards)) return true;
    
    return false;
  },[ activeProfileId, profiles, asc1_unlocked, asc2_unlocked, arch_level, current_max_floor, geoduck_unlocked, arch_ability_infernal_bonus, total_infernal_cards, base_stats, upgrade_levels, external_levels, cards ]);

  // Add Arch Level and Internal Upgrade #12 (Stat Points) to get total budget
  const total_allowed = (parseInt(arch_level) || 1) + (upgrade_levels[12] || 0); 
  const current_allocated = Object.values(base_stats).reduce((a, b) => a + b, 0);
  const remaining = total_allowed - current_allocated;

  const cap_inc = (parseInt(upgrade_levels[45]) || 0) * 5;
  const STAT_CAPS = { 
    Str: 50 + cap_inc, 
    Agi: 50 + cap_inc, 
    Per: 25 + cap_inc, 
    Int: 25 + cap_inc, 
    Luck: 25 + cap_inc, 
    Div: 10 + cap_inc, 
    Corr: 10 + cap_inc 
  };

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
    e.target.value = null; 
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
    const state = useStore.getState();

    // 1. Format Internal Upgrades with full names (Export ALL, default to 0)
    const internal_upgrades = {};
    Object.keys(INTERNAL_UPGRADE_CAPS).forEach((idStr) => {
      const id = parseInt(idStr);
      const val = state.upgrade_levels[id] || 0;
      const name = UPGRADE_NAMES[id] || "Upg";
      internal_upgrades[`${id} - ${name}`] = val;
    });

    // 2. Format External Upgrades back to string keys
    const external_upgrades = {};
    EXTERNAL_UI_GROUPS.forEach(group => {
      external_upgrades[group.name] = state.external_levels[group.rows[0]] || 0;
    });
    external_upgrades["Geoduck Unlocked"] = !!state.geoduck_unlocked;
    external_upgrades["Arch Ability Infernal Bonus"] = parseFloat(state.arch_ability_infernal_bonus) / 100.0 || 0.0;

    // 3. Strictly Order Cards (Dirt1 -> Div4) (Export ALL, default to 0)
    const ordered_cards = {};
    CARD_TYPES.forEach(ot => {
      [1, 2, 3, 4].forEach(tier => {
        const cid = `${ot}${tier}`;
        ordered_cards[cid] = state.cards[cid] || 0;
      });
    });

    const exportData = {
      settings: {
        asc1_unlocked: state.asc1_unlocked,
        asc2_unlocked: state.asc2_unlocked,
        arch_level: state.arch_level,
        current_max_floor: state.current_max_floor,
        total_infernal_cards: state.total_infernal_cards
      },
      base_stats: state.base_stats,
      internal_upgrades: internal_upgrades,
      external_upgrades: external_upgrades,
      cards: ordered_cards,
      profiles: state.profiles,
      activeProfileId: state.activeProfileId
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 4));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "player_state.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const renderStat = (label, statKey) => {
    if (statKey === 'Div' && !asc1_unlocked) return null;
    if (statKey === 'Corr' && !asc2_unlocked) return null;

    return (
      <div className="st-container flex flex-col items-center justify-center p-4">
        <div className="text-center mb-2">
          <span className="font-bold">{label}</span><br/>
          <span className="text-sm text-st-text-light">(Max: {STAT_CAPS[statKey]})</span>
        </div>
        
        {/* Upscaled responsive sizing: 112px mobile, 128px tablet, 192px desktop, 224px large desktop (matches original 220px) */}
        <div className="w-28 sm:w-32 md:w-48 lg:w-56 flex items-center justify-center mb-4 mx-auto">
          <img 
            src={`/assets/stats/${statKey.toLowerCase()}.png`} 
            alt={label}
            className="w-full h-full object-contain"
            style={{ imageRendering: 'pixelated' }}
            onError={(e) => { e.target.style.display = 'none'; e.target.parentNode.innerHTML = '<span class="text-xs text-gray-400">No Img</span>'; }}
          />
        </div>

        <input 
          type="number"
          className="st-input"
          value={base_stats[statKey] !== undefined ? base_stats[statKey] : 0}
          onFocus={(e) => e.target.select()}
          onChange={(e) => setBaseStat(statKey, e.target.value === '' ? '' : parseInt(e.target.value))}
          onBlur={(e) => setBaseStat(statKey, Math.min(STAT_CAPS[statKey], Math.max(0, parseInt(e.target.value) || 0)))}
        />
        <div className="flex flex-wrap justify-center gap-1 mt-2 w-full">
          <button onClick={() => setBaseStat(statKey, Math.max(0, (base_stats[statKey] || 0) - 5))} className="flex-1 px-1 py-1 text-xs bg-st-secondary text-st-text rounded border border-st-border hover:border-st-orange transition-colors">-5</button>
          <button onClick={() => setBaseStat(statKey, Math.min(STAT_CAPS[statKey], (base_stats[statKey] || 0) + 5))} className="flex-1 px-1 py-1 text-xs bg-st-secondary text-st-text rounded border border-st-border hover:border-st-orange transition-colors">+5</button>
          <button onClick={() => setBaseStat(statKey, STAT_CAPS[statKey])} className="flex-1 px-1 py-1 text-xs font-bold bg-st-secondary text-st-text rounded border border-st-border hover:border-st-orange transition-colors">Max</button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col md:flex-row gap-6">
      
      {/* LEFT COLUMN: Global Settings & Data Sync */}
      <div className="w-full md:w-1/4 flex flex-col gap-4">

        <div className="st-container">
          <h3 className="font-bold mb-4 flex items-center justify-between">
            <span className="flex items-center gap-2">👤 Player Profiles</span>
            {hasUnsavedChanges && <span className="text-[10px] bg-st-orange text-[#2b2b2b] px-2 py-0.5 rounded font-bold uppercase shadow-sm">Unsaved</span>}
          </h3>
          
          <div className="mb-4">
            <select
              className="w-full st-input font-bold"
              value={activeProfileId || ""}
              onChange={(e) => {
                if (e.target.value) loadProfile(e.target.value);
              }}
            >
              <option value="" disabled>{profiles.length === 0 ? "No profiles saved" : "Select a profile..."}</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-2">
            <button 
              onClick={() => {
                const name = window.prompt("Enter a name for this new profile:");
                if (name && name.trim()) createProfile(name.trim().substring(0, 40));
              }} 
              className="py-2 bg-st-secondary border border-st-border text-st-text text-xs font-bold rounded hover:border-st-orange transition-colors shadow-sm"
            >
              ➕ New Profile
            </button>
            
            <button 
              onClick={() => {
                if (!activeProfileId) return alert("Select a profile first!");
                if (window.confirm("Overwrite this profile with your current active setup?")) {
                  saveToProfile(activeProfileId);
                }
              }} 
              disabled={!activeProfileId || !hasUnsavedChanges} 
              className={`py-2 text-xs font-bold rounded transition-colors shadow-sm ${
                hasUnsavedChanges 
                  ? 'bg-[#2b2b2b] border border-st-orange text-st-orange hover:bg-st-orange hover:text-[#2b2b2b]' 
                  : 'bg-st-secondary border border-st-border text-st-text-light opacity-50 cursor-not-allowed'
              }`}
            >
              💾 Update Loadout
            </button>
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <button 
              onClick={() => {
                if (!activeProfileId) return;
                const p = profiles.find(x => x.id === activeProfileId);
                const newName = window.prompt("Rename profile:", p.name);
                if (newName && newName.trim()) renameProfile(activeProfileId, newName.trim().substring(0, 40));
              }} 
              disabled={!activeProfileId} 
              className="py-2 bg-st-secondary border border-st-border text-st-text text-xs font-bold rounded hover:border-st-orange transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ✏️ Rename
            </button>
            
            <button 
              onClick={() => {
                if (!activeProfileId) return;
                if (window.confirm("Delete this profile forever?")) deleteProfile(activeProfileId);
              }} 
              disabled={!activeProfileId} 
              className="py-2 bg-st-secondary border border-red-900 text-red-400 text-xs font-bold rounded hover:bg-red-900 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              🗑️ Delete
            </button>
          </div>
        </div>
        
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
            <input 
              type="number" className="st-input" 
              value={arch_level} 
              onFocus={(e) => e.target.select()}
              onChange={(e) => setSetting('arch_level', e.target.value === '' ? '' : parseInt(e.target.value))}
              onBlur={(e) => setSetting('arch_level', Math.max(1, parseInt(e.target.value) || 1))}
            />
          </div>

          <div>
            <label className="text-sm text-st-text-light block mb-1">Max Floor Reached</label>
            <input 
              type="number" className="st-input" 
              value={current_max_floor} 
              onFocus={(e) => e.target.select()}
              onChange={(e) => setSetting('current_max_floor', e.target.value === '' ? '' : parseInt(e.target.value))}
              onBlur={(e) => setSetting('current_max_floor', Math.max(1, parseInt(e.target.value) || 1))}
            />
          </div>
        </div>

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

        <div className="st-container">
          <h3 className="font-bold mb-4 flex items-center gap-2">💾 Export Data</h3>
          <p className="text-sm text-st-text-light mb-4">Download your current Player Setup.</p>
          <button 
            onClick={handleExport}
            className="w-full px-4 py-2 bg-st-secondary text-st-text border border-st-border rounded hover:border-st-orange transition-colors font-medium shadow-sm cursor-pointer"
          >
            📥 Download JSON
          </button>
        </div>

      </div>

      {/* RIGHT COLUMN: Setup Data Sub-Tabs */}
      <div className="w-full md:w-3/4">
        
        <div className="flex border-b border-st-border mb-4">
          {['📊 Base Stats', '⬆️ Upgrades', '🎴 Block Cards', '🗿 Arch Idols'].map((tab, idx) => {
            const tabId =['stats', 'upgrades', 'cards', 'idols'][idx];
            const isActive = activeSubTab === tabId;
            return (
              <button key={tabId} onClick={() => setActiveSubTab(tabId)}
                className={`px-4 py-2 font-medium border-b-2 transition-colors ${isActive ? 'border-st-orange text-st-text' : 'border-transparent text-st-text hover:text-st-orange hover:border-gray-300'}`}>
                {tab}
              </button>
            )
          })}
        </div>

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

            <div className="flex flex-col md:flex-row gap-2 mt-6">
              <button 
                onClick={(e) => {['Str', 'Agi', 'Per', 'Int', 'Luck', 'Div', 'Corr'].forEach(s => {
                    if (setSandboxStat) setSandboxStat(s, base_stats[s] || 0);
                  });
                  const btn = e.target;
                  const originalText = btn.innerText;
                  btn.innerText = "✅ Sent to Sandbox!";
                  setTimeout(() => { btn.innerText = originalText; }, 2000);
                }}
                className="flex-1 py-2 bg-[#2b2b2b] border border-st-orange text-st-orange font-bold rounded hover:bg-st-orange hover:text-[#2b2b2b] transition-colors"
              >
                🧪 Send to Sandbox
              </button>
              
              <div className="flex flex-1 gap-2">
                <button 
                  onClick={() => {
                    const statsToTransfer = {};['Str', 'Agi', 'Per', 'Int', 'Luck', 'Div', 'Corr'].forEach(s => statsToTransfer[s] = base_stats[s] || 0);
                    setSetting('duelStatsA', statsToTransfer);
                    alert("✅ Sent to Duel (Build A)");
                  }}
                  className="flex-1 py-2 bg-[#2b2b2b] border border-blue-500 text-blue-400 font-bold rounded hover:bg-blue-900 hover:text-white transition-colors"
                >
                  ⚔️ Duel (A)
                </button>
                <button 
                  onClick={() => {
                    const statsToTransfer = {};['Str', 'Agi', 'Per', 'Int', 'Luck', 'Div', 'Corr'].forEach(s => statsToTransfer[s] = base_stats[s] || 0);
                    setSetting('duelStatsB', statsToTransfer);
                    alert("✅ Sent to Duel (Build B)");
                  }}
                  className="flex-1 py-2 bg-[#2b2b2b] border border-st-orange text-st-orange font-bold rounded hover:bg-st-orange hover:text-[#2b2b2b] transition-colors"
                >
                  ⚔️ Duel (B)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* --- TAB: UPGRADES --- */}
        {activeSubTab === 'upgrades' && (
          <div>
            <div className="flex flex-col gap-4 mb-4">
              
              <div className="flex bg-st-secondary rounded-lg p-1 w-fit border border-st-border">
                <button onClick={() => setUpgradeView('internal')} className={`px-4 py-1 text-sm font-bold rounded-md transition-colors ${upgradeView === 'internal' ? 'bg-st-bg text-st-text shadow-sm' : 'text-st-text-light hover:text-st-text'}`}>Internal</button>
                <button onClick={() => setUpgradeView('external')} className={`px-4 py-1 text-sm font-bold rounded-md transition-colors ${upgradeView === 'external' ? 'bg-st-bg text-st-text shadow-sm' : 'text-st-text-light hover:text-st-text'}`}>External</button>
              </div>
              
              {upgradeView === 'internal' && (
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setHideMaxed(!hideMaxed)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none ${hideMaxed ? 'bg-st-orange' : 'bg-gray-300'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 shadow-sm ${hideMaxed ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                  <span 
                    className="text-sm font-medium cursor-pointer select-none" 
                    onClick={() => setHideMaxed(!hideMaxed)}
                  >
                    👀 Hide Maxed Upgrades
                  </span>
                </div>
              )}
              
            </div>
            <hr className="border-st-border mb-6" />

            {upgradeView === 'internal' && (
              <div className="w-full md:w-1/2 lg:w-1/3 mx-auto flex flex-col gap-4">
                {Object.entries(INTERNAL_UPGRADE_CAPS).map(([upg_id, max_lvl]) => {
                  const id = parseInt(upg_id);
                  if (!asc1_unlocked && ASC1_LOCKED_UPGS.includes(id)) return null;
                  if (!asc2_unlocked && ASC2_LOCKED_UPGS.includes(id)) return null;
                  
                 const currentFloor = Number(current_max_floor) || 1;
                  if (currentFloor < (UPGRADE_LEVEL_REQS[id] || 0)) return null;
                  
                  const current_lvl = upgrade_levels[id] ?? 0;
                  if (hideMaxed && current_lvl >= max_lvl) return null;

                  const name = UPGRADE_NAMES[id] || `Upgrade ${id}`;

                  return (
                    <div key={id} className="st-container flex flex-col items-center justify-center p-4">
                      <div className="text-center mb-2">
                        <span className="font-bold text-sm">{name}</span><br/>
                        <span className="text-xs text-st-text-light">(Max: {max_lvl})</span>
                      </div>
                      
                      <div className="w-full flex justify-center mb-4">
                        <img 
                          src={`/assets/upgrades/internal/${id}.png`} 
                          alt={name}
                          className="w-full h-auto object-contain"
                          style={{ imageRendering: 'pixelated' }}
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                      </div>

                      <input 
                        type="number"
                        className="st-input"
                        value={current_lvl}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setUpgradeLevel(id, e.target.value === '' ? '' : parseInt(e.target.value))}
                        onBlur={(e) => setUpgradeLevel(id, Math.min(max_lvl, Math.max(0, parseInt(e.target.value) || 0)))}
                      />
                      <div className="flex flex-wrap justify-center gap-1 mt-2 w-full">
                        <button onClick={() => setUpgradeLevel(id, Math.max(0, current_lvl - 5))} className="flex-1 px-1 py-1 text-xs bg-st-secondary text-st-text rounded border border-st-border hover:border-st-orange transition-colors">-5</button>
                        <button onClick={() => setUpgradeLevel(id, Math.min(max_lvl, current_lvl + 5))} className="flex-1 px-1 py-1 text-xs bg-st-secondary text-st-text rounded border border-st-border hover:border-st-orange transition-colors">+5</button>
                        <button onClick={() => setUpgradeLevel(id, max_lvl)} className="flex-1 px-1 py-1 text-xs font-bold bg-st-secondary text-st-text rounded border border-st-border hover:border-st-orange transition-colors">Max</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {upgradeView === 'external' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {EXTERNAL_UI_GROUPS.map((group) => {
                  if (group.id === 'hestia' || group.id === 'hades') return null; 
                  const current_val = external_levels[group.rows[0]] ?? 0;
                  
                  return (
                    <div key={group.id} className="st-container flex flex-col items-center justify-between p-4 text-center">
                      <span className="font-bold text-sm mb-4">{group.name}</span>
                      
                      <div className="flex flex-col items-center justify-center flex-grow mb-4 gap-2">
                        {group.ui_type === 'skill' && group.imgs?.map((img, i) => (
                          <img key={i} src={`/assets/upgrades/external/${img}`} alt={group.name} style={{ imageRendering: 'pixelated', width: i === 0 ? UI_EXT_SKILL_ICON : UI_EXT_SKILL_TEXT }} onError={(e) => e.target.style.display = 'none'} />
                        ))}
                        {group.img && (
                          <img src={`/assets/upgrades/external/${group.img}`} alt={group.name} style={{ imageRendering: 'pixelated', width: UI_EXT_IMG_STD }} onError={(e) => e.target.style.display = 'none'} />
                        )}
                        {group.ui_type === 'card' && current_val > 0 && (
                          <div className="relative flex items-center justify-center" style={{ width: UI_BLOCK_CARD_WIDTH * 0.8, height: UI_BLOCK_CARD_WIDTH * 1.0 }}>
                            <img src={`/assets/cards/backgrounds/${current_val}.png`} className="absolute inset-0 w-full h-full object-contain" style={{ imageRendering: 'pixelated' }} />
                            <img src={`/assets/cards/cores/20_Misc_Arch_Ability_face.png`} className="absolute inset-0 w-full h-full object-contain drop-shadow-md" style={{ imageRendering: 'pixelated', transform: `translate(${UI_EXT_CARD_CBLOCK_X_OFFSET}px, ${UI_EXT_CARD_CBLOCK_Y_OFFSET}px) scale(${UI_CARD_CBLOCK_SCALE})` }} onError={(e) => e.target.style.display = 'none'}/>
                          </div>
                        )}
                        {group.ui_type === 'card' && current_val === 0 && <span className="text-xs text-st-text-light">(Card Not Unlocked)</span>}
                        {group.ui_type === 'pet' && current_val === -1 && <span className="text-xs text-st-text-light">Status: Not Owned</span>}
                        
                        {group.id === 'geoduck' && (
                          <>
                            <label className="flex items-start gap-2 cursor-pointer font-bold mb-1 text-xs mt-2 text-left leading-tight">
                              <input type="checkbox" checked={geoduck_unlocked} onChange={(e) => setSetting('geoduck_unlocked', e.target.checked)} className="w-4 h-4 accent-st-orange shrink-0 mt-0.5" />
                              <span>Geoduck Leg Fish T1 Tribute Completed</span>
                            </label>
                            <span className="text-xs text-st-text-light mt-1 text-center">Enter Number of Mythic Chests Opened</span>
                          </>
                        )}
                      </div>

                      {(group.ui_type === 'number' || group.ui_type === 'pet' || group.ui_type === 'card') && (
                        <input 
                          type="number"
                          className={`st-input ${group.id === 'geoduck' && !geoduck_unlocked ? 'opacity-30 cursor-not-allowed' : ''}`} 
                          value={current_val} 
                          disabled={group.id === 'geoduck' && !geoduck_unlocked} 
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => setExternalGroup(group.rows, e.target.value === '' ? '' : parseInt(e.target.value))} 
                          onBlur={(e) => setExternalGroup(group.rows, Math.min(group.max !== undefined ? group.max : 9999, Math.max(group.ui_type === 'pet' ? -1 : 0, parseInt(e.target.value) || 0)))}
                        />
                      )}
                      
                      {(group.ui_type === 'skill' || group.ui_type === 'bundle') && (
                        <label className="flex items-center gap-2 cursor-pointer font-medium mt-2">
                          <input type="checkbox" checked={current_val === 1} onChange={(e) => setExternalGroup(group.rows, e.target.checked ? 1 : 0)} className="w-4 h-4 accent-st-orange" />
                          Unlocked
                        </label>
                      )}

                      {/* Arch Ability Infernal Bonus Special UI */}
                      {group.id === 'arch_card' && current_val === 4 && (
                        <div className="mt-4 w-full">
                          <span className="text-xs font-bold text-st-red mb-1 block">Infernal Cooldown Bonus %</span>
                          <input 
                            type="text" 
                            className="st-input" 
                            value={arch_ability_infernal_bonus} 
                            onChange={(e) => {
                              let val = e.target.value.replace('+', '');
                              if (val !== "" && val !== "-" && !val.startsWith('-')) {
                                val = '-' + val;
                              }
                              setSetting('arch_ability_infernal_bonus', val);
                            }} 
                            onBlur={(e) => {
                              let val = parseFloat(e.target.value);
                              if (isNaN(val)) val = 0;
                              if (val > 0) val = -val;
                              setSetting('arch_ability_infernal_bonus', val.toString());
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeSubTab === 'cards' && (
          <div>
            
            {/* INFERNAL CARDS UI HEADER */}
            <div className="st-container mb-6 flex flex-col sm:flex-row gap-4 items-center bg-st-secondary/50">
              <div className="w-full sm:w-1/2">
                <label className="font-bold text-sm block mb-1">Total Infernal Cards (Global)</label>
                <span className="text-xs text-st-text-light block mb-2 leading-tight">Sum of all Infernal cards you own across all categories (Archaeology, Fishing, etc). Used for the Infernal Multiplier.</span>
                <input 
                  type="number"
                  className="st-input bg-st-bg" 
                  value={total_infernal_cards} 
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setSetting('total_infernal_cards', e.target.value === '' ? '' : parseInt(e.target.value))}
                  onBlur={(e) => setSetting('total_infernal_cards', Math.max(0, parseInt(e.target.value) || 0))}
                />
              </div>
              <div className="w-full sm:w-1/2 sm:border-l border-st-border sm:pl-6 text-center sm:text-left">
                <span className="text-sm font-bold block mb-1">🔥 Infernal Arch Card Bonus</span>
                <span className="text-lg font-bold text-st-orange">
                  {calculated_stats?.infernal_multiplier ? `${Number(calculated_stats.infernal_multiplier).toLocaleString(undefined, {minimumFractionDigits: 4, maximumFractionDigits: 4})}x` : "(Calculating...)"}
                </span>
              </div>
            </div>

            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <img src="/assets/cards/cores/div1.png" alt="icon" className="w-8 h-8" style={{ imageRendering: 'pixelated' }} onError={(e) => e.target.style.display = 'none'}/>
              Block Card Collection
            </h3>
            <hr className="border-st-border mb-6" />

            <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-9 gap-2">
              {CARD_TYPES.map(o_type => {
                return[1, 2, 3, 4].map(tier_num => {
                  const card_id = `${o_type}${tier_num}`;
                  let is_locked = false;
                  if (tier_num === 4 && !asc2_unlocked) is_locked = true;
                  if (o_type === 'div' && !asc1_unlocked) is_locked = true;

                  const user_tier = cards[card_id] ?? 0;
                  const max_card_level = asc1_unlocked ? 4 : 3;

                  return (
                    <div key={card_id} className={`st-container p-2 flex flex-col items-center ${is_locked ? 'opacity-40' : ''}`}>
                      <div className="font-bold text-xs mb-2 capitalize">{card_id}</div>
                      
                      <div className="relative mb-3 flex items-center justify-center" style={{ width: UI_BLOCK_CARD_WIDTH * 0.6, height: UI_BLOCK_CARD_WIDTH * 0.8 }}>
                        {user_tier > 0 && !is_locked ? (
                          <>
                            <img src={`/assets/cards/backgrounds/${user_tier}.png`} className="absolute inset-0 w-full h-full object-contain" style={{ imageRendering: 'pixelated' }} />
                            <img src={`/assets/cards/cores/${card_id}.png`} className="absolute inset-0 w-full h-full object-contain drop-shadow-md" style={{ imageRendering: 'pixelated', transform: `translate(${UI_BLOCK_CARD_X_OFFSET}px, ${UI_BLOCK_CARD_Y_OFFSET}px) scale(${UI_CARD_CBLOCK_SCALE})` }} />
                          </>
                        ) : (
                          <div className="text-xs text-st-text-light mt-4">(Locked)</div>
                        )}
                      </div>

                      <input 
                        type="number"
                        className="st-input p-1 text-sm"
                        value={is_locked ? 0 : user_tier}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setCardLevel(card_id, e.target.value === '' ? '' : parseInt(e.target.value))}
                        onBlur={(e) => setCardLevel(card_id, Math.min(max_card_level, Math.max(0, parseInt(e.target.value) || 0)))}
                        disabled={is_locked}
                      />
                    </div>
                  );
                });
              })}
            </div>
          </div>
        )}

        {activeSubTab === 'idols' && (
          <div>
            <div className="text-center mb-6">
              <h3 className="text-2xl font-bold mb-2">🗿 Arch Idols</h3>
              <p className="text-st-text-light">Manage your Early/Late-Game Asc1 Idols here.</p>
            </div>
            
            {!asc1_unlocked ? (
              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 dark:text-yellow-200 border-l-4 border-yellow-400 text-yellow-700 rounded mb-6">
                🔒 Arch Idols important for the simulator are locked until Ascension 1.
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-6 justify-start">
                <div className="st-container flex flex-col items-center justify-between p-4 w-full sm:w-64">
                  <span className="font-bold mb-4">Hestia Idol</span>
                  <div className="w-full flex justify-center mb-4">
                    <img src="/assets/upgrades/idols/hestia_idol.png" alt="Hestia" className="h-auto object-contain" style={{ width: UI_EXT_IMG_STD, imageRendering: 'pixelated' }} onError={(e) => e.target.style.display = 'none'} />
                  </div>
                  <div className="w-full">
                    <hr className="border-st-border mb-4"/>
                    <input 
                      type="number" className="st-input" 
                      value={external_levels[4] !== undefined ? external_levels[4] : 0} 
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setExternalGroup([4], e.target.value === '' ? '' : parseInt(e.target.value))} 
                      onBlur={(e) => setExternalGroup([4], Math.min(3000, Math.max(0, parseInt(e.target.value) || 0)))}
                    />
                  </div>
                </div>

                <div className="st-container flex flex-col items-center justify-between p-4 w-full sm:w-64">
                  <span className="font-bold mb-4">Hades Idol</span>
                  <div className="w-full flex justify-center mb-4">
                    <img src="/assets/upgrades/idols/hades_idol.png" alt="Hades" className="h-auto object-contain" style={{ width: UI_EXT_IMG_STD, imageRendering: 'pixelated' }} onError={(e) => e.target.style.display = 'none'} />
                  </div>
                  <div className="w-full">
                    <hr className="border-st-border mb-4"/>
                    <input 
                      type="number" className="st-input" 
                      value={external_levels[21] !== undefined ? external_levels[21] : 0} 
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setExternalGroup([21], e.target.value === '' ? '' : parseInt(e.target.value))}
                      onBlur={(e) => setExternalGroup([21], Math.min(6666, Math.max(0, parseInt(e.target.value) || 0)))}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}