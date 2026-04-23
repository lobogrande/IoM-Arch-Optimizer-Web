// src/components/simulations/ResultsDashboard.jsx
import { useState } from 'react';
import useStore from '../../store';
import { EngineWorkerPool } from '../../utils/optimizer';
import PlotWrapper from 'react-plotly.js';
import { INTERNAL_UPGRADE_CAPS, UPGRADE_NAMES, ASC1_LOCKED_UPGS, ASC2_LOCKED_UPGS, UPGRADE_LEVEL_REQS, EXTERNAL_UI_GROUPS, calculateUpgradeCost, CURRENCY_TYPES } from '../../game_data';
import { UI_BLOCK_CARD_WIDTH, UI_BLOCK_CARD_X_OFFSET, UI_BLOCK_CARD_Y_OFFSET, UI_CARD_CBLOCK_SCALE } from '../../ui_config';

const Plot = PlotWrapper.default || PlotWrapper;

const FRAG_NAMES = {
  0: "Dirt", 1: "Common", 2: "Rare", 3: "Epic", 4: "Legendary", 5: "Mythic", 6: "Divine"
};

const ORE_MIN_FLOORS = {
  'dirt1': 1, 'com1': 1, 'rare1': 3, 'epic1': 6, 'leg1': 12, 'myth1': 20, 'div1': 50,
  'dirt2': 12, 'com2': 18, 'rare2': 26, 'epic2': 30, 'leg2': 32, 'myth2': 36, 'div2': 75,
  'dirt3': 24, 'com3': 30, 'rare3': 36, 'epic3': 42, 'leg3': 45, 'myth3': 50, 'div3': 100,
  'dirt4': 81, 'com4': 96, 'rare4': 111, 'epic4': 126, 'leg4': 136, 'myth4': 141, 'div4': 150
};

export default function ResultsDashboard({ context }) {
  const store = useStore();
  
  const chartFontColor = store.theme === 'dark' ? '#A3A8B8' : '#7D808D';
  const chartGridColor = store.theme === 'dark' ? 'rgba(250,250,250,0.1)' : 'rgba(49,51,63,0.1)';

  const resTab = store.simResTab;
  const setResTab = store.setSimResTab;
  const dataTab = store.simDataTab;
  const setDataTab = store.setSimDataTab;

  const [curXp, setCurXp] = useState(0);
  const[tarXp, setTarXp] = useState(0);
  const[cardSelBlock, setCardSelBlock] = useState('');
  
  const[isRoiLoading, setIsRoiLoading] = useState(false);
  const [roiProgressMsg, setRoiProgressMsg] = useState("");
  const [roiUpgFilter, setRoiUpgFilter] = useState('All');
  const[roiPrecision, setRoiPrecision] = useState(15);

  // Derive bounds locally for this component
  const capInc = parseInt(store.upgrade_levels[45] || 0) * 5; 
  const dynamicBudget = parseInt(store.arch_level) + parseInt(store.upgrade_levels[12] || 0);

  const STAT_CAPS = {
    Str: 50 + capInc, Agi: 50 + capInc, Per: 25 + capInc, Int: 25 + capInc, Luck: 25 + capInc,
    Div: store.asc1_unlocked ? (10 + capInc) : 0, 
    Corr: store.asc2_unlocked ? (10 + capInc) : 0,
    Unassigned: dynamicBudget
  };

  const activeStats = [ 'Str', 'Agi', 'Per', 'Int', 'Luck' ];
  if (store.asc1_unlocked) activeStats.push('Div');
  if (store.asc2_unlocked) activeStats.push('Corr');

  if (!store.opt_results || !store.opt_results.final_summary_out) return null;
  const runMetric = store.opt_results.run_target_metric;
  const isFloorTarget = runMetric === 'highest_floor';
  const scaleScore = (v) => isFloorTarget ? v : (v / 60.0) * 1000.0;
  const unitLabel = isFloorTarget ? "Floor Reached" : "Yield per 1k Arch Secs";
  const finalSum = store.opt_results.final_summary_out;

  const innerTabs = [{ id: 'performance', label: '📈 Performance' }];
  if (!isFloorTarget) innerTabs.push({ id: 'cards', label: '🎴 Card Drops' });
  if (store.opt_results.show_loot) innerTabs.push({ id: 'loot', label: '🎒 Loot Breakdown' });
  if (store.opt_results.show_wall) innerTabs.push({ id: 'wall', label: '🧱 Progression Wall' });

  const avgMetrics = finalSum.avg_metrics || {};
  const availableBlocks = Object.keys(avgMetrics)
    .filter(k => k.startsWith("block_"))
    .map(k => k.replace("block_", "").replace("_per_min", ""))
    .sort();

  const scrollToAndHighlight = (elementId) => {
    setTimeout(() => {
      const el = document.getElementById(elementId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-4', 'ring-st-orange', 'transition-all', 'duration-300', 'rounded');
        setTimeout(() => el.classList.remove('ring-4', 'ring-st-orange', 'transition-all', 'duration-300', 'rounded'), 1500);
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 150);
  };

  const handleApplyStat = (stat) => {
    const current = store.base_stats[stat] || 0;
    store.setBaseStat(stat, current + 1);
    store.setActiveTab('setup');
    store.setActiveSubTab('stats');
    scrollToAndHighlight(`setup-stat-${stat}`);
  };

  const handleApplyUpgrade = (idStr) => {
    const id = parseInt(idStr);
    const current = store.upgrade_levels[id] || 0;
    store.setUpgradeLevel(id, current + 1);
    store.setActiveTab('setup');
    store.setActiveSubTab('upgrades_int');
    scrollToAndHighlight(`setup-upg-${id}`);
  };

  const handleApplyExternal = (groupId) => {
    const group = EXTERNAL_UI_GROUPS.find(g => g.id === groupId);
    if (!group) return;
    const current = store.external_levels[group.rows[0]] || 0;
    store.setExternalGroup(group.rows, current + 1);
    if (groupId === 'geoduck' && !store.geoduck_unlocked) {
      store.setSetting('geoduck_unlocked', true);
    }
    
    store.setActiveTab('setup');
    if (groupId === 'hestia' || groupId === 'hades') {
      store.setActiveSubTab('idols');
    } else {
      store.setActiveSubTab('upgrades_ext');
    }
    
    scrollToAndHighlight(`setup-ext-${groupId}`);
  };

  const handleApplyCard = (cardId) => {
    const current = store.cards[cardId] || 0;
    store.setCardLevel(cardId, current + 1);
    store.setActiveTab('setup');
    store.setActiveSubTab('cards');
    scrollToAndHighlight(`setup-card-${cardId}`);
  };

  const handleAnalyzeStats = async (contextType) => {
    setIsRoiLoading(true);
    setRoiProgressMsg(`Testing marginal stat values (${roiPrecision} sims each)...`);
    
    try {
      const pool = new EngineWorkerPool();
      await pool.init();
      const statResults = {};
      const promises = [ ];
      const targetMetric = store.opt_results.run_target_metric;
      const baseVal = store.opt_results.final_summary_out[targetMetric];
      const bestFinal = store.opt_results.best_final;
      
      const baseStateDict = {
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
      };

      await pool.syncState(baseStateDict);

      activeStats.forEach(stat => {
        const maxCap = STAT_CAPS[stat] || 99;
        if (bestFinal[stat] < maxCap) {
          statResults[stat] = { sum: 0, count: 0 };
          for (let i = 0; i < roiPrecision; i++) {
            const testStats = { ...bestFinal,[stat]: bestFinal[stat] + 1 };
            const p = pool.runTask(testStats).then(res => {
              statResults[stat].sum += (res[targetMetric] || 0);
              statResults[stat].count++;
            });
            promises.push(p);
          }
        }
      });

      if (promises.length > 0) {
        await Promise.all(promises);
        const finalRes = Object.keys(statResults).map(k => {
          const avg = statResults[k].sum / statResults[k].count;
          const gain = ((avg - baseVal) / 60.0) * 1000.0;
          return { stat: k, gain: gain };
        })
        .filter(r => r.gain > 0.001)
        .sort((a, b) => b.gain - a.gain);
        store.saveRoiToCurrentRun(contextType, 'roi_stats', finalRes);
      } else {
        alert("All stats are already maxed out! No further points can be tested.");
      }
      pool.terminate();
    } catch (err) {
      console.error(err);
      alert("ROI Analyzer failed: " + err.message);
    }
    setIsRoiLoading(false);
  };

  const handleAnalyzeUpgrades = async (contextType) => {
    setIsRoiLoading(true);
    setRoiProgressMsg(`Testing marginal upgrade values (${roiPrecision} sims each. This may take a minute)...`);
    
    try {
      const pool = new EngineWorkerPool();
      await pool.init();
      const upgResults = {};
      const promises = [ ];
      const targetMetric = store.opt_results.run_target_metric;
      const baseVal = store.opt_results.final_summary_out[targetMetric];
      const bestFinal = store.opt_results.best_final;

      const pureExpUpgs =[ 4, 11, 38 ];
      const pureLootUpgs =[ 5, 16, 27, 42 ];
      const pureEconUpgs =[ 4, 5, 11, 16, 19, 21, 27, 38, 42, 46 ];

      const baseStateDict = {
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
      };

      await pool.syncState(baseStateDict);

      Object.keys(INTERNAL_UPGRADE_CAPS || {}).forEach(upgIdStr => {
        const upgId = parseInt(upgIdStr);
        const currentLvl = store.upgrade_levels[upgId] || 0;
        const maxLvl = INTERNAL_UPGRADE_CAPS[upgId] || 99;

        if (!store.asc1_unlocked && ASC1_LOCKED_UPGS.includes(upgId)) return;
        if (!store.asc2_unlocked && ASC2_LOCKED_UPGS.includes(upgId)) return;
        
        if (targetMetric === "xp_per_min" && pureLootUpgs.includes(upgId)) return;
        if (targetMetric.includes("frag") && pureExpUpgs.includes(upgId)) return;
        if (targetMetric.includes("block") && pureEconUpgs.includes(upgId)) return;
        
        const currentFloor = Number(store.current_max_floor) || 1;
        if (currentFloor < (UPGRADE_LEVEL_REQS[upgId] || 0)) return;
        
        if (currentLvl >= maxLvl) return;

        const upgData = UPGRADE_NAMES && UPGRADE_NAMES[upgId];
        const upgName = upgData ? (Array.isArray(upgData) ? upgData[0] : upgData) : `Upg ${upgId}`;
        upgResults[upgId] = { sum: 0, count: 0, name: upgName, action: `Lvl ${currentLvl} ➔ ${currentLvl + 1}` };

        for (let i = 0; i < roiPrecision; i++) {
          const p = pool.runTask(bestFinal, {[upgId]: currentLvl + 1 }).then(res => {
            upgResults[upgId].sum += (res[targetMetric] || 0);
            upgResults[upgId].count++;
          });
          promises.push(p);
        }
      });

      if (promises.length > 0) {
        await Promise.all(promises);
        const ascTier = store.asc2_unlocked ? 2 : (store.asc1_unlocked ? 1 : 0);
        const finalRes = Object.keys(upgResults).map(k => {
          const avg = upgResults[k].sum / upgResults[k].count;
          const gain = ((avg - baseVal) / 60.0) * 1000.0;
          const currentLvl = store.upgrade_levels[k] || 0;
          const costData = calculateUpgradeCost(k, currentLvl + 1, ascTier);
          return { id: k, name: upgResults[k].name, gain: gain, action: upgResults[k].action, cost: costData };
        })
        .filter(r => r.gain > 0.001)
        .sort((a, b) => b.gain - a.gain);
        
        store.saveRoiToCurrentRun(contextType, 'roi_upgrades', finalRes);
      } else {
        alert("All internal upgrades are maxed out! No further upgrades can be tested.");
      }
      pool.terminate();
    } catch (err) {
      console.error(err);
      alert("ROI Analyzer failed: " + err.message);
    }
    setIsRoiLoading(false);
  };

  const handleAnalyzeExternal = async (contextType) => {
    setIsRoiLoading(true);
    setRoiProgressMsg(`Testing marginal external values (${roiPrecision} sims each. This may take a minute)...`);
    
    try {
      const pool = new EngineWorkerPool();
      await pool.init();
      const extResults = {};
      const promises = [ ];
      const targetMetric = store.opt_results.run_target_metric;
      const baseVal = store.opt_results.final_summary_out[targetMetric];
      const bestFinal = store.opt_results.best_final;

      const pureLootExts =[ 'hestia', 'axolotl', 'geoduck', 'arch_bundle' ];

      const baseStateDict = {
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
      };

      await pool.syncState(baseStateDict);

      EXTERNAL_UI_GROUPS.forEach(group => {
        const currentVal = store.external_levels[group.rows[0]] || 0;
        let maxVal = group.max !== undefined ? group.max : ((group.ui_type === 'skill' || group.ui_type === 'bundle') ? 1 : 9999);
        
        if (group.id === 'geoduck') {
          maxVal = store.asc2_unlocked ? 300 : 200;
        }

        if (group.id === 'geoduck' && !store.geoduck_unlocked) return;
        if (group.id === 'hestia' && !store.asc1_unlocked) return;
        if (group.id === 'hades' && !store.asc1_unlocked) return;
        if (group.id === 'asc_bundle' && !store.asc1_unlocked) return;
        if (group.id === 'arch_card' && !store.asc1_unlocked) return;
        if (currentVal >= maxVal) return;
        
        if (targetMetric === "xp_per_min" && pureLootExts.includes(group.id)) return;
        if (targetMetric.includes("block") && pureLootExts.includes(group.id)) return;

        let actionText = "";
        if (group.ui_type === 'skill' || group.ui_type === 'bundle') {
          actionText = "Unlock";
        } else if (group.ui_type === 'pet') {
          if (currentVal === -1) actionText = "Obtain Pet";
          else actionText = `Rank ${currentVal} ➔ ${currentVal + 1}`;
        } else {
          actionText = `Lvl ${currentVal} ➔ ${currentVal + 1}`;
        }

        const testExt = {};
        group.rows.forEach(r => testExt[r] = currentVal + 1);

        extResults[group.id] = { sum: 0, count: 0, name: group.name, action: actionText };

        for (let i = 0; i < roiPrecision; i++) {
          const p = pool.runTask(bestFinal, undefined, testExt).then(res => {
            extResults[group.id].sum += (res[targetMetric] || 0);
            extResults[group.id].count++;
          });
          promises.push(p);
        }
      });

      if (promises.length > 0) {
        await Promise.all(promises);
        const finalRes = Object.keys(extResults).map(k => {
          const avg = extResults[k].sum / extResults[k].count;
          const gain = ((avg - baseVal) / 60.0) * 1000.0;
          return { id: k, name: extResults[k].name, gain: gain, action: extResults[k].action };
        })
        .filter(r => r.gain > 0.001)
        .sort((a, b) => b.gain - a.gain);
        store.saveRoiToCurrentRun(contextType, 'roi_externals', finalRes);
      } else {
        alert("All eligible external upgrades are maxed out!");
      }
      pool.terminate();
    } catch (err) {
      console.error(err);
      alert("ROI Analyzer failed: " + err.message);
    }
    setIsRoiLoading(false);
  };

  const handleAnalyzeCards = async (contextType) => {
    setIsRoiLoading(true);
    setRoiProgressMsg(`Testing marginal block card values (${roiPrecision} sims each. This may take a minute)...`);
    
    try {
      const pool = new EngineWorkerPool();
      await pool.init();
      const cardResults = {};
      const promises = [ ];
      const targetMetric = store.opt_results.run_target_metric;
      const baseVal = store.opt_results.final_summary_out[targetMetric];
      const bestFinal = store.opt_results.best_final;

      const baseStateDict = {
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
      };

      await pool.syncState(baseStateDict);

      Object.keys(ORE_MIN_FLOORS).forEach(cardId => {
        if (!store.asc1_unlocked && (cardId.startsWith('div') || cardId.endsWith('4'))) return;
        if (!store.asc2_unlocked && cardId.endsWith('4')) return;
        if (store.current_max_floor < ORE_MIN_FLOORS[cardId]) return;

        const currentLvl = store.cards[cardId] || 0;
        const maxLvl = store.asc1_unlocked ? 4 : 3;
        if (currentLvl >= maxLvl) return;

        let targetLvlName = "";
        if (currentLvl === 0) targetLvlName = "Unlock Regular";
        else if (currentLvl === 1) targetLvlName = "Upgrade to Gilded";
        else if (currentLvl === 2) targetLvlName = "Upgrade to Poly";
        else if (currentLvl === 3) targetLvlName = "Upgrade to Infernal";

        cardResults[cardId] = { sum: 0, count: 0, name: cardId, action: targetLvlName };

        for (let i = 0; i < roiPrecision; i++) {
          const p = pool.runTask(bestFinal, undefined, undefined, { [cardId]: currentLvl + 1 }).then(res => {
            cardResults[cardId].sum += (res[targetMetric] || 0);
            cardResults[cardId].count++;
          });
          promises.push(p);
        }
      });

      if (promises.length > 0) {
        await Promise.all(promises);
        const finalRes = Object.keys(cardResults).map(k => {
          const avg = cardResults[k].sum / cardResults[k].count;
          const gain = ((avg - baseVal) / 60.0) * 1000.0;
          return { id: k, name: cardResults[k].name, gain: gain, action: cardResults[k].action };
        })
        .filter(r => r.gain > 0.001)
        .sort((a, b) => b.gain - a.gain);
        store.saveRoiToCurrentRun(contextType, 'roi_cards', finalRes);
      } else {
        alert("All eligible block cards are maxed out!");
      }
      pool.terminate();
    } catch (err) {
      console.error(err);
      alert("ROI Analyzer failed: " + err.message);
    }
    setIsRoiLoading(false);
  };

  return (
    <div className="mt-8 animate-fade-in space-y-6" id={`dashboard-anchor-${context}`}>
      <div className="bg-[#1e1e1e] border-l-4 border-l-green-500 p-4 rounded shadow">
        <h3 className="text-xl font-bold text-green-400">✅ Simulation Complete in {store.opt_results.elapsed.toFixed(1)} seconds!</h3>
      </div>

      <div className="flex overflow-x-auto border-b border-st-border mb-6 no-scrollbar">
        {[
          { id: 'build', label: '🏆 The Build' },
          { id: 'data', label: '📊 Simulation Data' },
          { id: 'roi', label: '🔮 Upgrade Guide (ROI)' }
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setResTab(t.id)}
            className={`px-4 py-2 font-medium whitespace-nowrap transition-colors duration-200 border-b-2 ${
              resTab === t.id 
                ? 'border-st-orange text-st-text' 
                : 'border-transparent text-st-text-light hover:text-st-orange hover:border-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 🏆 THE BUILD */}
      {resTab === 'build' && (
        <div className="st-container animate-fade-in">
          <h3 className="text-2xl font-bold mb-4">🏆 Optimal Stat Build</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            {([...activeStats, store.opt_results.best_final.Unassigned !== undefined ? 'Unassigned' : null].filter(Boolean)).map(stat => {
              const allocated = store.opt_results.best_final[stat] || 0;
              const current = stat === 'Unassigned' 
                  ? Math.max(0, dynamicBudget - activeStats.reduce((acc, s) => acc + (store.base_stats[s] || 0), 0))
                  : store.base_stats[stat] || 0;
              const delta = allocated - current;
              
              return (
                <div key={stat} className={`st-container flex flex-col items-center text-center ${stat === 'Unassigned' ? 'border-st-orange/30 bg-st-orange/5' : ''}`}>
                  <div className="font-bold">{stat === 'Unassigned' ? 'Unspent' : stat}</div>
                  <div className="text-3xl font-mono mt-2 text-st-orange">{allocated}</div>
                  <div className={`text-sm font-bold ${delta > 0 ? 'text-green-400' : delta < 0 ? 'text-red-400' : 'text-st-text-light'}`}>
                    {delta > 0 ? `+${delta}` : delta < 0 ? delta : '-'}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 mt-6">
            <button 
              onClick={(e) => {
                store.setBaseStats(store.opt_results.best_final);
                const btn = e.target;
                const originalText = btn.innerText;
                btn.innerText = "✅ Applied!";
                setTimeout(() => { btn.innerText = originalText; }, 2000);
              }}
              className="w-full py-2 bg-[#2b2b2b] border border-st-orange text-st-orange font-bold rounded hover:bg-st-orange hover:text-[#2b2b2b] transition-colors"
            >
              ✨ Apply Globally
            </button>
            <button 
              onClick={() => {
                store.setSandboxStats(store.opt_results.best_final);
                store.setSimActiveSubTab('sandbox');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="w-full py-2 bg-[#2b2b2b] border border-st-orange text-st-orange font-bold rounded hover:bg-st-orange hover:text-[#2b2b2b] transition-colors"
            >
              🧪 Send to Sandbox
            </button>
            <button 
              onClick={() => {
                store.setSimsState('duelStatsA', store.opt_results.best_final);
                store.setSimActiveSubTab('duel');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="w-full py-2 bg-[#2b2b2b] border border-st-orange text-st-orange font-bold rounded hover:bg-st-orange hover:text-[#2b2b2b] transition-colors"
            >
              ⚔️ Send to Duel (A)
            </button>
            <button 
              onClick={() => {
                store.setSimsState('duelStatsB', store.opt_results.best_final);
                store.setSimActiveSubTab('duel');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="w-full py-2 bg-[#2b2b2b] border border-st-orange text-st-orange font-bold rounded hover:bg-st-orange hover:text-[#2b2b2b] transition-colors"
            >
              ⚔️ Send to Duel (B)
            </button>
          </div>
        </div>
      )}

      {/* 📊 ADVANCED ANALYTICS */}
      {resTab === 'data' && (
        <div className="st-container animate-fade-in">
          <h3 className="text-2xl font-bold mb-4">📊 Advanced Analytics Dashboard</h3>
          
          <div className="flex overflow-x-auto border-b border-st-border mb-6 no-scrollbar">
            {innerTabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setDataTab(t.id)}
                className={`px-4 py-2 font-medium whitespace-nowrap transition-colors duration-200 border-b-2 ${
                  dataTab === t.id ? 'border-st-orange text-st-text' : 'border-transparent text-st-text-light hover:text-st-orange'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {dataTab === 'performance' && (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              <div className="lg:col-span-2 space-y-6">
                {isFloorTarget ? (
                  <div className="space-y-4">
                    <h4 className="font-bold text-lg border-b border-st-border pb-2">🏆 Right-Tail Push Potential</h4>
                    <p className="text-xs text-st-text-light">Floor progression relies on compounding RNG (critical hits and mod chains). Here is the expected cost to ride the right-tail of the bell curve based on your simulated runs.</p>
                    
                    {(() => {
                      const floors = finalSum.floors || [ ];
                      if (floors.length === 0) return null;
                      
                      const sorted = [...floors].sort((a,b) => b - a);
                      const tot = sorted.length;
                      
                      const getStats = (percentile) => {
                        const idx = Math.max(0, Math.floor(tot * percentile) - 1);
                        const targetFloor = sorted[idx];
                        
                        const count = sorted.filter(f => f >= targetFloor).length;
                        const prob = count / tot;
                        const runsNeeded = prob > 0 ? 1.0 / prob : 0;
                        
                        const maxSta = (finalSum.avg_metrics && finalSum.avg_metrics.in_game_time) 
                          ? finalSum.avg_metrics.in_game_time 
                          : ((finalSum.stamina_trace && finalSum.stamina_trace.stamina && finalSum.stamina_trace.stamina.length > 0) 
                            ? finalSum.stamina_trace.stamina[0] 
                            : 0);
                        
                        const cost = (runsNeeded * maxSta) / 1000.0;
                        return { floor: targetFloor, prob, runs: Math.ceil(runsNeeded), cost };
                      };

                      const tiers =[
                        { label: "Average (Top 50%)", data: getStats(0.50), color: "text-st-text" },
                        { label: "Lucky (Top 10%)", data: getStats(0.10), color: "text-blue-400" },
                        { label: "Miracle (Top 1%)", data: getStats(0.01), color: "text-purple-400" },
                        { label: "Absolute Peak", data: getStats(0.00), color: "text-st-orange" }
                      ];

                      const uniqueTiers = [ ];
                      const seenFloors = new Set();
                      tiers.forEach(t => {
                        if (!seenFloors.has(t.data.floor)) {
                          uniqueTiers.push(t);
                          seenFloors.add(t.data.floor);
                        }
                      });

                      return (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-sm border-collapse">
                            <thead>
                              <tr className="border-b border-st-border text-st-text-light">
                                <th className="py-2 pr-2">Probability</th>
                                <th className="py-2 pr-2">Floor</th>
                                <th className="py-2">Avg Cost</th>
                              </tr>
                            </thead>
                            <tbody>
                              {uniqueTiers.map((t, i) => (
                                <tr key={i} className="border-b border-st-border/50 hover:bg-black/5">
                                  <td className="py-2 pr-2 font-bold">{t.label}</td>
                                  <td className={`py-2 pr-2 font-mono font-bold ${t.color}`}>Flr {t.data.floor}</td>
                                  <td className="py-2 text-st-text-light">
                                    ~{t.data.cost.toFixed(1)}k Arch Secs <span className="text-xs">({t.data.runs} runs)</span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div>
                      <h4 className="font-bold text-lg">💰 Banked Yields</h4>
                      <p className="text-sm text-st-text-light mb-1">Target {runMetric.includes("frag") ? "Fragments" : runMetric.includes("block") ? "Kills" : "EXP"} per <b>1k Arch Seconds</b></p>
                      {context === 'optimizer' ? (
                        <div className="text-xs text-st-orange/80 mb-2 italic">Note: 100-sim average. May vary ±5% due to RNG. Use Synthesis for a more accurate measurement.</div>
                      ) : (
                        <div className="text-xs text-green-500/80 mb-2 italic">Note: 500-sim marathon average. RNG variance minimized.</div>
                      )}
                      <div className="text-3xl font-bold text-st-orange">{scaleScore(finalSum[runMetric]).toLocaleString(undefined, {minimumFractionDigits:1, maximumFractionDigits:1})}</div>
                    </div>
                    <hr className="border-st-border" />
                    <div>
                      <h4 className="font-bold text-lg">⏱️ Real-Time Yield</h4>
                      <p className="text-sm text-st-text-light mb-2">{runMetric.includes("frag") ? "Fragments" : runMetric.includes("block") ? "Kills" : "EXP"} / minute</p>
                      <div className="text-2xl font-bold">{finalSum[runMetric].toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</div>
                    </div>
                    
                    {runMetric === 'xp_per_min' && (
                      <>
                        <hr className="border-st-border" />
                        <div>
                          <h4 className="font-bold text-lg">🆙 Level Up Calculator</h4>
                          <p className="text-sm text-st-text-light mb-4">Based on {finalSum[runMetric].toLocaleString(undefined, {minimumFractionDigits:2})} EXP/min</p>
                          <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                              <label className="block text-sm mb-1">Current EXP</label>
                              <input 
                                type="number" 
                                value={curXp} 
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => setCurXp(e.target.value === '' ? '' : parseFloat(e.target.value))}
                                onBlur={(e) => setCurXp(Math.max(0, parseFloat(e.target.value) || 0))}
                                className="st-input"
                              />
                            </div>
                            <div>
                              <label className="block text-sm mb-1">Target EXP</label>
                              <input 
                                type="number" 
                                value={tarXp} 
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => setTarXp(e.target.value === '' ? '' : parseFloat(e.target.value))}
                                onBlur={(e) => setTarXp(Math.max(0, parseFloat(e.target.value) || 0))}
                                className="st-input"
                              />
                            </div>
                          </div>
                          {tarXp > curXp && finalSum[runMetric] > 0 && (
                            <div className="bg-green-900/20 border-l-4 border-green-500 p-3 rounded text-green-700 text-sm">
                              <strong>Required:</strong> ~{(((tarXp - curXp) / finalSum[runMetric]) * 60.0 / 1000.0).toFixed(1)}k Arch Seconds ({((tarXp - curXp) / finalSum[runMetric]).toFixed(1)} mins real-time)
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
                
                <hr className="border-st-border" />
                <div className="flex flex-col">
                  <h4 className="font-bold text-lg mb-1">🧱 Average Death</h4>
                  <span className="text-st-text-light text-sm mb-1">Floor reached per run</span>
                  <span className="text-2xl font-bold">Floor {finalSum.avg_floor.toFixed(1)}</span>
                </div>
              </div>

              <div className="lg:col-span-3 space-y-6">
                <div className="border border-st-border rounded bg-st-bg p-2">
                  <h4 className="font-bold ml-2 mt-2">AI Convergence (Hill Climb)</h4>
                  <p className="text-xs text-st-text-light ml-2 mb-2">Y-Axis: {unitLabel}</p>
                  <Plot
                    data={[{
                      x: store.opt_results.chart_hill_labels,
                      y: store.opt_results.chart_hill_scores,
                      type: 'scatter', mode: 'lines+markers',
                      line: { color: '#4CAF50' }, marker: { size: 10 }
                    }]}
                    layout={{
                      font: { color: store.theme === 'dark' ? '#FAFAFA' : '#31333F' },
                      paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
                      margin: { t: 10, b: 30, l: 40, r: 20 },
                      height: 250
                    }}
                    useResizeHandler={true} style={{ width: '100%' }} config={{ displayModeBar: false }}
                  />
                </div>
                <div className="border border-st-border rounded bg-st-bg p-2">
                  <h4 className="font-bold ml-2 mt-2">Engine Confidence Analysis</h4>
                  <p className="text-xs text-st-text-light ml-2 mb-2">X-Axis: {unitLabel}</p>
                  <Plot
                    data={[{
                      y: ["Worst Tested", "Average", "Runner-Up", "🏆 Optimal"],
                      x:[
                        scaleScore(store.opt_results.worst_val),
                        scaleScore(store.opt_results.avg_val),
                        scaleScore(store.opt_results.runner_up_val),
                        scaleScore(finalSum[runMetric])
                      ],
                      type: 'bar', orientation: 'h', textposition: 'auto',
                      marker: { color:["#ff4b4b", "#ffa229", "#6495ED", "#4CAF50"] }
                    }]}
                    layout={{
                      font: { color: store.theme === 'dark' ? '#FAFAFA' : '#31333F' },
                      paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
                      margin: { t: 10, b: 30, l: 100, r: 20 },
                      height: 250
                    }}
                    useResizeHandler={true} style={{ width: '100%' }} config={{ displayModeBar: false }}
                  />
                </div>
              </div>
            </div>
          )}

          {dataTab === 'cards' && (() => {
            const displayBlocks = [...availableBlocks];
            if (cardSelBlock && !displayBlocks.includes(cardSelBlock)) {
              displayBlocks.push(cardSelBlock);
              displayBlocks.sort();
            }

            let defaultBlock = displayBlocks[0];
            if (runMetric.startsWith('block_')) {
              const target = runMetric.replace('block_', '').replace('_per_min', '');
              if (displayBlocks.includes(target)) defaultBlock = target;
            }
            
            const activeBlock = cardSelBlock || defaultBlock;

            return (
            <div className="space-y-6">
              <h4 className="font-bold text-lg">🎴 Block Card Drop Estimates</h4>
              {displayBlocks.length === 0 ? (
                <div className="text-st-text-light">No block kill data available for this run.</div>
              ) : (
                <>
                  <div className="flex flex-col md:flex-row items-center gap-4">
                    <label className="font-bold whitespace-nowrap">Select Block:</label>
                    <select 
                      value={activeBlock} 
                      onChange={(e) => setCardSelBlock(e.target.value)}
                      className="w-full md:w-auto bg-st-bg border border-st-border rounded p-2 text-st-text focus:border-st-orange focus:outline-none"
                    >
                      {displayBlocks.map(b => (
                        <option key={b} value={b}>{b.charAt(0).toUpperCase() + b.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  
                  {(() => {
                    const selB = activeBlock;
                    const valMins = avgMetrics[`block_${selB}_per_min`] || 0;
                    
                    const formatTime = (reqKills) => {
                      if (valMins <= 0) return { rt: "N/A", arch: 0 };
                      const rtMins = reqKills / valMins;
                      const rtStr = rtMins < 60 ? `${rtMins.toFixed(1)}m` : `${(rtMins/60).toFixed(1)}h`;
                      const arch1k = (reqKills / (valMins / 60.0)) / 1000.0;
                      return { rt: rtStr, arch: arch1k };
                    };

                    const isTier4 = selB.endsWith('4');
                    const drops =[
                      { name: "Base Card", odds: isTier4 ? 15000 : 1500, bg: "1" },
                      { name: "Poly Fragments", odds: isTier4 ? 75000 : 7500, bg: "2" },
                      { name: "Infernal Fragments", odds: 200000, bg: "4" }
                    ];

                    return (
                      <div>
                        <div className="text-st-text-light text-sm mb-6">Based on {valMins.toFixed(2)} <b>{selB}</b> kills/min</div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          {drops.map((d, i) => {
                            const rt50 = formatTime(0.693 * d.odds);
                            const rt90 = formatTime(2.302 * d.odds);
                            const rt99 = formatTime(4.605 * d.odds);
                            
                            return (
                              <div key={i} className="border border-st-border rounded bg-st-bg p-4 flex flex-col items-center text-center shadow-sm">
                                <div className="relative flex items-center justify-center mb-3" style={{ width: UI_BLOCK_CARD_WIDTH * 0.8, height: UI_BLOCK_CARD_WIDTH * 1.0 }}>
                                  <img src={`/assets/cards/backgrounds/${d.bg}.png`} className="absolute inset-0 w-full h-full object-contain" style={{ imageRendering: 'pixelated' }} />
                                  <img src={`/assets/cards/cores/${selB}.png`} className="absolute inset-0 w-full h-full object-contain drop-shadow-md" style={{ imageRendering: 'pixelated', transform: `translate(${UI_BLOCK_CARD_X_OFFSET}px, ${UI_BLOCK_CARD_Y_OFFSET}px) scale(${UI_CARD_CBLOCK_SCALE})` }} onError={(e) => e.target.style.display = 'none'} />
                                </div>
                                <div className="font-bold mb-1">{d.name}</div>
                                <div className="text-xs text-st-text-light mb-4">(1 in {d.odds.toLocaleString()})</div>
                                <hr className="border-st-border mb-4"/>
                                {valMins > 0 ? (
                                  <div className="space-y-3 text-sm">
                                    <div><strong>50% (Lucky):</strong><br/>~{rt50.rt} | ~{rt50.arch.toFixed(1)}k Arch Secs</div>
                                    <div><strong>90% (Safe):</strong><br/>~{rt90.rt} | ~{rt90.arch.toFixed(1)}k Arch Secs</div>
                                    <div><strong>99% (Guaranteed):</strong><br/>~{rt99.rt} | ~{rt99.arch.toFixed(1)}k Arch Secs</div>
                                  </div>
                                ) : (
                                  <div className="text-st-text-light text-sm py-8">N/A (0 kills)</div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
            );
          })()}

          {dataTab === 'loot' && store.opt_results.chart_loot && (
            <div className="space-y-4">
              <h4 className="font-bold text-lg">🎒 Collateral Loot Distribution</h4>
              <p className="text-sm text-st-text-light">On average, every <b>1k Arch Seconds</b> of simulated mining yields the following collateral fragments alongside your target:</p>
              <div className="w-full h-[400px] border border-st-border rounded bg-st-bg p-2">
                <Plot
                  data={[{
                    x: Object.keys(store.opt_results.chart_loot),
                    y: Object.values(store.opt_results.chart_loot).map(v => (v / 60.0) * 1000.0),
                    type: 'bar',
                    text: Object.values(store.opt_results.chart_loot).map(v => ((v / 60.0) * 1000.0).toFixed(1)),
                    textposition: 'outside',
                    marker: { color:['#636EFA', '#EF553B', '#00CC96', '#AB63FA', '#FFA15A', '#19D3F3', '#FF6692'] }
                  }]}
                  layout={{
                    font: { color: store.theme === 'dark' ? '#FAFAFA' : '#31333F' },
                    paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
                    margin: { t: 20, b: 40, l: 40, r: 20 }
                  }}
                  useResizeHandler={true} style={{ width: '100%', height: '100%' }} config={{ displayModeBar: false }}
                />
              </div>
            </div>
          )}

          {dataTab === 'wall' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="w-full h-[350px] border border-st-border rounded bg-st-bg p-2">
                <Plot
                  data={[{
                    x: Object.keys(store.opt_results.chart_hist),
                    y: Object.values(store.opt_results.chart_hist),
                    type: 'bar',
                    marker: { color: '#ff4b4b' },
                    text: Object.values(store.opt_results.chart_hist),
                    textposition: 'outside'
                  }]}
                  layout={{
                    font: { color: store.theme === 'dark' ? '#FAFAFA' : '#31333F' },
                    title: 'Death Distribution (Progression Wall)',
                    paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
                    margin: { t: 40, b: 40, l: 40, r: 20 },
                    xaxis: { type: 'category', title: 'Floor', color: chartFontColor, gridcolor: chartGridColor }, yaxis: { title: 'Deaths', color: chartFontColor, gridcolor: chartGridColor }
                  }}
                  useResizeHandler={true} style={{ width: '100%', height: '100%' }} config={{ displayModeBar: false }}
                />
              </div>
              {(store.opt_results.final_summary_out.stamina_trace || store.opt_results.final_summary_out.stamina_trace_median) && (() => {
                const out = store.opt_results.final_summary_out;
                const traces = [ ];
                
                const medTrace = out.stamina_trace_median || out.stamina_trace;
                if (medTrace) {
                  traces.push({
                    x: medTrace.floor,
                    y: medTrace.stamina,
                    name: 'Median Run',
                    type: 'scatter', mode: 'lines', fill: 'tozeroy',
                    line: { color: '#ffa229', width: 2 }, fillcolor: 'rgba(255, 162, 41, 0.2)'
                  });
                }
                
                if (out.stamina_trace_max && out.stamina_trace_max !== medTrace) {
                  traces.push({
                    x: out.stamina_trace_max.floor,
                    y: out.stamina_trace_max.stamina,
                    name: 'Peak Run',
                    type: 'scatter', mode: 'lines',
                    line: { color: '#4CAF50', width: 3 }
                  });
                }

                return (
                  <div className="w-full h-[350px] border border-st-border rounded bg-st-bg p-2">
                    <Plot
                      data={traces}
                      layout={{
                        font: { color: store.theme === 'dark' ? '#FAFAFA' : '#31333F' },
                        title: 'Stamina Depletion Traces',
                        paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
                        margin: { t: 40, b: 40, l: 40, r: 20 },
                        showlegend: traces.length > 1,
                        legend: { orientation: 'h', y: -0.2, x: 0.5, xanchor: 'center' },
                        xaxis: { title: 'Floor Level', color: chartFontColor, gridcolor: chartGridColor }, 
                        yaxis: { title: 'Stamina Remaining', color: chartFontColor, gridcolor: chartGridColor }
                      }}
                      useResizeHandler={true} style={{ width: '100%', height: '100%' }} config={{ displayModeBar: false }}
                    />
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* 🔮 UPGRADE GUIDE (ROI) */}
      {resTab === 'roi' && (
        <div className="st-container animate-fade-in">
          <h3 className="text-2xl font-bold mb-4">🔮 Upgrade Guide (Marginal ROI)</h3>
          
          {store.opt_results.run_target_metric === 'highest_floor' ? (
            <div className="bg-yellow-900/40 border-l-4 border-yellow-500 p-4 rounded">
              <p className="font-bold text-yellow-500">⚠️ ROI Analyzer is Disabled for Max Floor Push</p>
              <p className="text-sm mt-2">Because floor progression relies on large, discrete math 'Breakpoints', adding a single +1 to a stat rarely shows an immediate gain. To calculate exactly what stats you need to beat your current wall, send your build to Tab 6 (Hit Calculator Sandbox) and manually inspect the HP and Armor Breakpoints!</p>
            </div>
          ) : (
            <div>
              <p className="text-st-text-light mb-4">Wondering what to buy next? The ROI Analyzer runs isolated micro-simulations, adding <strong>+1 Level</strong> to every stat and un-maxed upgrade, then ranks them by their immediate raw boost to your yields.</p>
              <div className="bg-yellow-900/40 border-l-4 border-yellow-500 p-3 rounded mb-6 text-sm">
                ⚠️ <strong>Note:</strong> This engine ranks <strong>raw output gain</strong>, not cost efficiency. You must weigh the AI's top recommendations against your actual in-game fragment costs!
              </div>

              <div className="flex flex-col md:flex-row items-start md:items-center justify-between bg-[#1e1e1e] border border-st-border p-3 rounded mb-6 gap-4">
                <div>
                  <label className="text-sm font-bold block mb-1">🎯 ROI Precision (Simulations per item)</label>
                  <select 
                    value={roiPrecision}
                    onChange={(e) => setRoiPrecision(parseInt(e.target.value))}
                    disabled={isRoiLoading}
                    className="bg-st-secondary border border-st-border rounded p-1 text-sm text-st-text focus:border-st-orange outline-none disabled:opacity-50"
                  >
                    <option value={15}>15 Runs (Fast, High Variance)</option>
                    <option value={30}>30 Runs (Balanced)</option>
                    <option value={50}>50 Runs (Accurate, Slower)</option>
                    <option value={100}>100 Runs (Max Precision, Very Slow)</option>
                  </select>
                </div>
                <div className="text-xs text-st-text-light max-w-md italic">
                  Note: A lower number of runs causes RNG variance. Upgrades with similar mathematical gains might shuffle places or fall off the list upon recalculating. Increase precision to stabilize the math!
                </div>
              </div>

              {isRoiLoading && (
                <div className="flex flex-col items-center justify-center p-6 border border-st-border rounded bg-st-bg mb-6">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-st-orange mb-4"></div>
                  <p className="text-st-orange font-bold animate-pulse">{roiProgressMsg}</p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* STATS ROI */}
                <div className="border border-st-border rounded p-4 bg-st-bg">
                  <h4 className="font-bold mb-2">1. Base Stats ROI</h4>
                  <p className="text-sm text-st-text-light mb-4">
                    Tests adding +1 to every stat to see which yields the highest increase.
                    {store.opt_results?.best_final?.Unassigned !== undefined && (
                      <span className="block mt-1 text-st-orange">💡 <strong>Crippled Build:</strong> Use this to see exactly what you would gain by spending one of your Unspent points!</span>
                    )}
                  </p>
                  <button 
                    onClick={() => handleAnalyzeStats(context)}
                    disabled={isRoiLoading}
                    className="w-full py-2 bg-st-secondary border border-st-border text-st-text font-bold rounded hover:border-st-orange hover:text-st-orange transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-4"
                  >
                    🔍 Analyze Next Stat Point
                  </button>
                  
                  {store.opt_results.roi_stats && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-st-border text-st-text-light text-sm">
                            <th className="py-2 pr-4">Stat (+1)</th>
                            <th className="py-2">Gain (per 1k Secs)</th>
                            <th className="py-2 w-20 text-right">Apply</th>
                          </tr>
                        </thead>
                        <tbody>
                          {store.opt_results.roi_stats.length === 0 ? (
                            <tr><td colSpan="3" className="py-4 text-center text-st-text-light italic">No positive marginal gains found.</td></tr>
                          ) : store.opt_results.roi_stats.map((r) => (
                            <tr key={r.stat} className="border-b border-st-border/50 hover:bg-black/5 transition-colors">
                              <td className="py-2 pr-4 font-bold">{r.stat}</td>
                              <td className="py-2 font-mono text-st-orange">{r.gain > 0 ? '+' : ''}{r.gain.toFixed(2)}</td>
                              <td className="py-2 text-right">
                                <button onClick={() => handleApplyStat(r.stat)} className="px-3 py-1 bg-st-orange text-[#2b2b2b] font-bold text-xs rounded hover:bg-[#ffb045] transition-colors">Apply</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* UPGRADES ROI */}
                <div className="border border-st-border rounded p-4 bg-st-bg">
                  <h4 className="font-bold mb-2">2. Internal Upgrades ROI</h4>
                  <p className="text-sm text-st-text-light mb-4">Tests adding +1 level to every un-maxed internal upgrade.</p>
                  <button 
                    onClick={() => handleAnalyzeUpgrades(context)}
                    disabled={isRoiLoading}
                    className="w-full py-2 bg-st-secondary border border-st-border text-st-text font-bold rounded hover:border-st-orange hover:text-st-orange transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-4"
                  >
                    🔍 Analyze Upgrades
                  </button>
                  
                  {store.opt_results.roi_upgrades && (() => {
                    const curMap = { gems: '💎 Gems', com: 'Common', rare: 'Rare', epic: 'Epic', leg: 'Legendary', myth: 'Mythic', div: 'Divine' };
                    const formatCost = (cost) => {
                      if (!cost) return '-';
                      const amt = cost.amount;
                      const amtStr = amt >= 1000000 ? (amt / 1000000).toFixed(2).replace(/\.00$/, '') + 'M' : (amt >= 10000 ? (amt / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : amt.toLocaleString());
                      return `${amtStr} ${curMap[cost.currency]?.split(' ')[0] || cost.currency}`;
                    };
                    
                    const filteredUpgs = store.opt_results.roi_upgrades.filter(r => roiUpgFilter === 'All' || r.cost?.currency === roiUpgFilter);

                    return (
                      <>
                        <div className="flex items-center gap-2 mb-3">
                          <label className="text-sm font-bold text-st-text-light">Filter Currency:</label>
                          <select 
                            value={roiUpgFilter}
                            onChange={(e) => setRoiUpgFilter(e.target.value)}
                            className="bg-st-secondary border border-st-border rounded p-1 text-sm text-st-text focus:border-st-orange outline-none"
                          >
                            <option value="All">All</option>
                            {CURRENCY_TYPES.map(c => <option key={c} value={c}>{curMap[c]}</option>)}
                          </select>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="border-b border-st-border text-st-text-light text-sm">
                                <th className="py-2 pr-4">Upgrade</th>
                                <th className="py-2 pr-4">Action</th>
                                <th className="py-2 pr-4">Cost</th>
                                <th className="py-2">Gain</th>
                                <th className="py-2 w-16 text-right">Apply</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredUpgs.length === 0 ? (
                                <tr><td colSpan="5" className="py-4 text-center text-st-text-light italic">No upgrades match this filter.</td></tr>
                              ) : filteredUpgs.map((r) => (
                                <tr key={r.id} className="border-b border-st-border/50 hover:bg-black/5 transition-colors">
                                  <td className="py-2 pr-4 text-sm font-bold">{r.name}</td>
                                  <td className="py-2 pr-4 text-xs text-st-text-light whitespace-nowrap">{r.action}</td>
                                  <td className="py-2 pr-4 font-mono text-xs text-st-text-light whitespace-nowrap">{formatCost(r.cost)}</td>
                                  <td className="py-2 font-mono text-st-orange">{r.gain > 0 ? '+' : ''}{r.gain.toFixed(2)}</td>
                                  <td className="py-2 text-right">
                                    <button onClick={() => handleApplyUpgrade(r.id)} className="px-3 py-1 bg-st-orange text-[#2b2b2b] font-bold text-xs rounded hover:bg-[#ffb045] transition-colors">Apply</button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* EXTERNAL ROI */}
                <div className="border border-st-border rounded p-4 bg-st-bg">
                  <h4 className="font-bold mb-2">3. External Upgrades ROI</h4>
                  <p className="text-sm text-st-text-light mb-4">Tests adding +1 to every un-maxed accessible external element (Skills, Pets, Idols).</p>
                  <button 
                    onClick={() => handleAnalyzeExternal(context)}
                    disabled={isRoiLoading}
                    className="w-full py-2 bg-st-secondary border border-st-border text-st-text font-bold rounded hover:border-st-orange hover:text-st-orange transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-4"
                  >
                    🔍 Analyze Externals
                  </button>
                  
                  {store.opt_results.roi_externals && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-st-border text-st-text-light text-sm">
                            <th className="py-2 pr-4">External</th>
                            <th className="py-2 pr-4">Action</th>
                            <th className="py-2">Gain</th>
                            <th className="py-2 w-20 text-right">Apply</th>
                          </tr>
                        </thead>
                        <tbody>
                          {store.opt_results.roi_externals.length === 0 ? (
                            <tr><td colSpan="4" className="py-4 text-center text-st-text-light italic">No positive marginal gains found.</td></tr>
                          ) : store.opt_results.roi_externals.map((r) => (
                            <tr key={r.id} className="border-b border-st-border/50 hover:bg-black/5 transition-colors">
                              <td className="py-2 pr-4 text-sm font-bold">{r.name}</td>
                              <td className="py-2 pr-4 text-xs text-st-text-light">{r.action}</td>
                              <td className="py-2 font-mono text-st-orange">{r.gain > 0 ? '+' : ''}{r.gain.toFixed(2)}</td>
                              <td className="py-2 text-right">
                                <button onClick={() => handleApplyExternal(r.id)} className="px-3 py-1 bg-st-orange text-[#2b2b2b] font-bold text-xs rounded hover:bg-[#ffb045] transition-colors">Apply</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* CARDS ROI */}
                <div className="border border-st-border rounded p-4 bg-st-bg">
                  <h4 className="font-bold mb-2">4. Block Cards ROI</h4>
                  <p className="text-sm text-st-text-light mb-4">Tests adding +1 level to every valid, accessible Block Card based on your max floor.</p>
                  <button 
                    onClick={() => handleAnalyzeCards(context)}
                    disabled={isRoiLoading}
                    className="w-full py-2 bg-st-secondary border border-st-border text-st-text font-bold rounded hover:border-st-orange hover:text-st-orange transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-4"
                  >
                    🔍 Analyze Cards
                  </button>
                  
                  {store.opt_results.roi_cards && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-st-border text-st-text-light text-sm">
                            <th className="py-2 pr-4">Block Card</th>
                            <th className="py-2 pr-4">Action</th>
                            <th className="py-2">Gain</th>
                            <th className="py-2 w-20 text-right">Apply</th>
                          </tr>
                        </thead>
                        <tbody>
                          {store.opt_results.roi_cards.length === 0 ? (
                            <tr><td colSpan="4" className="py-4 text-center text-st-text-light italic">No positive marginal gains found.</td></tr>
                          ) : store.opt_results.roi_cards.map((r) => (
                            <tr key={r.id} className="border-b border-st-border/50 hover:bg-black/5 transition-colors">
                              <td className="py-2 pr-4 text-sm font-bold capitalize">{r.name}</td>
                              <td className="py-2 pr-4 text-xs text-st-text-light">{r.action}</td>
                              <td className="py-2 font-mono text-st-orange">{r.gain > 0 ? '+' : ''}{r.gain.toFixed(2)}</td>
                              <td className="py-2 text-right">
                                <button onClick={() => handleApplyCard(r.id)} className="px-3 py-1 bg-st-orange text-[#2b2b2b] font-bold text-xs rounded hover:bg-[#ffb045] transition-colors">Apply</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}