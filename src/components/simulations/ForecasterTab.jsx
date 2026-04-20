// src/components/simulations/ForecasterTab.jsx
import { useState, useEffect, useRef } from 'react';
import useStore from '../../store';
import { EngineWorkerPool, runOptimizationPhase, topUpBuild, getOptimalStepProfile } from '../../utils/optimizer';
import { INTERNAL_UPGRADE_CAPS, UPGRADE_NAMES, ASC1_LOCKED_UPGS, ASC2_LOCKED_UPGS, UPGRADE_LEVEL_REQS, EXTERNAL_UI_GROUPS, calculateUpgradeCost, CURRENCY_TYPES, INFERNAL_CARD_BONUSES } from '../../game_data';

const ORE_MIN_FLOORS = {
  'dirt1': 1, 'com1': 1, 'rare1': 3, 'epic1': 6, 'leg1': 12, 'myth1': 20, 'div1': 50,
  'dirt2': 12, 'com2': 18, 'rare2': 26, 'epic2': 30, 'leg2': 32, 'myth2': 36, 'div2': 75,
  'dirt3': 24, 'com3': 30, 'rare3': 36, 'epic3': 42, 'leg3': 45, 'myth3': 50, 'div3': 100,
  'dirt4': 81, 'com4': 96, 'rare4': 111, 'epic4': 126, 'leg4': 136, 'myth4': 141, 'div4': 150
};

export default function ForecasterTab() {
  const store = useStore();
  const workerRef = useRef(null);

  const targetFloor = store.forecaster_targetFloor ?? (store.current_max_floor || 150);
  const setTargetFloor = (v) => store.setSimsState('forecaster_targetFloor', v);

  const pushBudget = store.forecaster_pushBudget ?? 500;
  const setPushBudget = (v) => store.setSimsState('forecaster_pushBudget', v);

  const simPrecision = store.forecaster_simPrecision ?? 100;
  const setSimPrecision = (v) => store.setSimsState('forecaster_simPrecision', v);

  const cartItems = store.forecaster_cartItems || [ ];

  const [forecasterMode, setForecasterMode] = useState('wall');
  const pivotTargetFrag = store.forecaster_pivotTargetFrag || 6;
  const setPivotTargetFrag = (v) => store.setSimsState('forecaster_pivotTargetFrag', v);
  
  const hasPivotAnalyzed = store.forecaster_hasPivotAnalyzed || false;
  const setHasPivotAnalyzed = (v) => store.setSimsState('forecaster_hasPivotAnalyzed', v);
  
  const pivotResults = store.forecaster_pivotResults || null;
  const setPivotResults = (v) => store.setSimsState('forecaster_pivotResults', v);
  
  const[isPivotAnalyzing, setIsPivotAnalyzing] = useState(false);
  const [pivotMsg, setPivotMsg] = useState("");
  const [pivotPct, setPivotPct] = useState(0);
  const setCartItems = (v) => store.setSimsState('forecaster_cartItems', v);

  const [draftQty, setDraftQty] = useState({ index: null, value: '' });

  const hasAnalyzed = store.forecaster_hasAnalyzed || false;
  const setHasAnalyzed = (v) => store.setSimsState('forecaster_hasAnalyzed', v);

  const rawResults = store.forecaster_results || null;
  // Heal outdated local-storage schemas by ensuring all arrays exist!
  const results = rawResults ? {
    ...rawResults,
    topSta: rawResults.topSta || [],
    topPen: rawResults.topPen ||[],
    topEDPS: rawResults.topEDPS ||[],
    topNetSta: rawResults.topNetSta || [],
    fullList: rawResults.fullList ||[]
  } : null;
  const setResults = (v) => store.setSimsState('forecaster_results', v);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const[analysisMsg, setAnalysisMsg] = useState("");
  const[progressPct, setProgressPct] = useState(0);

  const activeRejectRef = useRef(null);
  const cancelRef = useRef(false);
  const poolRef = useRef(null);

  const handleCancel = () => {
    cancelRef.current = true;
    if (activeRejectRef.current) {
      activeRejectRef.current(new Error("CANCELLED"));
      activeRejectRef.current = null;
    }
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = new Worker('/calc_worker.js?v=' + Date.now());
    }
    if (poolRef.current) {
      poolRef.current.clearQueue();
    }
    setIsAnalyzing(false);
    setAnalysisMsg("Analysis Cancelled.");
  };

  const activeStats =[ 'Str', 'Agi', 'Per', 'Int', 'Luck' ];
  if (store.asc1_unlocked) activeStats.push('Div');
  if (store.asc2_unlocked) activeStats.push('Corr');

  const MAX_STAT_CAPS = {
    Str: 55, Agi: 55, Per: 30, Int: 30, Luck: 30,
    Div: store.asc1_unlocked ? 15 : 0, 
    Corr: store.asc2_unlocked ? 15 : 0,
    Unassigned: 9999
  };

  useEffect(() => {
    workerRef.current = new Worker('/calc_worker.js?v=' + Date.now());
    return () => {
      if (workerRef.current) workerRef.current.terminate();
    };
  }, [ ]);

  useEffect(() => {
    if (hasAnalyzed) {
      handleAnalyzeWall();
    }
  }, [ cartItems ]);

  const runCalc = (payload) => {
    return new Promise((resolve, reject) => {
      activeRejectRef.current = reject;
      const handler = (e) => {
        if (e.data.type === 'CALC_RESULT' || e.data.type === 'SANDBOX_RESULT') {
          workerRef.current.removeEventListener('message', handler);
          activeRejectRef.current = null;
          resolve(e.data.payload);
        } else if (e.data.type === 'ERROR') {
          workerRef.current.removeEventListener('message', handler);
          activeRejectRef.current = null;
          reject(new Error(e.data.payload));
        }
      };
      workerRef.current.addEventListener('message', handler);
      workerRef.current.postMessage({ command: 'CALC_STATS', payload });
    });
  };

  const getItemDescription = (type, id, targetLvl) => {
    if (type === 'stat') {
      const descs = {
        Str: "+Damage, +Crit/sCrit Dmg",
        Agi: "+Crit Chance, +Speed Mod",
        Per: "+Armor Pen, +Loot Mods",
        Int: "+Armor Pen, +Exp Mods",
        Luck: "+All Mods, +Crosshairs",
        Div: "+Damage, +sCrit, +Auto-Tap",
        Corr: "+Damage Multi, -Max Sta"
      };
      return descs[id] || "";
    }
    if (type === 'upg') {
      const u = UPGRADE_NAMES[id];
      return Array.isArray(u) && u.length > 1 ? u[1] : "";
    }
    if (type === 'card') {
      if (targetLvl === 1) return "Unlocks base block bonuses";
      if (targetLvl === 2) return "Increases bonuses (Gilded)";
      if (targetLvl === 3) return "Increases bonuses (Poly)";
      if (targetLvl === 4) return INFERNAL_CARD_BONUSES[id]?.text ? `Infernal Bonus: ${INFERNAL_CARD_BONUSES[id].text}` : "Infernal Bonus";
    }
    if (type === 'ext') {
      const g = EXTERNAL_UI_GROUPS.find(x => x.id === id);
      if (id === 'hades') return "+Infernal Base Power";
      if (id === 'hestia') return "+Fragment Drop Multiplier";
      if (g?.ui_type === 'pet') return "Passive combat/economy bonuses";
      return "";
    }
    return "";
  };

  const getCostLabel = (type, id, currentLvl, ascTier) => {
    if (type === 'stat') return "1 Stat Point (Arch Level)";
    if (type === 'card') return "Card Drop (Mining RNG)";
    if (type === 'ext') {
      const group = EXTERNAL_UI_GROUPS.find(g => g.id === id);
      if (!group) return "Unknown";
      if (group.ui_type === 'pet') return "Pet Quest (Time)";
      if (group.ui_type === 'skill' || group.ui_type === 'bundle') return "Arch Seconds";
      if (id === 'hades' || id === 'hestia') return "Divine Fragments (Altar)";
      return "Special";
    }
    if (type === 'upg') {
      const costData = calculateUpgradeCost(id, currentLvl + 1, ascTier);
      if (!costData) return "Maxed";
      const amt = costData.amount;
      const amtStr = amt >= 1000000 ? (amt / 1000000).toFixed(2).replace(/\.00$/, '') + 'M' : (amt >= 10000 ? (amt / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : amt.toLocaleString());
      const curMap = { gems: '💎 Gems', com: 'Common', rare: 'Rare', epic: 'Epic', leg: 'Legendary', myth: 'Mythic', div: 'Divine' };
      return `${amtStr} ${curMap[costData.currency]?.split(' ')[0] || costData.currency}`;
    }
    return "Unknown";
  };

  const getCartItemTotalCost = (item, baseState, ascTier) => {
    if (item.type === 'upg') {
      let totalAmt = 0;
      let currency = '';
      const start = baseState.upgrade_levels[item.id] || 0;
      for (let i = 1; i <= item.qty; i++) {
        const cost = calculateUpgradeCost(item.id, start + i, ascTier);
        if (cost) {
          totalAmt += cost.amount;
          currency = cost.currency;
        }
      }
      if (totalAmt === 0) return "Free/Maxed";
      const amtStr = totalAmt >= 1000000 ? (totalAmt / 1000000).toFixed(2).replace(/\.00$/, '') + 'M' : (totalAmt >= 10000 ? (totalAmt / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : totalAmt.toLocaleString());
      const curMap = { gems: '💎 Gems', com: 'Common', rare: 'Rare', epic: 'Epic', leg: 'Legendary', myth: 'Mythic', div: 'Divine' };
      return `${amtStr} ${curMap[currency]?.split(' ')[0] || currency}`;
    }
    if (item.type === 'stat') return `${item.qty} Stat Points`;
    if (item.type === 'card') return `${item.qty} Card Upgrades`;
    if (item.type === 'ext') {
      if (item.id === 'hades' || item.id === 'hestia') return `${item.qty} Altar Upgrades`;
      return `${item.qty} Upgrades`;
    }
    return `${item.qty}x`;
  };

  const getEffectiveState = () => {
    const eff = {
      base_stats: { ...store.base_stats },
      upgrade_levels: { ...store.upgrade_levels },
      external_levels: { ...store.external_levels, 8: store.geoduck_unlocked ? (store.external_levels[ 8 ] || 0) : 0 },
      cards: { ...store.cards }
    };
    cartItems.forEach(item => {
      if (item.type === 'stat') eff.base_stats[item.id] = (eff.base_stats[item.id] || 0) + item.qty;
      if (item.type === 'upg') eff.upgrade_levels[item.id] = (eff.upgrade_levels[item.id] || 0) + item.qty;
      if (item.type === 'card') eff.cards[item.id] = (eff.cards[item.id] || 0) + item.qty;
      if (item.type === 'ext') {
        const group = EXTERNAL_UI_GROUPS.find(g => g.id === item.id);
        if (group) {
          group.rows.forEach(r => eff.external_levels[r] = (eff.external_levels[r] || 0) + item.qty);
        }
      }
    });
    return eff;
  };

  const handleAnalyzeWall = async () => {
    setIsAnalyzing(true);
    cancelRef.current = false;
    setProgressPct(0);
    setAnalysisMsg(`Simulating Base Run (${simPrecision} iterations)...`);

    try {
      const effState = getEffectiveState();
      
      // ========================================================
      // 1. FAST PARALLEL MONTE CARLO (EngineWorkerPool)
      // ========================================================
      poolRef.current = new EngineWorkerPool();
      await poolRef.current.init();
      if (cancelRef.current) return;
      
      const baseStateDict = {
        asc1_unlocked: store.asc1_unlocked,
        asc2_unlocked: store.asc2_unlocked,
        arch_level: store.arch_level,
        current_max_floor: store.current_max_floor,
        arch_ability_infernal_bonus: parseFloat(store.arch_ability_infernal_bonus) / 100.0,
        total_infernal_cards: store.total_infernal_cards,
        base_stats: effState.base_stats, 
        upgrade_levels: effState.upgrade_levels,
        external_levels: effState.external_levels,
        cards: effState.cards
      };
      
      await poolRef.current.syncState(baseStateDict);
      
      let tot_flr = 0;
      let tot_time = 0;
      const floor_distribution = [ ];
      let poolCompleted = 0;
      
      const promises = [ ];
      for (let i = 0; i < simPrecision; i++) {
        promises.push(poolRef.current.runTask(effState.base_stats).then(res => {
          if (res.aborted) return;
          tot_flr += res.highest_floor;
          tot_time += res.total_time;
          floor_distribution.push(res.highest_floor);
          poolCompleted++;
          
          // Progress bar smoothly ticks up to 50%
          if (poolCompleted % Math.max(1, Math.floor(simPrecision / 20)) === 0) {
             setProgressPct((poolCompleted / simPrecision) * 50); 
          }
        }));
      }
      
      await Promise.all(promises);
      poolRef.current.terminate();
      poolRef.current = null;
      
      if (cancelRef.current) return;
      
      const avg_max_floor_calc = tot_flr / simPrecision;
      const avg_run_time_calc = tot_time / simPrecision;

      // ========================================================
      // 2. DETERMINISTIC GAUNTLET CALCULATIONS (calc_worker)
      // ========================================================
      const basePayload = {
        asc1_unlocked: store.asc1_unlocked,
        asc2_unlocked: store.asc2_unlocked,
        arch_level: store.arch_level,
        current_max_floor: store.current_max_floor,
        arch_ability_infernal_bonus: parseFloat(store.arch_ability_infernal_bonus) / 100.0,
        total_infernal_cards: store.total_infernal_cards,
        base_stats: effState.base_stats,
        upgrade_levels: effState.upgrade_levels,
        external_levels: effState.external_levels,
        cards: effState.cards,
        compendium_target_floor: targetFloor,
        do_full_sim: false, // <-- Turn off single-threaded Monte Carlo!
        push_start_floor: Math.max(1, Math.floor(avg_max_floor_calc))
      };

      const baseResultState = await runCalc(basePayload);
      if (cancelRef.current) return;

      // Dynamically determine the hardest block for the target floor
      const availableBlockIds = Object.keys(ORE_MIN_FLOORS).filter(id => {
        if (!store.asc1_unlocked && (id.startsWith('div') || id.endsWith('4'))) return false;
        if (!store.asc2_unlocked && id.endsWith('4')) return false;
        return targetFloor >= ORE_MIN_FLOORS[id];
      });

      let hardestBlockId = 'myth3'; // Fallback
      let maxHits = -1;
      baseResultState.blocks_data.forEach(b => {
        if (availableBlockIds.includes(b.id) && b.avg_hits > maxHits) {
          maxHits = b.avg_hits;
          hardestBlockId = b.id;
        }
      });

      const baseBlock = baseResultState.blocks_data.find(b => b.id === hardestBlockId);
      
      if (!baseBlock) {
        alert("No valid blocks found for this floor. Check your ascension limits.");
        setIsAnalyzing(false);
        return;
      }

      const baseline = {
        target_block: hardestBlockId,
        hp: baseBlock.mod_hp,
        edps: baseBlock.edps,
        armor: baseBlock.mod_armor,
        armor_pen: baseResultState.armor_pen,
        max_sta: baseResultState.max_sta,
        avg_hits: baseBlock.avg_hits,
        push_start_floor: baseResultState.push_start_floor,
        push_est_hits: baseResultState.push_est_hits,
        push_est_regen: baseResultState.push_est_regen,
        net_sta: baseResultState.push_est_hits - baseResultState.push_est_regen,
        avg_max_floor: avg_max_floor_calc,
        floor_distribution: floor_distribution,
        avg_run_time: avg_run_time_calc
      };

      const shoppingList = [ ];
      const ascTier = store.asc2_unlocked ? 2 : (store.asc1_unlocked ? 1 : 0);

      const processDelta = (testState, type, id, name, action, costStr, desc) => {
        const testBlock = testState.blocks_data.find(b => b.id === baseline.target_block);
        if (!testBlock) return;

        const d_edps = testBlock.edps - baseline.edps;
        const d_sta = testState.max_sta - baseline.max_sta;
        const d_pen = testState.armor_pen - baseline.armor_pen;
        
        const test_net_sta = testState.push_est_hits - testState.push_est_regen;
        const d_net_sta = baseline.net_sta - test_net_sta; 

        if (d_net_sta > 0.1 || d_sta > 0 || d_edps > 0.1 || d_pen > 0) {
          shoppingList.push({ type, id, name, action, costStr, desc, d_edps, d_sta, d_net_sta, d_pen });
        }
      };

      // Switch off the full simulation, but pass the identical start floor so every upgrade is tested against the exact same gauntlet!
      const scanPayload = { ...basePayload, do_full_sim: false, push_start_floor: baseline.push_start_floor };

      let scansCompleted = 0;
      const estimatedTotalScans = 90; // Rough estimate of unmaxed items to scan
      const tickScanProgress = () => {
        scansCompleted++;
        setProgressPct(50 + (Math.min(scansCompleted / estimatedTotalScans, 1) * 50));
      };

      setAnalysisMsg("Scanning Upgrades (Finding Best Path)...");
      
      setAnalysisMsg("Scanning Base Stats...");
      for (const stat of activeStats) {
        if (cancelRef.current) return;
        const currentVal = effState.base_stats[stat] || 0;
        if (currentVal >= MAX_STAT_CAPS[stat]) continue; 

        const payload = { ...scanPayload, base_stats: { ...scanPayload.base_stats, [stat]: currentVal + 1 } };
        const res = await runCalc(payload);
        tickScanProgress();
        processDelta(res, 'stat', stat, `Base Stat: ${stat}`, `Lvl ${currentVal} ➔ ${currentVal + 1}`, getCostLabel('stat'), getItemDescription('stat', stat, currentVal + 1));
      }

      setAnalysisMsg("Scanning Internal Upgrades...");
      for (const upgIdStr of Object.keys(INTERNAL_UPGRADE_CAPS || {})) {
        if (cancelRef.current) return;
        const upgId = parseInt(upgIdStr);
        const currentLvl = effState.upgrade_levels[upgId] || 0;
        const maxLvl = INTERNAL_UPGRADE_CAPS[upgId] || 99;

        if (!store.asc1_unlocked && ASC1_LOCKED_UPGS.includes(upgId)) continue;
        if (!store.asc2_unlocked && ASC2_LOCKED_UPGS.includes(upgId)) continue;
        if (store.current_max_floor < (UPGRADE_LEVEL_REQS[upgId] || 0)) continue;
        if (currentLvl >= maxLvl) continue;

        const payload = { ...scanPayload, upgrade_levels: { ...scanPayload.upgrade_levels, [upgId]: currentLvl + 1 } };
        const res = await runCalc(payload);
        tickScanProgress();
        const upgData = UPGRADE_NAMES && UPGRADE_NAMES[upgId];
        const upgName = upgData ? (Array.isArray(upgData) ? upgData[0] : upgData) : `Upg ${upgId}`;
        processDelta(res, 'upg', upgId, `Upgrade: ${upgName}`, `Lvl ${currentLvl} ➔ ${currentLvl + 1}`, getCostLabel('upg', upgId, currentLvl, ascTier), getItemDescription('upg', upgId, currentLvl + 1));
      }

      setAnalysisMsg("Scanning Block Cards...");
      for (const cardId of Object.keys(ORE_MIN_FLOORS)) {
        if (cancelRef.current) return;
        if (!store.asc1_unlocked && (cardId.startsWith('div') || cardId.endsWith('4'))) continue;
        if (!store.asc2_unlocked && cardId.endsWith('4')) continue;
        if (store.current_max_floor < ORE_MIN_FLOORS[cardId]) continue;

        const currentLvl = effState.cards[cardId] || 0;
        const maxLvl = store.asc1_unlocked ? 4 : 3;
        if (currentLvl >= maxLvl) continue;

        const lvlNames =[ "Not Obtained", "Regular", "Gilded", "Poly", "Infernal" ];
        const payload = { ...scanPayload, cards: { ...scanPayload.cards,[cardId]: currentLvl + 1 } };
        const res = await runCalc(payload);
        tickScanProgress();
        processDelta(res, 'card', cardId, `Card: ${cardId.toUpperCase()}`, `${lvlNames[currentLvl]} ➔ ${lvlNames[currentLvl + 1]}`, getCostLabel('card'), getItemDescription('card', cardId, currentLvl + 1));
      }

      setAnalysisMsg("Scanning External Upgrades...");
      for (const group of EXTERNAL_UI_GROUPS) {
        if (cancelRef.current) return;
        const currentVal = effState.external_levels[group.rows[0]] || 0;
        let maxVal = group.max !== undefined ? group.max : ((group.ui_type === 'skill' || group.ui_type === 'bundle') ? 1 : 9999);
        if (group.id === 'geoduck') maxVal = store.asc2_unlocked ? 300 : 200;

        if (group.id === 'geoduck' && !store.geoduck_unlocked) continue;
        if (group.id === 'hestia' && !store.asc1_unlocked) continue;
        if (group.id === 'hades' && !store.asc1_unlocked) continue;
        if (group.id === 'asc_bundle' && !store.asc1_unlocked) continue;
        if (group.id === 'arch_card' && !store.asc1_unlocked) continue;
        if (currentVal >= maxVal) continue;

        let actionText = group.ui_type === 'pet' && currentVal === -1 ? "Obtain Pet" : `Lvl ${currentVal} ➔ ${currentVal + 1}`;
        const testExt = { ...scanPayload.external_levels };
        group.rows.forEach(r => testExt[r] = currentVal + 1);

        const payload = { ...scanPayload, external_levels: testExt };
        const res = await runCalc(payload);
        tickScanProgress();
        processDelta(res, 'ext', group.id, `External: ${group.name}`, actionText, getCostLabel('ext', group.id), getItemDescription('ext', group.id, currentVal + 1));
      }

      const topNetSta = [...shoppingList].filter(i => i.d_net_sta > 0.1).sort((a, b) => b.d_net_sta - a.d_net_sta).slice(0, 15);
      const topEDPS =[...shoppingList].filter(i => i.d_edps > 0.1).sort((a, b) => b.d_edps - a.d_edps).slice(0, 10);
      const topPen =[...shoppingList].filter(i => i.d_pen > 0).sort((a, b) => b.d_pen - a.d_pen).slice(0, 10);
      const topSta =[...shoppingList].filter(i => i.d_sta > 0).sort((a, b) => b.d_sta - a.d_sta).slice(0, 10);

      if (cancelRef.current) return;

      setResults({ baseline, topNetSta, topEDPS, topPen, topSta, fullList: shoppingList });
      setHasAnalyzed(true);

    } catch (err) {
      if (err.message === "CANCELLED") return;
      console.error(err);
      alert("Analysis failed: " + err.message);
    } finally {
      if (!cancelRef.current) setIsAnalyzing(false);
    }
  };

  const getDynamicBaseLvl = (item) => {
    if (item.type === 'stat') return store.base_stats[item.id] || 0;
    if (item.type === 'upg') return store.upgrade_levels[item.id] || 0;
    if (item.type === 'card') return store.cards[item.id] || 0;
    if (item.type === 'ext') {
       const g = EXTERNAL_UI_GROUPS.find(x => x.id === item.id);
       return store.external_levels[g?.rows[0]] || 0;
    }
    return 0;
  };

  const addToCart = (item) => {
    const existingIdx = cartItems.findIndex(i => i.type === item.type && i.id === item.id);
    if (existingIdx > -1) {
      const newCart = [...cartItems];
      const baseLvl = getDynamicBaseLvl(newCart[existingIdx]);
      const maxAddable = newCart[existingIdx].maxAllowed - baseLvl;
      if (newCart[existingIdx].qty < maxAddable) {
        newCart[existingIdx].qty += 1;
        setCartItems(newCart);
      } else {
        alert(`Maximum cap reached for ${item.name}!`);
      }
    } else {
      let maxAllowed = 9999;
      if (item.type === 'stat') maxAllowed = MAX_STAT_CAPS[item.id];
      if (item.type === 'upg') maxAllowed = INTERNAL_UPGRADE_CAPS[item.id] || 99;
      if (item.type === 'card') maxAllowed = store.asc1_unlocked ? 4 : 3;
      if (item.type === 'ext') { 
         const g = EXTERNAL_UI_GROUPS.find(x => x.id === item.id);
         maxAllowed = g?.max !== undefined ? g.max : 9999;
         if (item.id === 'geoduck') maxAllowed = store.asc2_unlocked ? 300 : 200;
      }
      setCartItems([...cartItems, { ...item, qty: 1, maxAllowed }]);
    }
  };

  const setExactCartQty = (index, qty) => {
    const newCart = [...cartItems];
    const item = newCart[index];
    const baseLvl = getDynamicBaseLvl(item);
    const maxAddable = item.maxAllowed - baseLvl;
    
    if (qty > maxAddable) qty = maxAddable;
    
    if (qty <= 0) {
      newCart.splice(index, 1);
    } else {
      newCart[index].qty = qty;
    }
    setCartItems(newCart);
  };

  const removeFromCart = (index) => {
    const newCart =[...cartItems];
    newCart.splice(index, 1);
    setCartItems(newCart);
  };

  const applyCartToGlobal = () => {
    cartItems.forEach(item => {
      if (item.type === 'stat') store.setBaseStat(item.id, (store.base_stats[item.id] || 0) + item.qty);
      if (item.type === 'upg') store.setUpgradeLevel(item.id, (store.upgrade_levels[item.id] || 0) + item.qty);
      if (item.type === 'card') store.setCardLevel(item.id, (store.cards[item.id] || 0) + item.qty);
      if (item.type === 'ext') {
        const group = EXTERNAL_UI_GROUPS.find(g => g.id === item.id);
        if (group) store.setExternalGroup(group.rows, (store.external_levels[group.rows[0]] || 0) + item.qty);
      }
    });
    setCartItems([ ]);
    alert("✅ Cart items applied directly to your Global Player Build!");
  };

  const handleAnalyzePivot = async () => {
    setIsPivotAnalyzing(true);
    cancelRef.current = false;
    setPivotPct(0);
    setPivotMsg(`Evaluating Status Quo (${simPrecision} runs)...`);

    try {
      const effState = getEffectiveState();
      const targetMetric = `frag_${pivotTargetFrag}_per_min`;

      poolRef.current = new EngineWorkerPool();
      await poolRef.current.init();
      if (cancelRef.current) return;

      const baseStateDict = {
        asc1_unlocked: store.asc1_unlocked,
        asc2_unlocked: store.asc2_unlocked,
        arch_level: store.arch_level,
        current_max_floor: store.current_max_floor,
        arch_ability_infernal_bonus: parseFloat(store.arch_ability_infernal_bonus) / 100.0,
        total_infernal_cards: store.total_infernal_cards,
        base_stats: effState.base_stats,
        upgrade_levels: effState.upgrade_levels,
        external_levels: effState.external_levels,
        cards: effState.cards
      };

      await poolRef.current.syncState(baseStateDict);

      // 1. Status Quo (Run sims on current stats)
      let sqSum = 0;
      let sqFloors = 0;
      let poolCompleted = 0;
      const promises = [ ];
      for (let i = 0; i < simPrecision; i++) {
        promises.push(poolRef.current.runTask(effState.base_stats).then(res => {
           if (res.aborted) return;
           sqSum += (res[targetMetric] || 0);
           sqFloors += (res.highest_floor || 0);
           poolCompleted++;
           if (poolCompleted % Math.max(1, Math.floor(simPrecision / 10)) === 0) {
             setPivotPct((poolCompleted / simPrecision) * 30); 
           }
        }));
      }
      await Promise.all(promises);
      if (cancelRef.current) return;
      const sqYield = sqSum / simPrecision;
      const sqAvgFloor = sqFloors / simPrecision;

      // 2. Pivot (Optimize)
      setPivotMsg("AI Auto-Pivoting (Optimizing new baseline)...");
      setPivotPct(30);

      const capInc = parseInt(effState.upgrade_levels[45] || 0) * 5;
      const dynamicBudget = parseInt(store.arch_level) + parseInt(effState.upgrade_levels[12] || 0);
      
      const STAT_CAPS = {
        Str: 50 + capInc, Agi: 50 + capInc, Per: 25 + capInc, Int: 25 + capInc, Luck: 25 + capInc,
        Div: store.asc1_unlocked ? (10 + capInc) : 0, 
        Corr: store.asc2_unlocked ? (10 + capInc) : 0,
        Unassigned: dynamicBudget
      };
      
      const bounds = {};
      activeStats.forEach(s => bounds[s] = [ 0, STAT_CAPS[s] ]);
      
      const simsPerSec = store.simsPerSec || 15;
      // Fetch a safe step profile to prevent combinatorial explosion (Too many elements in Promise.all)
      const profData = getOptimalStepProfile(activeStats, dynamicBudget, bounds, simsPerSec, 30);
      const step1 = profData ? profData.step_1 : 15;
      const p1Budget = dynamicBudget - (dynamicBudget % step1);

      const onProgressCb = (phase, rnd, totRnd, comp, tot) => {
          setPivotPct(30 + ((comp / tot) * 40));
          setPivotMsg(`AI Auto-Pivoting - Phase: ${phase} (${comp}/${tot})`);
      };

      const globalStartTime = Date.now();

      // Phase 1 (Coarse Search)
      let { bestDist: bestP1 } = await runOptimizationPhase(
        "Coarse", targetMetric, activeStats, p1Budget, step1, 15,
        poolRef.current, {}, bounds, 30, globalStartTime, onProgressCb, effState.base_stats
      );
      
      if (cancelRef.current) return;

      // Phase 2 (Fine Search)
      const step2 = profData ? profData.step_2 : Math.max(1, Math.floor(step1 / 2));
      const boundsP2 = {};
      activeStats.forEach(s => {
        boundsP2[s] =[
          Math.max(bounds[s][0], bestP1[s] - step1),
          Math.min(bounds[s][1], bestP1[s] + step1)
        ];
      });
      const p2Budget = dynamicBudget - (dynamicBudget % step2);

      let { bestDist: bestP2 } = await runOptimizationPhase(
        "Fine", targetMetric, activeStats, p2Budget, step2, 25,
        poolRef.current, {}, boundsP2, 30, globalStartTime, onProgressCb, bestP1
      );

      if (cancelRef.current) return;

      const bestFinal = topUpBuild(bestP2 || bestP1, activeStats, dynamicBudget, STAT_CAPS, bounds);

      // 3. Evaluate Pivot
      setPivotMsg(`Verifying Pivot (${simPrecision} runs)...`);
      setPivotPct(70);
      
      let pivSum = 0;
      let pivFloors = 0;
      let pivCompleted = 0;
      const pivPromises = [ ];
      for (let i = 0; i < simPrecision; i++) {
        pivPromises.push(poolRef.current.runTask(bestFinal).then(res => {
           if (res.aborted) return;
           pivSum += (res[targetMetric] || 0);
           pivFloors += (res.highest_floor || 0);
           pivCompleted++;
           if (pivCompleted % Math.max(1, Math.floor(simPrecision / 10)) === 0) {
             setPivotPct(70 + ((pivCompleted / simPrecision) * 30)); 
           }
        }));
      }
      await Promise.all(pivPromises);
      if (cancelRef.current) return;
      
      const pivYield = pivSum / simPrecision;
      const pivAvgFloor = pivFloors / simPrecision;

      poolRef.current.terminate();
      poolRef.current = null;

      setPivotResults({
         statusQuo: { yield: sqYield, floor: sqAvgFloor, stats: effState.base_stats },
         pivot: { yield: pivYield, floor: pivAvgFloor, stats: bestFinal },
         targetFrag: pivotTargetFrag
      });
      setHasPivotAnalyzed(true);
    } catch (err) {
      if (err.message === "CANCELLED") return;
      console.error(err);
      alert("Pivot Analysis failed: " + err.message);
    } finally {
      if (!cancelRef.current) setIsPivotAnalyzing(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold">🔮 The Future Forecaster</h2>
        <p className="text-st-text-light">
          Look into the future. Queue up a hypothetical package of upgrades in your Cart, and let the Oracle mathematically evaluate how those upgrades will impact your pushing and farming potential.
        </p>
      </div>

      <div className="flex overflow-x-auto border-b border-st-border mb-2 no-scrollbar">
        {[
          { id: 'wall', label: '🎯 Progression Wall Breaker' },
          { id: 'pivot', label: '⚖️ Economy Pivot Forecaster' }
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setForecasterMode(t.id)}
            className={`px-4 py-3 font-bold whitespace-nowrap transition-colors duration-200 border-b-2 ${
              forecasterMode === t.id 
                ? 'border-st-orange text-st-orange' 
                : 'border-transparent text-st-text-light hover:text-st-orange hover:border-st-border'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {forecasterMode === 'wall' && (
        <div className="space-y-6 animate-fade-in">
          <div className="bg-blue-900/10 border border-blue-500/30 rounded p-4 text-sm text-blue-200 shadow-sm">
            <h4 className="font-bold text-blue-400 mb-2 flex items-center gap-2">
          <span className="text-lg">ℹ️</span> How to use the Forecaster:
        </h4>
        <ol className="list-decimal pl-5 space-y-1 text-blue-200/80">
          <li><strong>Optimize First:</strong> Ensure you have generated a "Max Floor Push" build (via the Synthesis tab) and that it is actively loaded in your <strong>Player Setup</strong>. The Forecaster uses your global player profile as its mathematical baseline.</li>
          <li><strong>Set Your Goal:</strong> Enter your target floor and Arch Seconds budget below. (The Forecaster will automatically identify the hardest block on that floor).</li>
          <li><strong>Draft Upgrades:</strong> Keep the simulation set to <strong>100 Runs</strong> while adding items to your cart so the engine updates instantly.</li>
          <li><strong>Verify Probability:</strong> Once your cart looks ready, switch to <strong>500 or 1000 Runs</strong> for a highly accurate Monte Carlo probability check before spending your resources.</li>
        </ol>
      </div>

      <div className="st-container border-l-4 border-l-blue-500">
        <h4 className="font-bold mb-4">1. Define the Goal</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-bold mb-1">Target Floor</label>
            <input 
              type="number" 
              value={targetFloor} 
              onChange={(e) => setTargetFloor(parseInt(e.target.value) || 1)}
              className="w-full bg-st-bg border border-st-border rounded p-2 text-st-text focus:border-st-orange focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-bold mb-1">Max Push Budget (k Arch Secs)</label>
            <input 
              type="number" 
              value={pushBudget} 
              onChange={(e) => setPushBudget(parseInt(e.target.value) || 0)}
              className="w-full bg-st-bg border border-st-border rounded p-2 text-st-text focus:border-st-orange focus:outline-none"
            />
            <div className="text-xs text-st-text-light mt-1">How much time are you willing to burn rolling RNG?</div>
          </div>
          <div>
            <label className="block text-sm font-bold mb-1">Simulation Precision</label>
            <select 
              value={simPrecision} 
              onChange={(e) => setSimPrecision(parseInt(e.target.value))}
              className="w-full bg-st-bg border border-st-border rounded p-2 text-st-text focus:border-st-orange focus:outline-none"
            >
              <option value={100}>100 Runs (Fast / High Noise)</option>
              <option value={500}>500 Runs (Balanced)</option>
              <option value={1000}>1,000 Runs (Deep Verification)</option>
            </select>
            <div className="text-xs text-st-text-light mt-1">Higher runs completely flatten right-tail RNG noise.</div>
          </div>
        </div>
        
        {(!hasAnalyzed || cartItems.length === 0) && !isAnalyzing ? (
          <button 
            onClick={() => { setCartItems([]); handleAnalyzeWall(); }}
            className="w-full py-3 mt-6 bg-st-orange text-[#2b2b2b] font-bold rounded-lg shadow hover:bg-[#ffb045] transition-colors"
          >
            🔍 Analyze Progression Wall
          </button>
        ) : isAnalyzing && (!hasAnalyzed || cartItems.length === 0) ? (
          <div className="w-full mt-6 p-4 border border-st-border rounded bg-st-bg">
            <div className="flex justify-between text-sm font-bold mb-2 text-st-orange">
              <span>{analysisMsg}</span>
              <span>{Math.floor(progressPct)}%</span>
            </div>
            <div className="w-full bg-[#1e1e1e] rounded-full h-3 overflow-hidden border border-st-border mb-3">
              <div className="bg-st-orange h-3 transition-all duration-300" style={{ width: `${progressPct}%` }}></div>
            </div>
            <button 
              onClick={handleCancel}
              className="w-full py-1 bg-[#2b2b2b] border border-red-900 text-red-400 font-bold text-xs rounded hover:bg-red-900 hover:text-white transition-colors"
            >
              🛑 Cancel Analysis
            </button>
          </div>
        ) : null}
      </div>
        </div>
      )}

      {forecasterMode === 'pivot' && (
        <div className="space-y-6 animate-fade-in">
          <div className="bg-purple-900/10 border border-purple-500/30 rounded p-4 text-sm text-purple-200 shadow-sm">
            <h4 className="font-bold text-purple-400 mb-2 flex items-center gap-2">
              <span className="text-lg">ℹ️</span> How to use the Economy Pivot:
            </h4>
            <ol className="list-decimal pl-5 space-y-1 text-purple-200/80">
              <li><strong>Queue Upgrades:</strong> Add hypothetical future upgrades to your <strong>Cart</strong> below (Use the Progression Wall Breaker to find upgrades if your cart is empty).</li>
              <li><strong>Select Resource:</strong> Choose the fragment you ultimately want to farm.</li>
              <li><strong>Analyze:</strong> The AI will race your <strong>Status Quo</strong> (your current build + the new raw power) against a <strong>Meta Pivot</strong> (a completely fresh optimization utilizing your new power to push deep) to definitively tell you if it's time to respec!</li>
            </ol>
          </div>

          <div className="st-container border-l-4 border-l-purple-500">
            <h4 className="font-bold mb-4">1. Define the Strategy Evaluation</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold mb-1">Target Economy Resource</label>
                <select 
                  value={pivotTargetFrag} 
                  onChange={(e) => setPivotTargetFrag(parseInt(e.target.value))}
                  className="w-full bg-st-bg border border-st-border rounded p-2 text-st-text focus:border-st-orange focus:outline-none"
                >
                  <option value={1}>Common Fragments</option>
                  <option value={2}>Rare Fragments</option>
                  <option value={3}>Epic Fragments</option>
                  <option value={4}>Legendary Fragments</option>
                  <option value={5}>Mythic Fragments</option>
                  {store.asc1_unlocked && <option value={6}>Divine Fragments</option>}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold mb-1">Simulation Precision</label>
                <select 
                  value={simPrecision} 
                  onChange={(e) => setSimPrecision(parseInt(e.target.value))}
                  className="w-full bg-st-bg border border-st-border rounded p-2 text-st-text focus:border-st-orange focus:outline-none"
                >
                  <option value={100}>100 Runs (Fast / High Noise)</option>
                  <option value={500}>500 Runs (Balanced)</option>
                </select>
                <div className="text-xs text-st-text-light mt-1">Both strategies are evaluated using this sample size.</div>
              </div>
            </div>

            {!isPivotAnalyzing ? (
              <button 
                onClick={handleAnalyzePivot}
                disabled={cartItems.length === 0}
                className="w-full py-3 mt-6 bg-purple-600 text-white font-bold rounded-lg shadow hover:bg-purple-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cartItems.length === 0 ? "🛒 Add items to Cart first!" : "⚖️ Analyze Strategy Shift"}
              </button>
            ) : (
              <div className="w-full mt-6 p-4 border border-st-border rounded bg-st-bg">
                <div className="flex justify-between text-sm font-bold mb-2 text-purple-400">
                  <span>{pivotMsg}</span>
                  <span>{Math.floor(pivotPct)}%</span>
                </div>
                <div className="w-full bg-[#1e1e1e] rounded-full h-3 overflow-hidden border border-st-border mb-3">
                  <div className="bg-purple-600 h-3 transition-all duration-300" style={{ width: `${pivotPct}%` }}></div>
                </div>
                <button 
                  onClick={handleCancel}
                  className="w-full py-1 bg-[#2b2b2b] border border-red-900 text-red-400 font-bold text-xs rounded hover:bg-red-900 hover:text-white transition-colors"
                >
                  🛑 Cancel
                </button>
              </div>
            )}
          </div>
          
          {hasPivotAnalyzed && pivotResults && (
            <div className="animate-fade-in space-y-6">
              <div className="st-container border-t-4 border-t-purple-500">
                <h4 className="font-bold mb-4 text-xl">2. The Auto-Pivot Verdict</h4>
                
                {(() => {
                  const sqYield = pivotResults.statusQuo.yield;
                  const pivYield = pivotResults.pivot.yield;
                  const diff = pivYield - sqYield;
                  const pct = sqYield > 0 ? (diff / sqYield) * 100 : 0;
                  const isPivotViable = pct > 2.0;

                  const scaleScore = (v) => (v / 60.0) * 1000.0;
                  const sqArchYield = scaleScore(sqYield);
                  const pivArchYield = scaleScore(pivYield);
                  const diffArch = pivArchYield - sqArchYield;

                  return (
                    <>
                      {isPivotViable ? (
                        <div className="bg-green-900/20 border-l-4 border-green-500 p-4 rounded mb-6">
                          <h5 className="font-bold text-green-400 text-lg mb-1">🚨 PIVOT RECOMMENDED!</h5>
                          <p className="text-sm text-green-200">Your hypothetical upgrades unlock a mathematically superior farming setup. Respeccing your stats to the Meta Pivot build yields a <strong>+{pct.toFixed(1)}% increase</strong> in fragments compared to just staying the course!</p>
                        </div>
                      ) : (
                        <div className="bg-yellow-900/20 border-l-4 border-yellow-500 p-4 rounded mb-6">
                          <h5 className="font-bold text-yellow-400 text-lg mb-1">🟢 STAY THE COURSE</h5>
                          <p className="text-sm text-yellow-200">The AI could not find a stat respec that definitively beats your current setup. Your current strategy remains the mathematically optimal way to farm this resource with your given upgrades.</p>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-st-bg border border-st-border rounded p-4">
                          <div className="text-center mb-4">
                            <h5 className="font-bold text-gray-400">Strategy A: Status Quo</h5>
                            <p className="text-xs text-st-text-light">Current Stats + Cart Upgrades</p>
                          </div>
                          
                          <div className="bg-black/20 p-3 rounded border border-st-border mb-4">
                            <div className="flex justify-between items-center mb-1">
                              <span className="font-bold text-sm">Yield / 1k Arch Secs:</span>
                              <span className="font-mono text-xl font-bold">{sqArchYield.toFixed(1)}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs text-st-text-light">
                              <span>Real-Time (per min):</span>
                              <span className="font-mono">{sqYield.toFixed(2)}</span>
                            </div>
                          </div>

                          <div className="flex justify-between items-center px-2 py-1 mb-4 border-b border-st-border/50 text-sm">
                            <span className="text-st-text-light">Avg Floor Reached:</span>
                            <span className="font-mono">{pivotResults.statusQuo.floor.toFixed(1)}</span>
                          </div>
                          <div className="grid grid-cols-4 gap-2">
                            {activeStats.map(s => (
                              <div key={s} className="text-center bg-black/10 rounded p-1">
                                <div className="text-[10px] text-st-text-light">{s}</div>
                                <div className="font-mono text-sm text-white">{pivotResults.statusQuo.stats[s]}</div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className={`bg-st-bg border rounded p-4 ${isPivotViable ? 'border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.15)]' : 'border-st-border'}`}>
                          <div className="text-center mb-4">
                            <h5 className={`font-bold ${isPivotViable ? 'text-purple-400' : 'text-gray-400'}`}>Strategy B: Meta Pivot</h5>
                            <p className="text-xs text-st-text-light">AI Optimized Stats + Cart Upgrades</p>
                          </div>
                          
                          <div className="bg-black/20 p-3 rounded border border-st-border mb-4">
                            <div className="flex justify-between items-center mb-1">
                              <span className="font-bold text-sm">Yield / 1k Arch Secs:</span>
                              <div className="text-right flex flex-col items-end relative">
                                <span className={`font-mono text-xl font-bold ${isPivotViable ? 'text-green-400' : ''}`}>{pivArchYield.toFixed(1)}</span>
                                {diffArch > 0 && <span className="text-[10px] text-green-400 font-bold bg-green-900/30 px-1 rounded absolute top-full mt-0.5">+{diffArch.toFixed(1)}</span>}
                              </div>
                            </div>
                            <div className="flex justify-between items-center text-xs text-st-text-light mt-1">
                              <span>Real-Time (per min):</span>
                              <span className="font-mono">{pivYield.toFixed(2)}</span>
                            </div>
                          </div>

                          <div className="flex justify-between items-center px-2 py-1 mb-4 border-b border-st-border/50 text-sm">
                            <span className="text-st-text-light">Avg Floor Reached:</span>
                            <span className={`font-mono ${pivotResults.pivot.floor > pivotResults.statusQuo.floor ? 'text-green-400' : ''}`}>{pivotResults.pivot.floor.toFixed(1)}</span>
                          </div>
                          <div className="grid grid-cols-4 gap-2">
                            {activeStats.map(s => {
                              const bStat = pivotResults.pivot.stats[s] || 0;
                              const sStat = pivotResults.statusQuo.stats[s] || 0;
                              const delta = bStat - sStat;
                              return (
                                <div key={s} className="text-center bg-black/10 rounded p-1 relative">
                                  <div className="text-[10px] text-st-text-light">{s}</div>
                                  <div className={`font-mono text-sm ${delta > 0 ? 'text-green-400' : delta < 0 ? 'text-red-400' : 'text-white'}`}>{bStat}</div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {(cartItems.length > 0 || (forecasterMode === 'wall' && hasAnalyzed && results)) && (
        <div className="animate-fade-in space-y-6">
          <div className="st-container border-t-4 border-t-green-500 bg-green-500/5">
            <div className="flex justify-between items-center mb-4">
              <h4 className="font-bold text-xl text-green-500">🛒 Planned Upgrades Cart</h4>
              <span className="text-sm font-bold text-green-400">{cartItems.length} items queued</span>
            </div>
            
            {cartItems.length === 0 ? (
              <div className="text-sm text-st-text-light italic mb-4">Your cart is empty. Click "+ Cart" on items in the Oracle lists below to see how they impact your math!</div>
            ) : (
              <div className="space-y-2 mb-4 max-h-[300px] overflow-y-auto pr-2">
                {cartItems.map((item, idx) => {
                  const ascTier = store.asc2_unlocked ? 2 : (store.asc1_unlocked ? 1 : 0);
                  const totalCostStr = getCartItemTotalCost(item, store, ascTier);
                  const nextGain = results?.fullList?.find(i => i.type === item.type && i.id === item.id);
                  const baseLvl = getDynamicBaseLvl(item);
                  
                  const lvlNames =[ "None", "Regular", "Gilded", "Poly", "Infernal" ];
                  const displayBase = item.type === 'card' ? lvlNames[baseLvl] : baseLvl;
                  const displayNew = item.type === 'card' ? lvlNames[baseLvl + item.qty] : (baseLvl + item.qty);
                  
                  return (
                    <div key={idx} className="flex justify-between items-center bg-st-bg border border-st-border p-2 rounded text-sm">
                      <div className="flex-1">
                        <div>
                          <span className="font-bold">{item.name}</span> 
                          <span className="text-st-orange text-xs font-bold ml-2 bg-st-orange/10 px-1 rounded">Lvl {displayBase} ➔ {displayNew}</span>
                          <span className="text-st-text-light text-xs ml-2">Total: {totalCostStr}</span>
                        </div>
                        {nextGain ? (
                          <div className="text-[10px] mt-1 text-st-text-light bg-black/10 inline-block px-1 rounded">
                            Next +1 Lvl Gain: 
                            {nextGain.d_edps > 0.1 && <span className="text-st-orange ml-1">+{Math.ceil(nextGain.d_edps).toLocaleString()} EDPS</span>}
                            {nextGain.d_pen > 0 && <span className="text-gray-300 ml-1">+{Math.ceil(nextGain.d_pen).toLocaleString()} Pen</span>}
                            {nextGain.d_sta > 0 && <span className="text-blue-400 ml-1">+{Math.ceil(nextGain.d_sta).toLocaleString()} Sta</span>}
                            {nextGain.d_net_sta > 0.1 && <span className="text-red-400 ml-1 font-bold">(-{Math.ceil(nextGain.d_net_sta).toLocaleString()} Swings)</span>}
                          </div>
                        ) : (
                          <div className="text-[10px] mt-1 text-st-text-light bg-black/10 inline-block px-1 rounded opacity-75">
                            Next +1 Lvl Gain: 
                            {item.qty >= (item.maxAllowed - baseLvl) ? (
                              <span className="text-red-400 ml-1 font-bold">Max Level Reached</span>
                            ) : (
                              <span className="text-st-text-light ml-1">Unmeasurable (&lt;0.1)</span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {item.type === 'card' || (item.maxAllowed - baseLvl) <= 1 ? (
                          <span className="font-bold text-st-orange text-sm px-2 whitespace-nowrap">+{item.qty} Lvl</span>
                        ) : (
                          <div className="flex items-center bg-st-secondary border border-st-border rounded overflow-hidden">
                            <button onClick={() => setExactCartQty(idx, item.qty - 1)} className="px-2 py-1 hover:bg-black/10 font-bold text-st-text-light hover:text-st-orange transition-colors">-</button>
                            <input 
                              type="number"
                              min="1"
                              max={item.maxAllowed - baseLvl}
                              value={draftQty.index === idx ? draftQty.value : (item.qty === 0 ? '' : item.qty)}
                              onChange={(e) => setDraftQty({ index: idx, value: e.target.value })}
                              onBlur={() => {
                                if (draftQty.index === idx) {
                                  let parsed = parseInt(draftQty.value);
                                  if (isNaN(parsed)) parsed = 0;
                                  setExactCartQty(idx, parsed);
                                  setDraftQty({ index: null, value: '' });
                                }
                              }}
                              onKeyDown={(e) => { if(e.key === 'Enter') e.target.blur(); }}
                              className="w-12 h-8 p-1 text-center font-mono bg-transparent border-none outline-none"
                              style={{ appearance: 'textfield', MozAppearance: 'textfield' }}
                            />
                            <button onClick={() => setExactCartQty(idx, item.qty + 1)} className="px-2 py-1 hover:bg-black/10 font-bold text-st-text-light hover:text-st-orange transition-colors">+</button>
                          </div>
                        )}
                        <button
                          onClick={() => removeFromCart(idx)}
                          className="px-2 py-1 bg-[#2b2b2b] border border-red-900 text-red-400 font-bold text-xs rounded hover:bg-red-900 hover:text-white transition-colors"
                        >
                          Del
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex gap-4">
              <button 
                onClick={applyCartToGlobal}
                disabled={cartItems.length === 0}
                className="flex-1 py-2 bg-green-600 text-white font-bold rounded shadow hover:bg-green-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ✅ Apply Cart to Global Build
              </button>
              <button 
                onClick={() => setCartItems([ ])}
                disabled={cartItems.length === 0}
                className="py-2 px-6 bg-st-secondary border border-st-border text-st-text font-bold rounded hover:border-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {forecasterMode === 'wall' && hasAnalyzed && results && (
        <div className="animate-fade-in space-y-6">

          <div className="st-container border-t-4 border-t-st-orange">
            <h4 className="font-bold mb-4 text-xl">2. The Mathematical Diagnosis</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <div className="bg-st-bg border border-st-border rounded p-4 relative">
                {cartItems.length > 0 && <div className="absolute top-2 right-2 bg-green-500 text-white text-[10px] font-bold px-2 py-1 rounded animate-pulse">Cart Active</div>}
                <h5 className="font-bold text-st-text-light mb-2 border-b border-st-border pb-1 capitalize">Max Floor Push Potential</h5>
                
                {(() => {
                  const dist = results.baseline.floor_distribution ||[];
                  const runs = dist.length;
                  const successes = dist.filter(f => f >= targetFloor).length;
                  const prob = runs > 0 ? successes / runs : 0;
                  const estRuns = prob > 0 ? 1 / prob : Infinity;
                  const avgTime = results.baseline.avg_run_time || 0;
                  const estCost = prob > 0 ? (estRuns * avgTime) / 1000 : Infinity;
                  const isWithinBudget = estCost <= pushBudget;
                  
                  return (
                    <>
                      <div className="flex flex-col gap-2 mb-3">
                        <div className="flex justify-between items-center p-3 bg-black/20 rounded border border-st-border">
                          <span className="font-bold">Target Destination:</span>
                          <span className="font-mono text-lg text-white">Floor {targetFloor}</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-black/20 rounded border border-st-border">
                          <div className="flex flex-col">
                            <span className="font-bold">Probability to Reach:</span>
                            <span className="text-[10px] text-st-text-light mt-1">Based on a {simPrecision}-run Monte Carlo sweep</span>
                          </div>
                          <span className="font-mono text-xl text-st-orange font-bold">{(prob * 100).toFixed(1)}%</span>
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-2 mb-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-st-text-light">Expected Runs Needed:</span>
                          <span className="font-mono font-bold">{estRuns === Infinity ? 'Impossible' : Math.ceil(estRuns)}</span>
                        </div>
                        <div className="flex justify-between text-sm items-start">
                          <span className="text-st-text-light">Expected Arch Secs Cost:</span>
                          <div className="text-right flex flex-col items-end">
                            <span className={`font-mono font-bold ${estCost === Infinity ? 'text-red-400' : isWithinBudget ? 'text-green-400' : 'text-orange-400'}`}>
                              {estCost === Infinity ? '∞' : `${estCost.toFixed(1)}k`} / {pushBudget}k
                            </span>
                            {estCost !== Infinity && (
                              <span className="text-[10px] text-st-text-light font-mono mt-0.5 bg-black/10 px-1 rounded">
                                (~{Math.ceil(estRuns)} runs × ~{(avgTime / 1000).toFixed(1)}k sec)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {estCost === Infinity ? (
                        <div className="text-center font-bold text-red-400 bg-red-500/10 p-3 rounded border border-red-500/30 mt-2">Status: Mathematical Wall 🛑</div>
                      ) : isWithinBudget ? (
                        <div className="text-center font-bold text-green-400 bg-green-500/10 p-3 rounded border border-green-500/30 mt-2">Status: Push Approved ✅</div>
                      ) : (
                        <div className="text-center font-bold text-yellow-400 bg-yellow-500/10 p-3 rounded border border-yellow-500/30 mt-2">Status: Over Budget ⚠️</div>
                      )}
                    </>
                  );
                })()}

                {results.baseline.avg_max_floor < targetFloor && (
                  <div className="mt-4 pt-4 border-t border-st-border">
                    <div className="text-xs text-st-text-light mb-1">Cumulative Push Gauntlet (Floors {results.baseline.push_start_floor} ➔ {targetFloor}):</div>
                    <div className="text-xs text-st-text-light mb-2 italic">Aggregate cost across all generated blocks and empty slots in this range.</div>
                    <div className="flex justify-between text-xs font-mono mb-1"><span>Total Block Swings:</span> <span className="text-red-400">{Math.ceil(results.baseline.push_est_hits).toLocaleString()}</span></div>
                    <div className="flex justify-between text-xs font-mono"><span>Cumulative Net Stamina Drain:</span> <span className="text-orange-400 font-bold">{Math.ceil(results.baseline.net_sta).toLocaleString()}</span></div>
                  </div>
                )}
              </div>

              <div className="bg-st-bg border border-st-border rounded p-4">
                <h5 className="font-bold text-st-text-light mb-2 border-b border-st-border pb-1 capitalize flex items-center gap-2">
                  Target: {results.baseline.target_block} Breakpoints
                  <span className="text-[10px] bg-red-900/30 text-red-400 px-1 py-0.5 rounded normal-case font-normal border border-red-500/30 shadow-sm">Hardest Block</span>
                </h5>
                <div className="flex justify-between mb-1"><span>Current EDPS:</span> <span className="font-mono text-st-orange">{Math.floor(results.baseline.edps).toLocaleString()}</span></div>
                <div className="flex justify-between mb-3 border-b border-st-border pb-2"><span>Avg Hits to Kill:</span> <span className="font-mono text-white font-bold">{results.baseline.avg_hits}</span></div>
                
                <p className="text-xs text-st-text-light mb-3">Work backwards from your current {results.baseline.avg_hits} hits. Reach these thresholds to drop the block faster.</p>
                
                {(() => {
                  const currentHits = Math.ceil(results.baseline.hp / results.baseline.edps);
                  const hitTargets = [ ];
                  
                  if (currentHits <= 1) {
                    hitTargets.push(1);
                  } else {
                    for (let i = 1; i <= 4; i++) {
                      if (currentHits - i >= 1) hitTargets.push(currentHits - i);
                    }
                  }

                  return hitTargets.map(hits => {
                    const reqEDPS = results.baseline.hp / hits;
                    const gap = reqEDPS - results.baseline.edps;
                    const isMet = gap <= 0;
                    
                    return (
                      <div key={hits} className={`flex justify-between mb-2 p-2 rounded border ${isMet ? 'border-green-500/30 bg-green-500/5' : 'border-st-border bg-black/10'}`}>
                        <span className="font-bold">{hits} Hit{hits>1?'s':''}</span>
                        <div className="text-right">
                          <div className="font-mono text-sm">{Math.ceil(reqEDPS).toLocaleString()} EDPS</div>
                          {!isMet && <div className="text-xs text-red-400">Short: {Math.ceil(gap).toLocaleString()}</div>}
                          {isMet && <div className="text-xs text-green-400">Achieved ✅</div>}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

            </div>
          </div>

          <div className="st-container relative">
            {isAnalyzing && (
              <div className="absolute inset-0 z-10 bg-st-bg/80 backdrop-blur-[1px] flex flex-col items-center justify-center rounded border border-st-border">
                <div className="text-st-orange font-bold text-sm mb-2">{analysisMsg} ({Math.floor(progressPct)}%)</div>
                <div className="w-1/2 bg-[#1e1e1e] rounded-full h-2 overflow-hidden border border-st-border mb-4">
                  <div className="bg-st-orange h-2 transition-all duration-300" style={{ width: `${progressPct}%` }}></div>
                </div>
                <button 
                  onClick={handleCancel}
                  className="px-4 py-1 bg-[#2b2b2b] border border-red-900 text-red-400 font-bold text-xs rounded hover:bg-red-900 hover:text-white transition-colors"
                >
                  🛑 Cancel
                </button>
              </div>
            )}
            
            <h4 className="font-bold mb-2 text-xl">3. The Oracle's Shopping List</h4>
            <p className="text-sm text-st-text-light mb-6">These lists show the calculated benefit of adding exactly one (+1) level to each available upgrade. The gains are evaluated dynamically against your current Global Player Setup combined with any items sitting in your Cart. Add items to your Cart to step forward in time and reveal your next best moves!</p>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6">
              
              <div className="border border-st-border rounded bg-st-bg overflow-hidden flex flex-col">
                <div className="bg-st-secondary p-2 border-b border-st-border font-bold text-center text-red-400">
                  ⚔️ Top Gauntlet Swings Saved
                </div>
                <div className="text-[10px] text-center py-1 bg-black/20 text-st-text-light border-b border-st-border">Ranks Damage/Pen by how much Stamina it saves pushing to {targetFloor}</div>
                <div className="p-2 overflow-y-auto max-h-[400px]">
                  {results.topNetSta.length === 0 ? <div className="text-center text-sm p-4 text-st-text-light">No available upgrades reduce hits.</div> : results.topNetSta.map((item, idx) => (
                    <div key={idx} className="mb-3 pb-3 border-b border-st-border/50 last:border-0 last:mb-0">
                      <div className="font-bold text-sm leading-tight">
                        {item.name} 
                        <span className="text-xs text-st-text-light font-normal ml-1">({item.action})</span>
                        {item.desc && <div className="text-[11px] text-gray-400 mt-0.5">{item.desc}</div>}
                      </div>
                      <div className="flex justify-between mt-2 items-center">
                        <span className="text-[10px] text-st-text-light px-1 py-0.5 bg-black/10 rounded">{item.costStr}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-red-400 text-sm font-bold">-{Math.ceil(item.d_net_sta).toLocaleString()} swings</span>
                          <button onClick={() => addToCart(item)} className="px-2 py-1 bg-green-600 hover:bg-green-500 text-white font-bold text-xs rounded transition-colors">+ Cart</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border border-st-border rounded bg-st-bg overflow-hidden flex flex-col">
                <div className="bg-st-secondary p-2 border-b border-st-border font-bold text-center text-st-orange">
                  🔥 Top Raw EDPS Boosts
                </div>
                <div className="text-[10px] text-center py-1 bg-black/20 text-st-text-light border-b border-st-border">Ranks by pure Damage/Crit scaling output</div>
                <div className="p-2 overflow-y-auto max-h-[400px]">
                  {results.topEDPS.length === 0 ? <div className="text-center text-sm p-4 text-st-text-light">No available upgrades boost EDPS.</div> : results.topEDPS.map((item, idx) => (
                    <div key={idx} className="mb-3 pb-3 border-b border-st-border/50 last:border-0 last:mb-0">
                      <div className="font-bold text-sm leading-tight">
                        {item.name} 
                        <span className="text-xs text-st-text-light font-normal ml-1">({item.action})</span>
                        {item.desc && <div className="text-[11px] text-gray-400 mt-0.5">{item.desc}</div>}
                      </div>
                      <div className="flex justify-between mt-2 items-center">
                        <span className="text-[10px] text-st-text-light px-1 py-0.5 bg-black/10 rounded">{item.costStr}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-st-orange text-sm font-bold">+{Math.ceil(item.d_edps).toLocaleString()}</span>
                          <button onClick={() => addToCart(item)} className="px-2 py-1 bg-green-600 hover:bg-green-500 text-white font-bold text-xs rounded transition-colors">+ Cart</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border border-st-border rounded bg-st-bg overflow-hidden flex flex-col">
                <div className="bg-st-secondary p-2 border-b border-st-border font-bold text-center text-gray-300">
                  🛡️ Top Armor Pen Boosts
                </div>
                <div className="text-[10px] text-center py-1 bg-black/20 text-st-text-light border-b border-st-border">Ranks by pure Armor Pen scaling output</div>
                <div className="p-2 overflow-y-auto max-h-[400px]">
                  {results.baseline.armor_pen >= results.baseline.armor ? (
                     <div className="text-center text-sm p-4 text-green-400 font-bold">Armor Pen cap achieved for this block! No more needed.</div>
                  ) : results.topPen.length === 0 ? (
                     <div className="text-center text-sm p-4 text-st-text-light">No available upgrades boost Armor Pen.</div> 
                  ) : results.topPen.map((item, idx) => (
                    <div key={idx} className="mb-3 pb-3 border-b border-st-border/50 last:border-0 last:mb-0">
                      <div className="font-bold text-sm leading-tight">
                        {item.name} 
                        <span className="text-xs text-st-text-light font-normal ml-1">({item.action})</span>
                        {item.desc && <div className="text-[11px] text-gray-400 mt-0.5">{item.desc}</div>}
                      </div>
                      <div className="flex justify-between mt-2 items-center">
                        <span className="text-[10px] text-st-text-light px-1 py-0.5 bg-black/10 rounded">{item.costStr}</span>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <div className="font-mono text-gray-300 text-sm font-bold leading-none">+{Math.ceil(item.d_pen).toLocaleString()} Pen</div>
                            {(item.d_edps > 0.1 || item.d_net_sta > 0.1) && (
                              <div className="text-[10px] mt-1 leading-none">
                                {item.d_edps > 0.1 && <span className="text-st-orange mr-1">+{Math.ceil(item.d_edps).toLocaleString()} EDPS</span>}
                                {item.d_net_sta > 0.1 && <span className="text-red-400">-{Math.ceil(item.d_net_sta).toLocaleString()} Swings</span>}
                              </div>
                            )}
                          </div>
                          <button onClick={() => addToCart(item)} className="px-2 py-1 bg-green-600 hover:bg-green-500 text-white font-bold text-xs rounded transition-colors">+ Cart</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* STAMINA TABLE */}
              <div className="border border-st-border rounded bg-st-bg overflow-hidden flex flex-col">
                <div className="bg-st-secondary p-2 border-b border-st-border font-bold text-center text-blue-400">
                  ⚡ Top Stamina Boosts
                </div>
                <div className="text-[10px] text-center py-1 bg-black/20 text-st-text-light border-b border-st-border">Ranks by pure global Max Stamina increases</div>
                <div className="p-2 overflow-y-auto max-h-[400px]">
                  {results.topSta.length === 0 ? <div className="text-center text-sm p-4 text-st-text-light">No available upgrades boost Stamina.</div> : results.topSta.map((item, idx) => (
                    <div key={idx} className="mb-3 pb-3 border-b border-st-border/50 last:border-0 last:mb-0">
                      <div className="font-bold text-sm leading-tight">
                        {item.name} 
                        <span className="text-xs text-st-text-light font-normal ml-1">({item.action})</span>
                        {item.desc && <div className="text-[11px] text-gray-400 mt-0.5">{item.desc}</div>}
                      </div>
                      <div className="flex justify-between mt-2 items-center">
                        <span className="text-[10px] text-st-text-light px-1 py-0.5 bg-black/10 rounded">{item.costStr}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-blue-400 text-sm font-bold">+{Math.ceil(item.d_sta).toLocaleString()}</span>
                          <button onClick={() => addToCart(item)} className="px-2 py-1 bg-green-600 hover:bg-green-500 text-white font-bold text-xs rounded transition-colors">+ Cart</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}