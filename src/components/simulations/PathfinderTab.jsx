// src/components/simulations/PathfinderTab.jsx
import React, { useState, useMemo } from 'react';
import useStore from '../../store';
import { EngineWorkerPool } from '../../utils/optimizer';
import { runPathfinderSimulation } from '../../utils/pathfinder_engine';
import PlotComponent from 'react-plotly.js';

// Vite/CommonJS Interop Fix: Extract the component if Vite wrapped it in a Module object
const Plot = PlotComponent.default || PlotComponent;

export default function PathfinderTab() {
  const store = useStore();
  const[startMode, setStartMode] = useState('template');
  const [isSimulating, setIsSimulating] = useState(false);
  const [autoBuyGems, setAutoBuyGems] = useState(true);
  const abortConfigRef = React.useRef({ abort: false });
  const pathData = store.pathfinder_data;
  const setPathData = store.setPathfinderData;
  const[simStatus, setSimStatus] = useState('');
  const [simProgress, setSimProgress] = useState(0);
  const [groupBy, setGroupBy] = useState('floor'); // 'floor' or 'level'
  const [targetLevel, setTargetLevel] = useState("20"); // Absolute target level
  const [startFrags, setStartFrags] = useState(store.frags || { com: 0, rare: 0, epic: 0, leg: 0, myth: 0, div: 0 });
  const [startCardProgress, setStartCardProgress] = useState(store.card_progress || { });
  const [startExp, setStartExp] = useState(store.current_exp || 0);
  const [startSpeedPool, setStartSpeedPool] = useState(store.starting_speed_pool || 0);
  const [selectedFragPlot, setSelectedFragPlot] = useState('com');
  
  // Yield Rates Chart Filters
  const [showXpRates, setShowXpRates] = useState(true);
  const[showFragRates, setShowFragRates] = useState(true);
  const[selectedRateFrag, setSelectedRateFrag] = useState('div');
  
  // Card Plot Filters
  const [cardRarityFilter, setCardRarityFilter] = useState([ 'dirt', 'com', 'rare', 'epic', 'leg', 'myth', 'div' ]);
  const [showMasterChart, setShowMasterChart] = useState(true);

  // Interactive Diagnostics Toggle
  const [diagnosticView, setDiagnosticView] = useState('push_crit');

  // Sync workspace state inputs automatically when switching to "current" or applying a log state
  React.useEffect(() => {
    if (startMode === 'current') {
      setStartFrags(store.frags || { com: 0, rare: 0, epic: 0, leg: 0, myth: 0, div: 0 });
      setStartCardProgress(store.card_progress || { });
      setStartExp(store.current_exp || 0);
      setStartSpeedPool(store.starting_speed_pool || 0);
    }
  }, [ store.frags, store.card_progress, store.current_exp, store.starting_speed_pool, startMode ]);

  const handleFragChange = (key, val) => {
    setStartFrags(prev => ({ ...prev, [key]: parseFloat(val) || 0 }));
  };
  
  const handleAbort = () => {
    abortConfigRef.current.abort = true;
    setSimStatus('Aborting... Completing current step...');
  };

  const getCardSummary = (cards) => {
    let counts = { base: 0, gilded: 0, poly: 0, infernal: 0 };
    Object.values(cards || {}).forEach(v => {
      if (v === 1) counts.base++;
      else if (v === 2) counts.gilded++;
      else if (v === 3) counts.poly++;
      else if (v === 4) counts.infernal++;
    });
    return `Cards: ${counts.infernal} Inf, ${counts.poly} Poly, ${counts.gilded} Gild, ${counts.base} Base`;
  };

  const renderDirectorSummary = (state) => {
    const hestia = state.external_levels?.[ 4 ] || 0;
    const hades = state.external_levels?.[ 21 ] || 0;
    const upgs = state.upgrade_levels || { };
    const majorUpgsBought = (upgs[ 41 ] > 0) && (upgs[ 42 ] > 0) && (upgs[ 43 ] > 0) && (upgs[ 44 ] > 0) && (upgs[ 45 ] > 0);
    const crippled = (() => {
        if (hades < 6666) return false;
        if (hestia < 3000) return false;
        const highTierCards =[
            'div4', 'myth4', 'leg4', 'epic4', 'rare4', 'com4', 'dirt4',
            'div3', 'myth3', 'leg3', 'epic3', 'rare3', 'com3', 'dirt3'
        ];
        for (const c of highTierCards) {
            if ((state.cards?.[ c ] || 0) < 4) return false;
        }
        return true;
    })();
    
    let phase = 0;
    if (crippled) phase = 3;
    else if (hades >= 6666) phase = 2;
    else if (hestia >= 3000 && majorUpgsBought) phase = 1;
    
    return (
      <>
        <p className="mt-2 text-[#FAFAFA] font-bold">Autonomous Endgame Director:</p>
        <ul className="list-disc ml-4 opacity-80 mt-1.5 text-[11px] space-y-1">
          <li><strong className="text-red-400">Dual-Track Pushing:</strong> Maintains parallel Farm and Push builds, opportunistically brute-forcing max floors.</li>
          {phase === 0 && (
              <>
                  <li><strong className="text-st-orange">Opportunity Cost:</strong> Dynamically swaps Farm build between EXP and Frag targets to snipe the expensive mid-game fragment upgrades.</li>
                  <li><strong className="text-blue-400">Phase 1 (Divine Pivot):</strong> Post-Hestia (3000) & Upgrades Secured. Abandons EXP to pure-farm Divine Frags for Hades.</li>
                  <li><strong className="text-purple-400">Phase 2 (Card Hunt):</strong> Post-Hades (6666). Abandons frags to target highest unmaxed block tiers.</li>
                  <li><strong className="text-green-400">Phase 3 (Crippled):</strong> Post-T4/T3. Starves stat budget to hyper-farm low-tier cards without overkilling.</li>
                  <li><strong className="text-yellow-400">Ultimate Mastery:</strong> Locks build and engages rapid fast-forward once all Asc2 goals (Upgrades, Cards, Idols) are maxed.</li>
              </>
          )}
          {phase === 1 && (
              <>
                  <li><strong className="text-blue-400 text-st-text bg-blue-900/40 px-1 rounded">Active - Phase 1 (Divine Pivot):</strong> Hestia (3000) & Upgrades Secured. Abandoning EXP to pure-farm Divine Frags for Hades.</li>
                  <li><strong className="text-purple-400">Phase 2 (Card Hunt):</strong> Post-Hades (6666). Abandons frags to target highest unmaxed block tiers.</li>
                  <li><strong className="text-green-400">Phase 3 (Crippled):</strong> Post-T4/T3. Starves stat budget to hyper-farm low-tier cards without overkilling.</li>
              </>
          )}
          {phase === 2 && (
              <>
                  <li><strong className="text-purple-400 text-st-text bg-purple-900/40 px-1 rounded">Active - Phase 2 (Card Hunt):</strong> Hades (6666) maxed. Abandoning pure frags to target highest unmaxed block tiers.</li>
                  <li><strong className="text-green-400">Phase 3 (Crippled):</strong> Post-T4/T3. Starves stat budget to hyper-farm low-tier cards without overkilling.</li>
              </>
          )}
          {phase === 3 && (
              <>
                  <li><strong className="text-green-400 text-st-text bg-green-900/40 px-1 rounded">Active - Phase 3 (Crippled):</strong> T4/T3 Maxed. Starving stat budget to hyper-farm low-tier cards without overkilling.</li>
                  <li><strong className="text-yellow-400">Ultimate Mastery:</strong> Locks build and engages rapid fast-forward once all Asc2 goals (Upgrades, Cards, Idols) are maxed.</li>
              </>
          )}
        </ul>
      </>
    );
  };

  // Generic Number Formatter to keep the UI clean
  const formatNum = (val) => {
    if (val == null) return "0";
    if (val >= 1000000000) return (val / 1000000000).toFixed(2) + "b";
    if (val >= 1000000) return (val / 1000000).toFixed(2) + "m";
    if (val >= 1000) return (val / 1000).toFixed(1) + "k";
    return Math.floor(val).toString();
  };

  // Hardcoded Ascension 2 Starting Template Baseline
  const[minWinRate, setMinWinRate] = useState("20");
  const[templateType, setTemplateType] = useState('founder');
  const[startingArchSecs, setStartingArchSecs] = useState("0");
  const[searchFilter, setSearchFilter] = useState("");

  const handleApplySnapshot = (snap) => {
    if (!snap) return;
    // Inject directly into the Zustand workspace!
    useStore.setState({
      arch_level: snap.arch_level,
      current_max_floor: snap.current_max_floor,
      starting_speed_pool: snap.starting_speed_pool || 0,
      base_stats: { ...snap.base_stats },
      upgrade_levels: { ...snap.upgrade_levels },
      external_levels: snap.external_levels ? { ...snap.external_levels } : useStore.getState().external_levels,
      cards: snap.cards ? { ...snap.cards } : useStore.getState().cards,
      card_progress: snap.card_progress ? { ...snap.card_progress } : { },
      frags: snap.frags ? { ...snap.frags } : useStore.getState().frags,
      total_infernal_cards: snap.total_infernal_cards !== undefined ? snap.total_infernal_cards : useStore.getState().total_infernal_cards,
      current_exp: snap.current_exp || 0
    });
    
    // Auto-update the initial time for chunked simulations
    if (snap.arch_sec !== undefined) {
      setStartingArchSecs(Math.floor(snap.arch_sec).toString());
    }

    setSimStatus(`Workspace updated to Level ${snap.arch_level} / Floor ${snap.current_max_floor}!`);
    
    // Auto-scroll the user back up to the control panel so they can immediately run the next chunk!
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    setTimeout(() => setSimStatus(''), 3000);
  };

  const handleExportTimeline = () => {
    if (!pathData || !pathData.history || pathData.history.length === 0) return;
    
    // Dynamically pull the actual start and end levels from the timeline data itself
    const firstLevel = pathData.history[ 0 ]?.level || 1;
    const lastLevel = pathData.history[ pathData.history.length - 1 ]?.level || firstLevel;
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(pathData.history, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `pathfinder_timeline_lvl${firstLevel}_to_${lastLevel}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleImportTimelines = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    
    let combinedHistory = pathData ?[ ...pathData.history ] :[ ];
    let processed = 0;

    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target.result);
          if (Array.isArray(parsed)) combinedHistory = combinedHistory.concat(parsed);
        } catch (err) {
          console.error("Failed to parse timeline file", err);
        }
        
        processed++;
        if (processed === files.length) {
          // Sort by Arch Sec and Deduplicate by timestamp + event name
          combinedHistory.sort((a, b) => a.arch_sec - b.arch_sec);
          
          const unique =[ ];
          const seen = new Set();
          combinedHistory.forEach(ev => {
            const key = `${ev.arch_sec}_${ev.event}`;
            if (!seen.has(key)) {
              seen.add(key);
              unique.push(ev);
            }
          });

          setPathData({ history: unique });
          setSimStatus(`Successfully stitched ${files.length} chunk(s) into the timeline!`);
          setTimeout(() => setSimStatus(''), 4000);
        }
      };
      reader.readAsText(file);
    });
  };

  const chartData = useMemo(() => {
    if (!pathData) return null;
    const xVals =[ ];
    const xpVals =[ ];
    const pushXpVals =[ ];
    const farmFragVals =[ ];
    const pushFragVals =[ ];
    const levelVals =[ ];
    const floorVals =[ ];
    
    // Map the dropdown selection to the Pyodide dictionary keys
    const fragRateKey = { com: 'frag_1_per_min', rare: 'frag_2_per_min', epic: 'frag_3_per_min', leg: 'frag_4_per_min', myth: 'frag_5_per_min', div: 'frag_6_per_min' }[selectedRateFrag] || 'frag_6_per_min';
    const fragUIName = { com: 'Common', rare: 'Rare', epic: 'Epic', leg: 'Legendary', myth: 'Mythic', div: 'Divine' }[selectedRateFrag] || 'Common';

    // Decouple the Pivot X-axis so we can truncate it without breaking the Progression chart
    const pivotXVals =[ ];
    const ttnlVals =[ ];
    const ttfVals =[ ];
    let lastValidPivotIndex = -1;
    let currentIndex = 0;

    pathData.history.forEach(ev => {
      xVals.push(ev.arch_sec);
      
      const xpRate = ev.yields?.farm?.xp_per_min || 0;
      const pushXpRate = ev.yields?.push?.xp_per_min || 0;
      
      xpVals.push(xpRate);
      pushXpVals.push(pushXpRate);
      farmFragVals.push(ev.yields?.farm?.[fragRateKey] || 0);
      pushFragVals.push(ev.yields?.push?.[fragRateKey] || 0);
      levelVals.push(ev.level || 1);
      floorVals.push(ev.floor || 1);
      
      // SHADOW BUILD MATH: Calculate time to afford the 5 Late-Game Upgrades using the optimal frag potential
      const shadowYields = ev.yields?.frag_potential || ev.yields?.farm || { };
      const cRate = shadowYields.frag_1_per_min || 0;
      const rRate = shadowYields.frag_2_per_min || 0;
      const eRate = shadowYields.frag_3_per_min || 0;
      const mRate = shadowYields.frag_5_per_min || 0;

      // Extract current banked fragments
      const cBank = ev.frags?.com || 0;
      const rBank = ev.frags?.rare || 0;
      const eBank = ev.frags?.epic || 0;
      const mBank = ev.frags?.myth || 0;

      // Ignore milestones that are already purchased
      const upgs = ev.state_snapshot?.upgrade_levels || { };
      
      // Asc 2 base costs for Upgrades 41, 42, 43, 45, adjusted for the actual fragments we have already banked!
      const t41 = (upgs[ 41 ] > 0 || cRate <= 0) ? 999999 : Math.max(0, 100000 - cBank) / cRate;
      const t42 = (upgs[ 42 ] > 0 || rRate <= 0) ? 999999 : Math.max(0, 90000 - rBank) / rRate;
      const t43 = (upgs[ 43 ] > 0 || eRate <= 0) ? 999999 : Math.max(0, 80000 - eBank) / eRate;
      const t45 = (upgs[ 45 ] > 0 || mRate <= 0) ? 999999 : Math.max(0, 50000 - mBank) / mRate;
      
      let minTimeForBigUpg = Math.min(t41, t42, t43, t45);
      
      // Prevent Plotly log-scale crash by pushing null if all major upgrades are purchased
      const ttf = minTimeForBigUpg === 999999 ? null : minTimeForBigUpg;
      
      pivotXVals.push(ev.arch_sec);
      
      // Calculate true TTNL here
      const expNeeded = 10 * Math.pow(1.2, (ev.level || 1) + 1);
      ttnlVals.push(xpRate > 0 ? expNeeded / xpRate : 0);
      ttfVals.push(ttf);

      if (ttf !== null) {
          lastValidPivotIndex = currentIndex;
      }
      currentIndex++;
    });

    // DYNAMIC TRUNCATION: Slice the Opportunity Cost chart to end shortly after the final milestone is bought!
    let finalPivotX = pivotXVals;
    let finalTtnl = ttnlVals;
    let finalTtf = ttfVals;

    if (lastValidPivotIndex !== -1 && lastValidPivotIndex < pivotXVals.length - 1) {
        // Add a small 10-tick visual buffer so the line doesn't abruptly snap to the edge of the chart
        const sliceEnd = Math.min(pivotXVals.length, lastValidPivotIndex + 10);
        finalPivotX = pivotXVals.slice(0, sliceEnd);
        finalTtnl = ttnlVals.slice(0, sliceEnd);
        finalTtf = ttfVals.slice(0, sliceEnd);
    }

    return { xVals, xpVals, pushXpVals, farmFragVals, pushFragVals, fragUIName, levelVals, floorVals, pivotXVals: finalPivotX, ttnlVals: finalTtnl, ttfVals: finalTtf };
  },[ pathData, selectedRateFrag ]);

  const pushChartData = useMemo(() => {
    if (!pathData) return null;
    const xVals =[ ];
    const floors =[ ];
    const stats = { Str:[ ], Agi:[ ], Per:[ ], Int:[ ], Luck:[ ], Div:[ ], Corr:[ ], Unspent:[ ] };
    const statKeys =[ 'Str', 'Agi', 'Per', 'Int', 'Luck', 'Div', 'Corr' ];

    pathData.history.forEach(ev => {
      if (ev.type === 'floor' && ev.active_build_str) {
        xVals.push(ev.arch_sec);
        floors.push(ev.floor);
        // Extract the array from "[1/7/0/0/1/9/0]"
        const match = ev.active_build_str.match(/\[(.*?)\]/);
        if (match) {
          const parts = match[1].split('/');
          let used = 0;
          statKeys.forEach((key, idx) => {
            const val = parseInt(parts[idx]) || 0;
            stats[key].push(val);
            used += val;
          });
          const budget = (ev.level || 1) + (ev.state_snapshot?.upgrade_levels?.[ 12 ] || 0);
          stats.Unspent.push(Math.max(0, budget - used));
        }
      }
    });

    return { xVals, floors, stats };
  }, [ pathData ]);

  const farmChartData = useMemo(() => {
    if (!pathData) return null;
    const xVals =[ ];
    const stats = { Str:[ ], Agi:[ ], Per:[ ], Int:[ ], Luck:[ ], Div:[ ], Corr:[ ], Unspent:[ ] };
    const statKeys =[ 'Str', 'Agi', 'Per', 'Int', 'Luck', 'Div', 'Corr' ];

    pathData.history.forEach(ev => {
      if (ev.state_snapshot && ev.state_snapshot.base_stats) {
        xVals.push(ev.arch_sec);
        let used = 0;
        statKeys.forEach(key => {
          const val = ev.state_snapshot.base_stats[key] || 0;
          stats[key].push(val);
          used += val;
        });
        const budget = (ev.state_snapshot.arch_level || 1) + (ev.state_snapshot.upgrade_levels?.[12] || 0);
        stats.Unspent.push(Math.max(0, budget - used));
      }
    });

    return { xVals, stats };
  },[pathData]);

  const activeDiagnosticsTraces = useMemo(() => {
      if (diagnosticView === 'push_crit' && pushChartData) {
          return [
              { x: pushChartData.xVals, y: pushChartData.stats.Str, type: 'scatter', mode: 'lines', name: 'Str (Crit Dmg)', line: { color: '#ef4444', width: 2, shape: 'hv' }, xaxis: 'x9', yaxis: 'y10', legend: 'legend9' },
              { x: pushChartData.xVals, y: pushChartData.stats.Luck, type: 'scatter', mode: 'lines', name: 'Luck (Crit Chance)', line: { color: '#22c55e', width: 2, shape: 'hv' }, xaxis: 'x9', yaxis: 'y10', legend: 'legend9' },
              { x: pushChartData.xVals, y: pushChartData.stats.Div, type: 'scatter', mode: 'lines', name: 'Div (Super Crit)', line: { color: '#f9a8d4', width: 2, shape: 'hv' }, xaxis: 'x9', yaxis: 'y10', legend: 'legend9' }
          ];
      } else if (diagnosticView === 'farm_crit' && farmChartData) {
          return [
              { x: farmChartData.xVals, y: farmChartData.stats.Str, type: 'scatter', mode: 'lines', name: 'Str (Crit Dmg)', line: { color: '#ef4444', width: 2, shape: 'hv' }, xaxis: 'x9', yaxis: 'y10', legend: 'legend9' },
              { x: farmChartData.xVals, y: farmChartData.stats.Luck, type: 'scatter', mode: 'lines', name: 'Luck (Crit/Mods)', line: { color: '#22c55e', width: 2, shape: 'hv' }, xaxis: 'x9', yaxis: 'y10', legend: 'legend9' },
              { x: farmChartData.xVals, y: farmChartData.stats.Div, type: 'scatter', mode: 'lines', name: 'Div (Super Crit)', line: { color: '#f9a8d4', width: 2, shape: 'hv' }, xaxis: 'x9', yaxis: 'y10', legend: 'legend9' }
          ];
      }
      return [];
  }, [diagnosticView, pushChartData, farmChartData]);

  const fragDict = { 'com': 'Common', 'rare': 'Rare', 'epic': 'Epic', 'leg': 'Legendary', 'myth': 'Mythic', 'div': 'Divine' };

  const fragChartData = useMemo(() => {
    if (!pathData) return null;
    const xVals = [ ];
    const yVals = [ ];
    const markerX = [ ];
    const markerY = [ ];
    const markerText = [ ];

    const fragDict = { 'com': 'Common', 'rare': 'Rare', 'epic': 'Epic', 'leg': 'Legendary', 'myth': 'Mythic', 'div': 'Divine' };
    const fragUI = fragDict[selectedFragPlot];

    pathData.history.forEach(ev => {
      xVals.push(ev.arch_sec);
      const currentBank = ev.frags?.[selectedFragPlot] || 0;
      yVals.push(currentBank);

      const isStandardUpgrade = ev.type === 'upgrade' && ev.desc.includes(`Cost:`) && ev.desc.includes(fragUI);
      const isHestiaTribute = ev.type === 'system' && selectedFragPlot === 'com' && (ev.event || '').includes('Hestia Idol Tributed');
      const isDivineTribute = ev.type === 'system' && selectedFragPlot === 'div' && (ev.event || '').includes('Divine Idols Tributed');

      if (isStandardUpgrade || isHestiaTribute || isDivineTribute) {
        markerX.push(ev.arch_sec);
        markerY.push(currentBank);

        let costStr = '?';
        let title = ev.event;

        if (isStandardUpgrade) {
          const costMatch = ev.desc.match(/Cost:\s*([\d.]+)/);
          costStr = costMatch ? formatNum(parseFloat(costMatch[1])) : '?';
          title = ev.event.replace('🛒 Bought ', '');
        } else if (isHestiaTribute) {
          const lvlMatch = ev.event.match(/\(\+([\d]+)\s+Levels\)/);
          const lvls = lvlMatch ? parseInt(lvlMatch[1]) : 1;
          costStr = formatNum(lvls * 999);
        } else if (isDivineTribute) {
          const hMatch = ev.event.match(/\+([\d]+)\s+Hades/);
          const pMatch = ev.event.match(/\+([\d]+)\s+Prom/);
          const sMatch = ev.event.match(/\+([\d]+)\s+Sis/);
          
          const h = hMatch ? parseInt(hMatch[1]) : 0;
          const p = pMatch ? parseInt(pMatch[1]) : 0;
          const s = sMatch ? parseInt(sMatch[1]) : 0;
          
          costStr = formatNum((h + p + s) * 999);
        }

        markerText.push(
          `<b>${title}</b><br>` +
          `Cost: ${costStr} ${fragUI}<br>` +
          `Arch Lvl: ${ev.level} | Max Flr: ${ev.floor}`
        );
      }
    });

    const colors = {
      'com': '#9ca3af',
      'rare': '#3b82f6',
      'epic': '#a855f7',
      'leg': '#eab308',
      'myth': '#ef4444',
      'div': '#06b6d4'
    };

    // DYNAMIC TRUNCATION: Stop plotting dead currency! 
    // Find the absolute last time the fragment was actually spent, and slice the chart there.
    let finalXVals = xVals;
    let finalYVals = yVals;

    if (markerX.length > 0) {
        const lastMarkerX = markerX[markerX.length - 1];
        const cutoffIndex = xVals.findIndex(x => x > lastMarkerX);
        if (cutoffIndex !== -1) {
            // Keep exactly 1 extra data point to show the final purchase dropping the bank to 0
            finalXVals = xVals.slice(0, cutoffIndex + 1);
            finalYVals = yVals.slice(0, cutoffIndex + 1);
        }
    }

    return { xVals: finalXVals, yVals: finalYVals, markerX, markerY, markerText, color: colors[selectedFragPlot] };
  },[ pathData, selectedFragPlot ]);

  const cardSwimlaneData = useMemo(() => {
    if (!pathData) return null;

    // Group the data into three separate traces so Plotly generates a clickable legend!
    const traces = {
      gilded: { x: [ ], y: [ ], text: [ ], mode: 'markers', name: 'Base/Gilded', marker: { symbol: 'circle', color: '#ffffff', size: 8, line: { color: '#000', width: 1 } } },
      poly: { x: [ ], y: [ ], text: [ ], mode: 'markers', name: 'Poly', marker: { symbol: 'diamond', color: '#22c55e', size: 10, line: { color: '#000', width: 1 } } },
      infernal: { x: [ ], y: [ ], text: [ ], mode: 'markers', name: 'Infernal', marker: { symbol: 'star', color: '#f97316', size: 14, line: { color: '#000', width: 1 } } }
    };

    pathData.history.forEach(ev => {
      if (ev.type === 'card') {
        const parts = ev.event.split(': ');
        if (parts.length < 2) return;
        
        const blockId = parts[1]; // e.g., "div4"
        const rarity = blockId.replace(/[0-9]/g, '');
        const tier = `Tier ${blockId.replace(/[^0-9]/g, '')}`;

        if (!cardRarityFilter.includes(rarity)) return;

        let category = 'gilded';
        if (ev.event.includes('Poly')) category = 'poly';
        else if (ev.event.includes('Infernal')) category = 'infernal';

        traces[category].x.push(ev.arch_sec);
        traces[category].y.push(tier);
        traces[category].text.push(
          `<b>${ev.event}</b><br>Arch Lvl: ${ev.level} | Max Flr: ${ev.floor}`
        );
      }
    });
    
    // Calculate full absolute timeline range (with 2% padding) so the x-axis doesn't auto-shrink when filtering!
    let xRange = undefined;
    if (pathData.history.length > 0) {
      const minX = pathData.history[0].arch_sec;
      const maxX = pathData.history[pathData.history.length - 1].arch_sec;
      const pad = (maxX - minX) * 0.02 || 10;
      xRange =[ minX - pad, maxX + pad ];
    }

    return { traces:[ traces.gilded, traces.poly, traces.infernal ], xRange };
  },[ pathData, cardRarityFilter ]);

  const toggleRarityFilter = (rarity) => {
    setCardRarityFilter(prev => 
      prev.includes(rarity) ? prev.filter(r => r !== rarity) : [ ...prev, rarity ]
    );
  };

  const simulationInsights = useMemo(() => {
    if (!pathData) return null;
    const insights = [];
    const pivots = [];
    const minorPivots = [];
    const critPivots = [];
    const floorPivots = [];
    const phases = [];
    let phase1Hit = false;
    let phase2Hit = false;
    let crippledStarted = false;
    let masteryHit = false;
    let lastFloorWall = 0;

    const phaseColors = {
        'Phase 1: Divine': 'rgba(59, 130, 246, 0.08)',
        'Phase 2: Cards': 'rgba(168, 85, 247, 0.08)',
        'Phase 3: Crippled': 'rgba(74, 222, 128, 0.08)',
        'Ultimate Mastery': 'rgba(250, 204, 21, 0.08)'
    };
    
    let currentPhase = { label: 'Baseline', start: 0, color: 'rgba(255, 255, 255, 0.02)' };

    pathData.history.forEach((ev, idx) => {
        if (ev.type === 'system' && (ev.event.includes('Endgame Phase') || ev.event.includes('Ultimate Mastery'))) {
            let shortName = ev.event;
            if (shortName.includes('Phase 1')) shortName = 'Phase 1: Divine';
            else if (shortName.includes('Phase 2')) shortName = 'Phase 2: Cards';
            else if (shortName.includes('Phase 3')) shortName = 'Phase 3: Crippled';
            else if (shortName.includes('Mastery')) shortName = 'Ultimate Mastery';

            pivots.push({
                sec: ev.arch_sec,
                label: shortName,
                fullEvent: ev.event
            });

            currentPhase.end = ev.arch_sec;
            phases.push({ ...currentPhase });
            currentPhase = { label: shortName, start: ev.arch_sec, color: phaseColors[shortName] || 'rgba(255, 255, 255, 0.02)' };
        }

        // Detect Major Upgrade Snipes (Opportunity Cost Triggers)
        if (ev.type === 'upgrade' && ev.state_snapshot && idx > 0) {
            const prevEv = pathData.history[idx - 1];
            if (prevEv && prevEv.state_snapshot) {
                const curUpgs = ev.state_snapshot.upgrade_levels || {};
                const prevUpgs = prevEv.state_snapshot.upgrade_levels || {};
                
                const majorUpgs = {
                    41: 'Poly Card Bonus',
                    42: 'Frag Gain Mult',
                    43: 'Sta Mod Gain',
                    44: 'All Mod Chances',
                    45: 'Stat Cap Inc.'
                };
                
                for (const [id, label] of Object.entries(majorUpgs)) {
                    if ((curUpgs[id] || 0) === 1 && (prevUpgs[id] || 0) === 0) {
                        minorPivots.push({
                            sec: ev.arch_sec,
                            label: `Bought: ${label}`,
                            fullEvent: ev.event
                        });
                        break;
                    }
                }

                // Identify the specific upgrades that mathematically redefine the Crit Engine
                const critUpgs = {
                    13: 'Crits Unlocked',
                    30: 'Super Crits Scaled',
                    37: 'Ultra Crits Unlocked',
                    45: 'Stat Caps +5',
                    53: 'Super Crits Maxed'
                };

                for (const [id, label] of Object.entries(critUpgs)) {
                    if ((curUpgs[id] || 0) > 0 && (prevUpgs[id] || 0) === 0) {
                        critPivots.push({
                            sec: ev.arch_sec,
                            label: label
                        });
                        break;
                    }
                }
            }
        }

        if (ev.type === 'floor' && ev.state_snapshot) {
            // Track massive game difficulty spikes
            if (ev.floor >= 50 && lastFloorWall < 50) {
                floorPivots.push({ sec: ev.arch_sec, label: 'Floor 50 (HP x2 / Armor x1.5)' });
                lastFloorWall = 50;
            } else if (ev.floor >= 100 && lastFloorWall < 100) {
                floorPivots.push({ sec: ev.arch_sec, label: 'Floor 100 (HP x2 / Armor x1.5)' });
                lastFloorWall = 100;
            } else if (ev.floor >= 150 && lastFloorWall < 150) {
                floorPivots.push({ sec: ev.arch_sec, label: 'Floor 150 (HP x2 / Armor x1.5)' });
                lastFloorWall = 150;
            }
        }

        if (ev.type === 'system' && ev.event.includes('Phase 1') && !phase1Hit) {
            insights.push({
                icon: '💎', title: 'Divine Idol Pivot',
                desc: `At Arch Level ${ev.level}, Hestia was maxed. The engine abandoned XP progression to farm Divine Fragments for Hades Idol levels, while passively acquiring Infernal fragments and finishing remaining upgrades.`,
                actionText: 'See Plot 4 (Economy)',
                actionTarget: 'chart-econ'
            });
            phase1Hit = true;
        }

        if (ev.type === 'system' && ev.event.includes('Phase 2') && !phase2Hit) {
            insights.push({
                icon: '🎴', title: 'Card Hunting Pivot',
                desc: `At Arch Level ${ev.level}, Hades was maxed. The engine switched to a Block Card Farming build to target high-tier (T3 and T4) card fragment drops, prioritizing highest rarity first.`,
                actionText: 'See Plot 10 (Card Drops)',
                actionTarget: 'chart-card'
            });
            phase2Hit = true;
        }

        if (ev.type === 'system' && ev.event.includes('Phase 3') && !crippledStarted) {
            insights.push({
                icon: '📉', title: 'Crippled Farm Engaged',
                desc: `At Arch Level ${ev.level}, the engine detected all high-tier cards were maxed. It intentionally abandoned your stat budget to farm low-tier blocks without wasting time on overkill.`,
                actionText: 'See Plot 5 (Farm Stats)',
                actionTarget: 'chart-farm'
            });
            crippledStarted = true;
        }

        if (ev.type === 'system' && (ev.event.includes('Tech Tree Exhausted') || ev.event.includes('Asc2 Goals Completed')) && !masteryHit) {
            insights.push({
                icon: '🏆', title: 'Asc2 Goals Completed',
                desc: `At Arch Level ${ev.level}, all Upgrades, Cards, and Idols were mathematically maxed. The optimizer locked the build and fast-forwarded the remaining timeline.`,
                actionText: 'See Plot 1 (Progression)',
                actionTarget: 'chart-prog'
            });
            masteryHit = true;
        }
    });

    if (pathData.history.length > 0) {
        currentPhase.end = pathData.history[pathData.history.length - 1].arch_sec;
        phases.push(currentPhase);
    }

    return { insights, pivots, minorPivots, critPivots, floorPivots, phases };
  }, [ pathData ]);

  const templates = {
    founder: {
      name: "Founder_Asc2_Start",
      arch_level: 1,
      current_max_floor: 1,
      starting_speed_pool: 0,
      geoduck_unlocked: true,
      arch_ability_infernal_bonus: -0.14,
      total_infernal_cards: 299,
      base_stats: { Str: 0, Agi: 0, Per: 0, Int: 0, Luck: 0, Div: 0, Corr: 0 },
      upgrade_levels: { },
      external_levels: { 4: 2500, 5: 11, 6: 10, 7: 10, 8: 100, 9: 1, 10: 1, 11: 1, 12: 1, 13: 1, 14: 1, 15: 1, 16: 1, 17: 1, 18: 1, 19: 1, 20: 4, 21: 250 },
      cards: { dirt1: 3, dirt2: 3, dirt3: 4, com1: 3, com2: 3, com3: 4, rare1: 3, rare2: 3, rare3: 4, epic1: 3, epic2: 3, epic3: 4, leg1: 3, leg2: 3, leg3: 4, myth1: 3, myth2: 3, myth3: 3, div1: 3, div2: 3, div3: 3 }
    },
    f2p: {
      name: "F2p_Asc2_Start",
      arch_level: 1,
      current_max_floor: 1,
      starting_speed_pool: 0,
      geoduck_unlocked: true,
      arch_ability_infernal_bonus: -0.14,
      total_infernal_cards: 299,
      base_stats: { Str: 0, Agi: 0, Per: 0, Int: 0, Luck: 0, Div: 0, Corr: 0 },
      upgrade_levels: { },
      external_levels: { 4: 2500, 5: 11, 6: 9, 7: 9, 8: 50, 9: 1, 10: 1, 11: 1, 12: 1, 13: 1, 14: 1, 20: 4, 21: 250 },
      cards: { dirt1: 3, dirt2: 3, dirt3: 4, com1: 3, com2: 3, com3: 4, rare1: 3, rare2: 3, rare3: 4, epic1: 3, epic2: 3, epic3: 4, leg1: 3, leg2: 3, leg3: 4, myth1: 3, myth2: 3, myth3: 3, div1: 3, div2: 3, div3: 3 }
    }
  };

  const asc2Template = templates[templateType];

  const handleStartPathfinder = async () => {
    const parsedTarget = parseInt(targetLevel);
    const startLevel = startMode === 'template' ? asc2Template.arch_level : store.arch_level;
    const targetArch = (!isNaN(parsedTarget) && parsedTarget > startLevel) 
      ? parsedTarget 
      : startLevel + 1; 
      
    if (targetArch - startLevel > 10) {
        if (!window.confirm(`Warning: You are attempting to simulate ${targetArch - startLevel} Arch Levels at once.\n\nBecause this tool simulates entire timelines of upgrades and floor pushes, doing more than 5-10 levels can take a VERY long time and may crash your browser.\n\nAre you sure you want to proceed?`)) {
            return;
        }
    }
      
    setIsSimulating(true);
    setPathData(null);
    setSimProgress(0);
    setSimStatus('Booting Engine...');
    abortConfigRef.current = { abort: false };
    
    try {
      await new Promise(r => setTimeout(r, 50)); // Yield to allow React to paint the status
              
              const pool = new EngineWorkerPool();
              await pool.init(undefined, (ready, total) => {
                  setSimStatus(`Booting Engine Workers (${ready}/${total})...`);
              });
              
              setSimStatus('Syncing Engine State...');
      await new Promise(r => setTimeout(r, 50));
      
      // Force Asc2 Unlocked for the template start!
      const activeState = startMode === 'template' ? { ...asc2Template, asc2_unlocked: true, asc1_unlocked: true, card_progress: { } } : {
        asc1_unlocked: store.asc1_unlocked,
        asc2_unlocked: store.asc2_unlocked,
        arch_level: store.arch_level,
        current_max_floor: store.current_max_floor,
        starting_speed_pool: startSpeedPool,
        arch_ability_infernal_bonus: parseFloat(store.arch_ability_infernal_bonus) / 100.0,
        total_infernal_cards: store.total_infernal_cards,
        base_stats: store.base_stats,
        upgrade_levels: store.upgrade_levels,
        external_levels: { ...store.external_levels, 8: store.geoduck_unlocked ? (store.external_levels[ 8 ] || 0) : 0 },
        cards: store.cards,
        card_progress: startCardProgress
      };

      await pool.syncState(activeState);

      // Sanitize the user input: must be numeric, and strictly > current arch level
      const parsedTarget = parseInt(targetLevel);
      const targetArch = (!isNaN(parsedTarget) && parsedTarget > activeState.arch_level) 
        ? parsedTarget 
        : activeState.arch_level + 1; 
      
      // Pass the user's manual fragments if using current workspace, otherwise start at 0
      const initialFrags = startMode === 'template' 
        ? { com: 0, rare: 0, epic: 0, leg: 0, myth: 0, div: 0 } 
        : startFrags;

      const parsedMinWinRate = parseFloat(minWinRate) || 20;
      const parsedArchSecs = parseFloat(startingArchSecs) || 0;
      const parsedExp = startMode === 'template' ? 0 : (parseFloat(startExp) || 0);

      const result = await runPathfinderSimulation(activeState, targetArch, initialFrags, pool, parsedMinWinRate, parsedArchSecs, parsedExp, (prog) => {
        setSimProgress(prog.progress);
        setSimStatus(prog.status);
      }, autoBuyGems, abortConfigRef.current);

      pool.terminate();
      setPathData(result);
      
    } catch (err) {
      console.error(err);
      setSimStatus('Engine Error: ' + err.message);
    }
    
    setIsSimulating(false);
  };

  return (
    <div className="animate-fade-in space-y-6">
      
      {/* HEADER */}
      <div className="bg-st-secondary/30 border-l-4 border-st-orange p-4 rounded shadow-sm">
        <h2 className="text-xl font-bold text-st-text mb-2">Ascension Pathfinder (Alpha)</h2>
        <div className="text-sm text-st-text-light mb-4 space-y-2">
          <p>
            My experimental macro-optimizer. Rather than a strict step-by-step guide, I built this as a data-mining tool to project your optimal trajectory over short bursts (5-10 Arch Levels) from your current state.
          </p>
          <p>
            By forecasting milestones, fragment accumulation, and card drops over Expected Arch Time, you can use these timelines to set realistic progression expectations. It's designed to help you estimate how long it will take to farm missing cards, discover exactly when to stop buying cheap upgrades to save for expensive ones, or identify massive power spikes where you can push multiple max floors at once. You can also stitch together multiple exported chunks to aggregate data across huge Arch Level gaps, revealing sweeping, long-term macroeconomic shifts. Dive in, explore the data, and uncover the endgame trends for yourself.
          </p>
        </div>
        <div className="mt-4 border-t border-st-border pt-4">
          <h4 className="font-bold text-st-orange mb-2">💡 How to use the Pathfinder:</h4>
          <div className="text-sm text-st-text-light space-y-2">
            <p><strong>1. Set the Starting Point:</strong> Choose a fresh template or your Current Workspace. If using your workspace, make sure to fill out your current Fragment Bank and pending Card Fragments below.</p>
            <p><strong>2. Define the Goal:</strong> Enter the Target Arch Level (keep it 5-10 levels ahead) and set your Floor Push Safety (Win Rate).</p>
            <p><strong>3. Run the Timeline:</strong> The engine will dual-track your Farm and Push builds, automatically fast-forwarding time to snipe upgrades, farm cards, and push floors.</p>
            <p><strong>4. Export & Analyze:</strong> <span className="text-st-orange font-bold">⚠️ Data is NOT auto-saved!</span> Click <strong>Export Chunk</strong> in the Timeline Data Tools below to save your run. Use the charts and logs to guide your real in-game decisions.</p>
            <p><strong>5. Leapfrog & Stitch:</strong> To simulate further, hover over the very last event in the Node-Graph log and click the <strong>Apply Player State</strong> icon. <strong>Crucially, ensure "Current Workspace State" is selected under Starting Point above.</strong> This loads the exact end-state into your workspace so you can run the next 5-10 level batch. Later, use <strong>Stitch Chunks</strong> to combine all your downloaded files into one massive Master Timeline!</p>
            <p>💡 <strong>Pro-Tip (Deep Analysis):</strong> You can click the <strong>Apply Player State</strong> icon on <em>any</em> event in the Node-Graph to instantly load that specific moment into your global workspace. This lets you jump to the Optimizer, Synthesis, or Duel tabs to run deep targeted analyses on that exact point in time!</p>
          </div>
          <div className="mt-3 p-2 bg-red-900/20 border-l-2 border-red-500 rounded text-xs text-red-400">
            ⚠️ <strong>Performance Warning:</strong> Because this tool simulates entire timelines of upgrades and floor pushes, it takes <em>significantly</em> longer than a standard optimization sprint. I strongly recommend projecting no more than <strong>5 to 10 levels at a time</strong> to prevent extreme compute times (though jumping from 1 to 20 is generally safe for a fresh start). Please be patient while the engine computes!
          </div>
        </div>
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

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div>
            <label className="block text-sm font-bold text-st-text mb-2">Target Arch Level:</label>
            <input 
              type="number" 
              min="2"
              value={targetLevel}
              onChange={(e) => setTargetLevel(e.target.value)}
              className={`w-full bg-[#0E1117] border rounded p-2 text-st-text outline-none focus:border-st-orange ${
                parseInt(targetLevel) <= (startMode === 'template' ? asc2Template.arch_level : store.arch_level) 
                  ? 'border-red-500' 
                  : 'border-st-border'
              }`}
              placeholder="e.g. 50"
            />
            {parseInt(targetLevel) <= (startMode === 'template' ? asc2Template.arch_level : store.arch_level) ? (
              <span className="text-[10px] text-red-400 font-bold block mt-1">Must be greater than starting level!</span>
            ) : (
              <span className="text-[10px] text-st-orange font-bold block mt-1">⚠️ Target ARCH LEVEL, not Max Floor! Keep jumps to 5-10 max.</span>
            )}
          </div>
          <div>
            <label className="block text-sm font-bold text-st-text mb-2">Push Safety (Win %):</label>
            <input 
              type="number" 
              min="1"
              max="100"
              value={minWinRate}
              onChange={(e) => setMinWinRate(e.target.value)}
              className="w-full bg-[#0E1117] border border-st-border rounded p-2 text-st-text focus:border-st-orange outline-none"
              placeholder="e.g. 20"
            />
            <span className="text-[10px] text-st-text-light block mt-1">Min success required to push.</span>
          </div>
          <div>
            <label className="block text-sm font-bold text-st-text mb-2">Starting Clock (Secs):</label>
            <input 
              type="number" 
              min="0"
              value={startingArchSecs}
              onChange={(e) => setStartingArchSecs(e.target.value)}
              className="w-full bg-[#0E1117] border border-st-border rounded p-2 text-st-text focus:border-st-orange outline-none"
              placeholder="e.g. 0"
            />
            <span className="text-[10px] text-st-text-light block mt-1">Offset for chunked sims.</span>
          </div>
          <div>
            <label className="block text-sm font-bold text-st-text mb-2">Auto-Buy Gem Upgs:</label>
            <label className="flex items-center gap-2 cursor-pointer mt-3">
              <input 
                type="checkbox" 
                checked={autoBuyGems}
                onChange={(e) => setAutoBuyGems(e.target.checked)}
                className="w-4 h-4 accent-st-orange cursor-pointer"
              />
              <span className="text-sm text-st-text">Buy instantly</span>
            </label>
            <span className="text-[10px] text-st-text-light block mt-1">Disable if you still need to spend Gems elsewhere.</span>
          </div>
        </div>

        <div className="bg-[#0E1117] p-3 rounded border border-st-border text-xs font-mono text-st-text-light mb-6">
          {startMode === 'template' ? (
            <div>
              <div className="mb-4 pb-4 border-b border-st-border flex flex-col md:flex-row md:items-center gap-3">
                <label className="font-bold text-[#FAFAFA]">Select Template Profile:</label>
                <select 
                  value={templateType} 
                  onChange={(e) => setTemplateType(e.target.value)}
                  className="bg-st-bg border border-st-border rounded px-3 py-1.5 text-st-text focus:border-st-orange outline-none font-bold"
                >
                  <option value="founder">Founder_Asc2_Start</option>
                  <option value="f2p">F2p_Asc2_Start</option>
                </select>
              </div>
              <p>Loaded Profile: <span className="text-st-orange font-bold">{asc2Template.name}</span></p>
              <p>Arch Level: {asc2Template.arch_level} | Max Floor: {asc2Template.current_max_floor}</p>
              <p>Hestia Lvl: {asc2Template.external_levels[ 4 ]} | Hades Lvl: {asc2Template.external_levels[ 21 ]}</p>
              <p>Total Infernal Cards: {asc2Template.total_infernal_cards} | {getCardSummary(asc2Template.cards)}</p>
              {renderDirectorSummary(asc2Template)}
            </div>
          ) : (
            <div>
              <div className="flex flex-wrap items-center gap-6">
                <div>
                  <p className="text-st-text font-bold">Arch Level: <span className="text-st-orange">{store.arch_level}</span></p>
                  <p className="text-st-text font-bold">Max Floor: <span className="text-st-orange">{store.current_max_floor}</span></p>
                  <p className="text-st-text font-bold text-xs mt-1">Hestia Lvl: <span className="text-st-orange">{store.external_levels[ 4 ] || 0}</span> | Hades Lvl: <span className="text-st-orange">{store.external_levels[ 21 ] || 0}</span></p>
                  <p className="text-st-text font-bold text-xs mt-1">Infernals: <span className="text-st-orange">{store.total_infernal_cards || 0}</span> | {getCardSummary(store.cards)}</p>
                </div>
                <div className="border-l border-st-border pl-6">
                  <label className="block text-[10px] font-bold text-st-text-light mb-1 uppercase tracking-wider">Current EXP towards Lvl {store.arch_level + 1}:</label>
                  <input 
                    type="number" 
                    min="0"
                    value={startExp === 0 ? '' : startExp}
                    onChange={(e) => setStartExp(parseFloat(e.target.value) || 0)}
                    className="bg-st-bg border border-st-border rounded px-2 py-1.5 text-st-text focus:border-st-orange outline-none text-xs w-48 font-mono"
                    placeholder="0"
                  />
                  <label className="block text-[10px] font-bold text-st-text-light mb-1 mt-3 uppercase tracking-wider">Starting Speed Mod Charge Pool:</label>
                  <input 
                    type="number" 
                    min="0"
                    value={startSpeedPool === 0 ? '' : startSpeedPool}
                    onChange={(e) => setStartSpeedPool(parseInt(e.target.value) || 0)}
                    className="bg-st-bg border border-st-border rounded px-2 py-1.5 text-st-text focus:border-st-orange outline-none text-xs w-48 font-mono"
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="mt-4 border-t border-st-border pt-2">
                {renderDirectorSummary(store)}
              </div>
              
              <details className="mt-4 border-t border-st-border pt-4 group cursor-pointer marker:text-st-orange">
                <summary className="text-sm font-bold text-[#FAFAFA] select-none outline-none">
                  Starting Fragment Bank 
                  <span className="text-xs text-st-text-light font-normal ml-2">
                    ({Object.values(startFrags).reduce((a, b) => a + (b||0), 0) > 0 ? "Bank populated" : "Empty"})
                  </span>
                </summary>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mt-4 cursor-default">
                  {[
                    { id: 'com', label: 'Common' }, { id: 'rare', label: 'Rare' }, 
                    { id: 'epic', label: 'Epic' }, { id: 'leg', label: 'Legendary' }, { id: 'myth', label: 'Mythic' }, 
                    { id: 'div', label: 'Divine' }
                  ].map(f => (
                    <div key={f.id} className="flex flex-col">
                      <label className="text-[10px] text-st-text-light mb-1">{f.label}</label>
                      <input 
                        type="number" 
                        step="0.1" 
                        min="0" 
                        value={startFrags[f.id] === 0 ? '' : startFrags[f.id]} 
                        onChange={(e) => handleFragChange(f.id, e.target.value)} 
                        className="bg-st-bg border border-st-border rounded px-2 py-1 text-st-text focus:border-st-orange outline-none text-xs"
                        placeholder="0.0"
                      />
                    </div>
                  ))}
                </div>
              </details>

              <details className="mt-4 border-t border-st-border pt-4 group cursor-pointer marker:text-st-orange">
                <summary className="text-sm font-bold text-[#FAFAFA] select-none outline-none">
                  Pending Card Fragment Drops 
                  <span className="text-xs text-st-text-light font-normal ml-2">
                    ({Object.values(startCardProgress).filter(v => v > 0).length} partial cards pending)
                  </span>
                </summary>
                <div className="text-[11px] text-st-text-light mt-2 mb-4 italic cursor-default">
                  Enter your current fragment count (0 to 9) for any Polychrome (L3) or Infernal (L4) cards you are actively hunting. 
                  Base and Gilded cards only require 1 drop, so they are not tracked here.
                </div>
                <div className="grid grid-cols-4 md:grid-cols-9 gap-2 max-h-64 overflow-y-auto pr-1 cursor-default">
                  {[
                    'dirt1', 'dirt2', 'dirt3', 'dirt4',
                    'com1', 'com2', 'com3', 'com4',
                    'rare1', 'rare2', 'rare3', 'rare4',
                    'epic1', 'epic2', 'epic3', 'epic4',
                    'leg1', 'leg2', 'leg3', 'leg4',
                    'myth1', 'myth2', 'myth3', 'myth4',
                    'div1', 'div2', 'div3', 'div4'
                  ].map(blockId => {
                    const lvl = store.cards[blockId] || 0;
                    
                    // We only allow editing for Poly/Infernal crafts, which ALWAYS strictly require 10 fragments
                    const canEdit = lvl > 0 && lvl < 4;
                    
                    // Convert internal EV back to UI Fragments for display (10 frags = 9.669 EV)
                    const currentEv = startCardProgress[blockId] || 0;
                    const displayFrags = currentEv > 0 ? Number((currentEv / 0.9669).toFixed(2)) : '';
                    
                    return (
                      <div key={blockId} className="flex flex-col">
                        <label className={`text-[10px] mb-1 capitalize ${canEdit ? 'text-st-text-light' : 'text-st-border'}`}>
                          {blockId} (L{lvl})
                        </label>
                        <input
                          type="number"
                          step="1"
                          min="0"
                          max="9"
                          disabled={!canEdit}
                          value={canEdit ? displayFrags : ''}
                          onChange={(e) => {
                              const frags = parseFloat(e.target.value);
                              // Convert inputted fragments into exact mathematical engine Expected Value
                              const ev = isNaN(frags) ? 0 : frags * 0.9669;
                              setStartCardProgress(p => ({ ...p, [blockId]: ev }));
                          }}
                          className={`bg-st-bg border border-st-border rounded px-2 py-1 focus:border-st-orange outline-none text-xs ${!canEdit ? 'opacity-50 cursor-not-allowed text-st-border' : 'text-st-text'}`}
                          placeholder={canEdit ? "0" : "N/A"}
                        />
                      </div>
                    );
                  })}
                </div>
              </details>
            </div>
          )}
        </div>

        <div className="flex flex-col md:flex-row gap-4 mt-6">
          <button
            onClick={handleStartPathfinder}
            disabled={isSimulating}
            className="w-full py-3 bg-st-orange text-st-bg rounded font-bold text-lg hover:bg-opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md flex flex-col items-center justify-center"
          >
            <span>{isSimulating ? simStatus : 'Run Path Simulation'}</span>
            {isSimulating && (
              <div className="w-1/2 bg-st-bg/20 rounded h-1.5 mt-2 overflow-hidden">
                <div className="bg-white h-full transition-all duration-300" style={{ width: `${simProgress}%` }} />
              </div>
            )}
          </button>
          {isSimulating && (
            <button
              onClick={handleAbort}
              className="py-3 px-6 bg-red-600 text-white rounded font-bold text-lg hover:bg-opacity-90 transition-all shadow-md shrink-0 flex items-center justify-center gap-2"
            >
              <span>🛑</span> Stop & Save Partial
            </button>
          )}
        </div>
      </div>

      {/* TIMELINE TOOLS (ALWAYS VISIBLE) */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-[#0E1117] border border-st-border rounded p-3 shadow-sm">
        <div className="text-st-text font-bold text-sm mb-3 md:mb-0">
          Timeline Data Tools
        </div>
        <div className="flex flex-wrap gap-3">
          {pathData && (
            <button 
              onClick={handleExportTimeline}
              className="px-3 py-1.5 bg-st-secondary text-st-text rounded text-xs font-bold hover:bg-st-orange transition-colors border border-st-border flex items-center gap-1"
            >
              💾 Export Chunk
            </button>
          )}
          <label className="px-3 py-1.5 bg-st-secondary text-st-text rounded text-xs font-bold hover:text-purple-400 transition-colors cursor-pointer border border-st-border flex items-center gap-1">
            <span>{pathData ? '🔗 Stitch Chunks' : '📂 Load Timeline (JSON)'}</span>
            <input type="file" multiple accept=".json" className="hidden" onChange={handleImportTimelines} />
          </label>
          {pathData && (
            <button 
              onClick={() => setPathData(null)}
              className="px-3 py-1.5 bg-st-secondary text-st-text rounded text-xs font-bold hover:text-red-400 transition-colors border border-st-border"
            >
              🗑️ Clear Data
            </button>
          )}
        </div>
      </div>

      {/* VISUALIZATIONS & RESULTS AREA */}
      {!pathData && !isSimulating && (
        <div className="bg-[#0E1117] border border-st-border rounded p-8 shadow-sm animate-fade-in mb-6 text-center mt-6">
          <h3 className="text-2xl font-bold text-st-text mb-3">Ready to Simulate</h3>
          <p className="text-sm text-st-text-light mb-8 max-w-3xl mx-auto leading-relaxed">
            The Pathfinder Macro-Stepper uses a dual-track progression model to simulate thousands of runs, automatically predicting when you should pivot between EXP, Fragment, and Card farming strategies. 
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left max-w-5xl mx-auto">
            <div className="bg-st-secondary/20 p-5 rounded border border-st-border hover:border-st-orange transition-colors">
              <div className="text-st-orange font-bold mb-2 flex items-center gap-2"><span className="text-xl">⏱️</span> Opportunity Cost</div>
              <div className="text-xs text-gray-400 leading-relaxed">The engine automatically calculates the ROI of waiting for a milestone vs spending immediately. It plots this crossover point exactly on the timeline.</div>
            </div>
            <div className="bg-st-secondary/20 p-5 rounded border border-st-border hover:border-purple-400 transition-colors">
              <div className="text-purple-400 font-bold mb-2 flex items-center gap-2"><span className="text-xl">📉</span> Crippled Builds</div>
              <div className="text-xs text-gray-400 leading-relaxed">Watch the engine organically discover that it needs to starve its own stats (Unspent &gt; 0) to efficiently farm Tier 1/2 cards in the extreme endgame.</div>
            </div>
            <div className="bg-st-secondary/20 p-5 rounded border border-st-border hover:border-pink-400 transition-colors">
              <div className="text-pink-400 font-bold mb-2 flex items-center gap-2"><span className="text-xl">⚔️</span> The Critical Hit Engine</div>
              <div className="text-xs text-gray-400 leading-relaxed">See exactly how the optimizer shifts points between Strength, Luck, and Divinity to trigger compounding Super and Ultra crits as block HP scales up.</div>
            </div>
          </div>
        </div>
      )}

      {pathData && (
        <>
          {/* EDUCATIONAL RULES & CONTROLS */}
          <div className="bg-[#0E1117] border border-st-border rounded p-4 shadow-sm animate-fade-in mb-6 mt-6">
            <div className="flex flex-col md:flex-row justify-between items-center border-b border-st-border pb-2 mb-4">
              <h3 className="text-xl font-bold text-st-text flex items-center gap-2">
                 <span className="text-purple-400">🧠</span> Master Timeline Analysis
              </h3>
              <button 
                onClick={() => setShowMasterChart(!showMasterChart)}
                className="px-4 py-1.5 bg-st-secondary border border-st-border text-st-text hover:text-st-orange hover:border-st-orange text-xs font-bold rounded transition-colors"
              >
                {showMasterChart ? "🙈 Hide 4000px Chart" : "👁️ Show Master Chart"}
              </button>
            </div>
            
            {simulationInsights && simulationInsights.insights.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-6">
                {simulationInsights.insights.map((insight, i) => (
                  <div key={i} className="bg-[#1a1a1a] p-3 rounded border border-st-border border-l-2 border-l-st-orange shadow-md relative overflow-hidden flex flex-col justify-between">
                    <div>
                      <div className="absolute -right-4 -top-4 text-5xl opacity-5">{insight.icon}</div>
                      <h4 className="text-xs font-bold text-gray-200 mb-1 flex items-center gap-1">
                        <span>{insight.icon}</span> {insight.title}
                      </h4>
                      <p className="text-[10px] text-gray-400 leading-relaxed mb-3">
                        {insight.desc}
                      </p>
                    </div>
                    {insight.actionText && (
                      <button 
                        onClick={() => document.getElementById(insight.actionTarget)?.scrollIntoView({behavior: 'smooth'})}
                        className="text-[10px] text-st-orange font-bold text-left hover:text-[#4ade80] transition-colors self-start flex items-center gap-1 mt-auto z-10 relative"
                      >
                        ⬇️ {insight.actionText}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {showMasterChart && (
              <div className="flex relative mt-4">
                {/* STICKY ELEVATOR NAV */}
                <div className="hidden xl:block w-32 shrink-0 relative mr-4">
                  <div className="sticky top-20 flex flex-col gap-2 p-3 bg-[#111]/90 backdrop-blur-md border border-st-border rounded shadow-lg z-40">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider text-center border-b border-st-border pb-1 mb-1">Quick Jump</span>
                    <button onClick={() => document.getElementById('chart-prog').scrollIntoView({behavior: 'smooth'})} className="text-xs font-bold text-left text-st-text-light hover:text-st-orange transition-colors">📈 Progression</button>
                    <button onClick={() => document.getElementById('chart-yields').scrollIntoView({behavior: 'smooth'})} className="text-xs font-bold text-left text-st-text-light hover:text-st-orange transition-colors">🌾 Yields</button>
                    <button onClick={() => document.getElementById('chart-econ').scrollIntoView({behavior: 'smooth'})} className="text-xs font-bold text-left text-st-text-light hover:text-st-orange transition-colors">💰 Economy</button>
                    <button onClick={() => document.getElementById('chart-farm').scrollIntoView({behavior: 'smooth'})} className="text-xs font-bold text-left text-st-text-light hover:text-st-orange transition-colors">🚜 Farm Build</button>
                    <button onClick={() => document.getElementById('chart-push').scrollIntoView({behavior: 'smooth'})} className="text-xs font-bold text-left text-st-text-light hover:text-st-orange transition-colors">🛡️ Push Build</button>
                    <button onClick={() => document.getElementById('chart-diag').scrollIntoView({behavior: 'smooth'})} className="text-xs font-bold text-left text-st-text-light hover:text-st-orange transition-colors">⚙️ Diagnostics</button>
                    <button onClick={() => document.getElementById('chart-card').scrollIntoView({behavior: 'smooth'})} className="text-xs font-bold text-left text-st-text-light hover:text-st-orange transition-colors">🎴 Card Drops</button>
                  </div>
                </div>

                {/* MASTER PLOT (With embedded, absolutely positioned controls) */}
                <div className="w-full relative flex-1" style={{ height: '4000px' }}>
                  {/* Anchor Divs for Elevator (Mathematically mapped to Plotly Domains with a 60px viewport buffer) */}
                  <div id="chart-prog" className="absolute top-0 w-full h-px pointer-events-none" />
                  <div id="chart-yields" className="absolute top-[370px] w-full h-px pointer-events-none" />
                  <div id="chart-econ" className="absolute top-[1175px] w-full h-px pointer-events-none" />
                  <div id="chart-farm" className="absolute top-[1575px] w-full h-px pointer-events-none" />
                  <div id="chart-push" className="absolute top-[2380px] w-full h-px pointer-events-none" />
                  <div id="chart-diag" className="absolute top-[3185px] w-full h-px pointer-events-none" />
                  <div id="chart-card" className="absolute top-[3585px] w-full h-px pointer-events-none" />
              
                  {/* YIELDS CONTROLS */}
              <div className="absolute right-[150px] z-10 flex items-center gap-3 bg-[#111] border border-st-border px-3 py-1.5 rounded shadow-md" style={{ top: '370px' }}>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Filters:</span>
                  <label className="flex items-center gap-1 text-[11px] font-bold text-st-text cursor-pointer hover:text-[#4ade80] transition-colors">
                    <input type="checkbox" checked={showXpRates} onChange={(e) => setShowXpRates(e.target.checked)} className="accent-[#4ade80]" /> 
                    Show XP
                  </label>
                  <label className="flex items-center gap-1 text-[11px] font-bold text-st-text cursor-pointer hover:text-[#facc15] transition-colors">
                    <input type="checkbox" checked={showFragRates} onChange={(e) => setShowFragRates(e.target.checked)} className="accent-[#facc15]" /> 
                    Show Frags
                  </label>
                  <select
                    value={selectedRateFrag}
                    onChange={(e) => setSelectedRateFrag(e.target.value)}
                    disabled={!showFragRates}
                    className="bg-[#1a1a1a] border border-st-border rounded px-1.5 py-0.5 text-[10px] text-st-text outline-none cursor-pointer"
                  >
                    <option value="com">Common</option>
                    <option value="rare">Rare</option>
                    <option value="epic">Epic</option>
                    <option value="leg">Legendary</option>
                    <option value="myth">Mythic</option>
                    <option value="div">Divine</option>
                  </select>
              </div>

              {/* ETA PREDICTOR GUIDE OVERLAY */}
              <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-[1000px] bg-[#111]/95 border border-st-border px-4 py-2 rounded shadow-sm backdrop-blur-sm flex items-center gap-4" style={{ top: '765px' }}>
                  <div className="text-[11px] font-bold text-gray-200 whitespace-nowrap flex items-center gap-1.5 border-r border-st-border pr-4 shrink-0">
                      <span>⏱️</span> Reading the ETA Predictor
                  </div>
                  <div className="text-[10px] text-gray-400 leading-relaxed">
                      When the <span className="text-[#a3e635] font-bold">Green Line</span> (Time to Next Upgrade) drops below the <span className="text-[#f87171] font-bold">Red Line</span> (Time to Next Level), the engine predicts you can afford an expensive mid-game milestone (like Stat Caps +5) <em>before</em> you naturally level up. This mathematically triggers the engine to instantly pivot your Farm Build from XP to Fragments!
                  </div>
              </div>

              {/* ECONOMY CONTROLS */}
              <div className="absolute right-[150px] z-10 flex items-center gap-2 bg-[#111] border border-st-border px-3 py-1.5 rounded shadow-md" style={{ top: '1225px' }}>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Select Bank:</span>
                  <select
                    value={selectedFragPlot}
                    onChange={(e) => setSelectedFragPlot(e.target.value)}
                    className="bg-[#1a1a1a] border border-st-border rounded px-2 py-0.5 text-[11px] font-bold text-st-text outline-none cursor-pointer focus:border-st-orange"
                  >
                    <option value="com">Common</option>
                    <option value="rare">Rare</option>
                    <option value="epic">Epic</option>
                    <option value="leg">Legendary</option>
                    <option value="myth">Mythic</option>
                    <option value="div">Divine</option>
                  </select>
              </div>

              {/* FARM BUILD GUIDE OVERLAY */}
              <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-[850px] bg-[#111]/95 border border-st-border px-4 py-2 rounded shadow-sm backdrop-blur-sm flex items-center gap-4" style={{ top: '1588px' }}>
                  <div className="text-[11px] font-bold text-gray-200 whitespace-nowrap flex items-center gap-1.5 border-r border-st-border pr-4 shrink-0">
                      <span>📊</span> Reading the FARM Priority Charts
                  </div>
                  <div className="text-[10px] text-gray-400 leading-relaxed">
                      <span className="text-[#06b6d4] font-bold">Teal</span> represents Intelligence (EXP). <span className="text-[#eab308] font-bold">Gold</span> represents Perception (Fragments). Spikes in Perception indicate a switch in the farm build from EXP to Fragments to afford expensive major upgrades.
                  </div>
              </div>

              {/* PUSH BUILD GUIDE OVERLAY */}
              <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-[1000px] bg-[#111]/95 border border-st-border px-4 py-2 rounded shadow-sm backdrop-blur-sm flex items-center gap-4" style={{ top: '2370px' }}>
                  <div className="text-[11px] font-bold text-gray-200 whitespace-nowrap flex items-center gap-1.5 border-r border-st-border pr-4 shrink-0">
                      <span>🛡️</span> Reading the PUSH Priority Charts
                  </div>
                  <div className="text-[10px] text-gray-400 leading-relaxed">
                      In Push builds, <span className="text-[#a855f7] font-bold">Corruption (Purple)</span> and <span className="text-[#eab308] font-bold">Perception (Gold)</span> are largely ignored. Why? Corruption's multiplier is useless if scaling block armor reduces your base damage to 1. Instead, the engine aggressively funds <span className="text-[#ef4444] font-bold">Strength</span>, <span className="text-[#22c55e] font-bold">Luck</span>, and <span className="text-[#f9a8d4] font-bold">Divinity</span> to crack block HP using compounding Critical Hits.
                  </div>
              </div>

              {/* INTERACTIVE DIAGNOSTICS GUIDE OVERLAY */}
              <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-[850px] bg-[#111]/95 border border-st-border px-4 py-2 rounded shadow-sm backdrop-blur-sm flex items-center gap-4" style={{ top: '3195px' }}>
                  <div className="text-[11px] font-bold text-gray-200 whitespace-nowrap flex flex-col gap-1.5 border-r border-st-border pr-4 shrink-0">
                      <div className="flex items-center gap-1.5">
                          <span>⚙️</span> Engine Diagnostics
                      </div>
                      <select 
                          value={diagnosticView} 
                          onChange={(e) => setDiagnosticView(e.target.value)}
                          className="bg-[#1a1a1a] border border-st-border rounded px-1.5 py-0.5 text-[10px] text-st-text outline-none cursor-pointer focus:border-st-orange w-full shadow-inner"
                      >
                          <option value="push_crit">PUSH: Crit Engine Evol.</option>
                          <option value="farm_crit">FARM: Crit Engine Evol.</option>
                      </select>
                  </div>
                  <div className="text-[10px] text-gray-400 leading-relaxed">
                      {diagnosticView === 'push_crit' && (
                          <span>This chart tracks the evolution of your <strong>Push Build's</strong> critical hit engine. <span className="text-[#ef4444] font-bold">Strength</span>, <span className="text-[#22c55e] font-bold">Luck</span>, and <span className="text-[#f9a8d4] font-bold">Divinity</span> must be perfectly balanced to trigger compounding Super/Ultra crits. Notice how these stats dynamically shift around major Floor scaling events (vertical dashed lines)? The optimizer constantly recalculates the exact ratio needed to crack rising Block Armor and HP.</span>
                      )}
                      {diagnosticView === 'farm_crit' && (
                          <span>This chart tracks your <strong>Farm Build's</strong> critical hit engine. Unlike Push builds, Farm builds don't face infinitely scaling block armor. This gives the optimizer freedom to aggressively swap <span className="text-[#ef4444] font-bold">Strength</span> and <span className="text-[#f9a8d4] font-bold">Divinity</span> to hit exact damage breakpoints without overkilling. Meanwhile, <span className="text-[#22c55e] font-bold">Luck</span> is heavily favored because it simultaneously drives Crit Chance and Modifier drop rates (EXP/Loot).</span>
                      )}
                  </div>
              </div>

              {/* CARD CONTROLS */}
              <div className="absolute right-[150px] z-10 flex items-center gap-1.5 bg-[#111] border border-st-border px-3 py-1.5 rounded shadow-md" style={{ top: '3575px' }}>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mr-1">Tiers:</span>
                  {[ 
                    { id: 'dirt', label: 'Dirt', color: 'border-[#78716c] text-[#78716c]' },
                    { id: 'com', label: 'Common', color: 'border-[#9ca3af] text-[#9ca3af]' },
                    { id: 'rare', label: 'Rare', color: 'border-[#3b82f6] text-[#3b82f6]' },
                    { id: 'epic', label: 'Epic', color: 'border-[#a855f7] text-[#a855f7]' },
                    { id: 'leg', label: 'Legendary', color: 'border-[#eab308] text-[#eab308]' },
                    { id: 'myth', label: 'Mythic', color: 'border-[#ef4444] text-[#ef4444]' },
                    { id: 'div', label: 'Divine', color: 'border-[#06b6d4] text-[#06b6d4]' }
                   ].map(r => {
                    const isActive = cardRarityFilter.includes(r.id);
                    return (
                      <button
                        key={r.id}
                        onClick={() => toggleRarityFilter(r.id)}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold border transition-colors ${
                          isActive ? `${r.color} bg-st-secondary/50` : 'border-st-border text-st-text-light opacity-50 hover:opacity-100'
                        }`}
                      >
                        {r.label}
                      </button>
                    );
                  })}
              </div>

              <Plot
                data={[ 
                  // 1. Progression (legend: 'legend')
                  { x: chartData.xVals, y: chartData.levelVals, type: 'scatter', mode: 'lines', name: 'Arch Level', line: { color: '#3b82f6', shape: 'hv', width: 2 }, xaxis: 'x', yaxis: 'y', legend: 'legend' },
                  { x: chartData.xVals, y: chartData.floorVals, type: 'scatter', mode: 'lines', name: 'Max Floor', line: { color: '#ef4444', shape: 'hv', width: 2 }, xaxis: 'x', yaxis: 'y', legend: 'legend' },
                  
                  // 2. Yields (legend: 'legend2')
                  ...(showXpRates ?[
                      { x: chartData.xVals, y: chartData.xpVals, type: 'scatter', mode: 'lines', name: 'Farm XP', line: { color: '#4ade80', shape: 'hv', width: 2 }, xaxis: 'x2', yaxis: 'y2', legend: 'legend2' },
                      { x: chartData.xVals, y: chartData.pushXpVals, type: 'scatter', mode: 'lines', name: 'Push XP', line: { color: '#ef4444', shape: 'hv', width: 1.5, dash: 'dot' }, xaxis: 'x2', yaxis: 'y2', legend: 'legend2' }
                  ] : [ ]),
                  ...(showFragRates ?[
                      { x: chartData.xVals, y: chartData.farmFragVals, type: 'scatter', mode: 'lines', name: `Farm ${chartData.fragUIName}/Min`, line: { color: '#facc15', shape: 'hv', width: 2 }, xaxis: 'x2', yaxis: 'y3', legend: 'legend2' },
                      { x: chartData.xVals, y: chartData.pushFragVals, type: 'scatter', mode: 'lines', name: `Push ${chartData.fragUIName}/Min`, line: { color: '#ca8a04', shape: 'hv', width: 1.5, dash: 'dot' }, xaxis: 'x2', yaxis: 'y3', legend: 'legend2' }
                  ] : [ ]),

                  // 3. Opp Cost (legend: 'legend3')
                  { x: chartData.pivotXVals, y: chartData.ttnlVals, type: 'scatter', mode: 'lines', name: 'ETA: Next Arch Level', line: { color: '#f87171', shape: 'hv', width: 2 }, xaxis: 'x3', yaxis: 'y4', legend: 'legend3' },
                  { x: chartData.pivotXVals, y: chartData.ttfVals, type: 'scatter', mode: 'lines', name: 'ETA: Major Upgrade', line: { color: '#a3e635', shape: 'hv', width: 2 }, xaxis: 'x3', yaxis: 'y4', legend: 'legend3' },

                  // 4. Economy (legend: 'legend4')
                  { x: fragChartData.xVals, y: fragChartData.yVals, type: 'scatter', mode: 'lines', name: `${fragDict[selectedFragPlot]} Bank`, line: { color: fragChartData.color, width: 2, shape: 'hv' }, fill: 'tozeroy', fillcolor: fragChartData.color + '20', xaxis: 'x4', yaxis: 'y5', legend: 'legend4' },
                  { x: fragChartData.markerX, y: fragChartData.markerY, type: 'scatter', mode: 'markers', name: 'Purchases', marker: { color: '#ffffff', size: 8, line: { color: fragChartData.color, width: 2 } }, text: fragChartData.markerText, hoverinfo: 'text', xaxis: 'x4', yaxis: 'y5', legend: 'legend4' },

                  // 5. Farm Stats (100% Normalized)
                  { x: farmChartData.xVals, y: farmChartData.stats.Str, type: 'scatter', mode: 'lines', stackgroup: 'farm', groupnorm: 'percent', name: 'Str (Dmg)', line: { color: '#ef4444', width: 1, shape: 'hv' }, xaxis: 'x5', yaxis: 'y6', legend: 'legend5' },
                  { x: farmChartData.xVals, y: farmChartData.stats.Agi, type: 'scatter', mode: 'lines', stackgroup: 'farm', groupnorm: 'percent', name: 'Agi (Stamina)', line: { color: '#3b82f6', width: 1, shape: 'hv' }, xaxis: 'x5', yaxis: 'y6', legend: 'legend5' },
                  { x: farmChartData.xVals, y: farmChartData.stats.Per, type: 'scatter', mode: 'lines', stackgroup: 'farm', groupnorm: 'percent', name: 'Per (Frags)', line: { color: '#eab308', width: 1, shape: 'hv' }, xaxis: 'x5', yaxis: 'y6', legend: 'legend5' },
                  { x: farmChartData.xVals, y: farmChartData.stats.Int, type: 'scatter', mode: 'lines', stackgroup: 'farm', groupnorm: 'percent', name: 'Int (EXP)', line: { color: '#06b6d4', width: 1, shape: 'hv' }, xaxis: 'x5', yaxis: 'y6', legend: 'legend5' },
                  { x: farmChartData.xVals, y: farmChartData.stats.Luck, type: 'scatter', mode: 'lines', stackgroup: 'farm', groupnorm: 'percent', name: 'Luck (Mods)', line: { color: '#22c55e', width: 1, shape: 'hv' }, xaxis: 'x5', yaxis: 'y6', legend: 'legend5' },
                  { x: farmChartData.xVals, y: farmChartData.stats.Div, type: 'scatter', mode: 'lines', stackgroup: 'farm', groupnorm: 'percent', name: 'Div (Dmg/Auto)', line: { color: '#f9a8d4', width: 1, shape: 'hv' }, xaxis: 'x5', yaxis: 'y6', legend: 'legend5' },
                  { x: farmChartData.xVals, y: farmChartData.stats.Corr, type: 'scatter', mode: 'lines', stackgroup: 'farm', groupnorm: 'percent', name: 'Corr (Mults)', line: { color: '#a855f7', width: 1, shape: 'hv' }, xaxis: 'x5', yaxis: 'y6', legend: 'legend5' },
                  { x: farmChartData.xVals, y: farmChartData.stats.Unspent, type: 'scatter', mode: 'lines', stackgroup: 'farm', groupnorm: 'percent', name: 'Unspent (Crippled)', line: { color: '#ffffff', width: 1, dash: 'dash', shape: 'hv' }, fillcolor: 'rgba(255,255,255,0.1)', xaxis: 'x5', yaxis: 'y6', legend: 'legend5' },

                  // 6. Farm Stats (Raw Data)
                  { x: farmChartData.xVals, y: farmChartData.stats.Str, type: 'scatter', mode: 'lines', name: 'Str (Dmg)', line: { color: '#ef4444', width: 2, shape: 'hv' }, xaxis: 'x6', yaxis: 'y7', legend: 'legend6' },
                  { x: farmChartData.xVals, y: farmChartData.stats.Agi, type: 'scatter', mode: 'lines', name: 'Agi (Stamina)', line: { color: '#3b82f6', width: 2, shape: 'hv' }, xaxis: 'x6', yaxis: 'y7', legend: 'legend6' },
                  { x: farmChartData.xVals, y: farmChartData.stats.Per, type: 'scatter', mode: 'lines', name: 'Per (Frags)', line: { color: '#eab308', width: 2, shape: 'hv' }, xaxis: 'x6', yaxis: 'y7', legend: 'legend6' },
                  { x: farmChartData.xVals, y: farmChartData.stats.Int, type: 'scatter', mode: 'lines', name: 'Int (EXP)', line: { color: '#06b6d4', width: 2, shape: 'hv' }, xaxis: 'x6', yaxis: 'y7', legend: 'legend6' },
                  { x: farmChartData.xVals, y: farmChartData.stats.Luck, type: 'scatter', mode: 'lines', name: 'Luck (Mods)', line: { color: '#22c55e', width: 2, shape: 'hv' }, xaxis: 'x6', yaxis: 'y7', legend: 'legend6' },
                  { x: farmChartData.xVals, y: farmChartData.stats.Div, type: 'scatter', mode: 'lines', name: 'Div (Dmg/Auto)', line: { color: '#f9a8d4', width: 2, shape: 'hv' }, xaxis: 'x6', yaxis: 'y7', legend: 'legend6' },
                  { x: farmChartData.xVals, y: farmChartData.stats.Corr, type: 'scatter', mode: 'lines', name: 'Corr (Mults)', line: { color: '#a855f7', width: 2, dash: 'dot', shape: 'hv' }, xaxis: 'x6', yaxis: 'y7', legend: 'legend6' },
                  { x: farmChartData.xVals, y: farmChartData.stats.Unspent, type: 'scatter', mode: 'lines', name: 'Unspent (Crippled)', line: { color: '#ffffff', width: 2, dash: 'dash', shape: 'hv' }, xaxis: 'x6', yaxis: 'y7', legend: 'legend6' },

                  // 7. Push Stats (100% Normalized)
                  { x: pushChartData.xVals, y: pushChartData.stats.Str, type: 'scatter', mode: 'lines', stackgroup: 'push', groupnorm: 'percent', name: 'Str (Dmg)', line: { color: '#ef4444', width: 1, shape: 'hv' }, xaxis: 'x7', yaxis: 'y8', legend: 'legend7' },
                  { x: pushChartData.xVals, y: pushChartData.stats.Agi, type: 'scatter', mode: 'lines', stackgroup: 'push', groupnorm: 'percent', name: 'Agi (Stamina)', line: { color: '#3b82f6', width: 1, shape: 'hv' }, xaxis: 'x7', yaxis: 'y8', legend: 'legend7' },
                  { x: pushChartData.xVals, y: pushChartData.stats.Per, type: 'scatter', mode: 'lines', stackgroup: 'push', groupnorm: 'percent', name: 'Per (Armor Pen)', line: { color: '#eab308', width: 1, shape: 'hv' }, xaxis: 'x7', yaxis: 'y8', legend: 'legend7' },
                  { x: pushChartData.xVals, y: pushChartData.stats.Int, type: 'scatter', mode: 'lines', stackgroup: 'push', groupnorm: 'percent', name: 'Int (EXP)', line: { color: '#06b6d4', width: 1, shape: 'hv' }, xaxis: 'x7', yaxis: 'y8', legend: 'legend7' },
                  { x: pushChartData.xVals, y: pushChartData.stats.Luck, type: 'scatter', mode: 'lines', stackgroup: 'push', groupnorm: 'percent', name: 'Luck (Crits/Mods)', line: { color: '#22c55e', width: 1, shape: 'hv' }, xaxis: 'x7', yaxis: 'y8', legend: 'legend7' },
                  { x: pushChartData.xVals, y: pushChartData.stats.Div, type: 'scatter', mode: 'lines', stackgroup: 'push', groupnorm: 'percent', name: 'Div (Dmg)', line: { color: '#f9a8d4', width: 1, shape: 'hv' }, xaxis: 'x7', yaxis: 'y8', legend: 'legend7' },
                  { x: pushChartData.xVals, y: pushChartData.stats.Corr, type: 'scatter', mode: 'lines', stackgroup: 'push', groupnorm: 'percent', name: 'Corr (Mults)', line: { color: '#a855f7', width: 1, shape: 'hv' }, xaxis: 'x7', yaxis: 'y8', legend: 'legend7' },
                  { x: pushChartData.xVals, y: pushChartData.stats.Unspent, type: 'scatter', mode: 'lines', stackgroup: 'push', groupnorm: 'percent', name: 'Unspent (Crippled)', line: { color: '#ffffff', width: 1, dash: 'dash', shape: 'hv' }, fillcolor: 'rgba(255,255,255,0.1)', xaxis: 'x7', yaxis: 'y8', legend: 'legend7' },

                  // 8. Push Stats (Raw Data)
                  { x: pushChartData.xVals, y: pushChartData.stats.Str, type: 'scatter', mode: 'lines', name: 'Str (Dmg)', line: { color: '#ef4444', width: 2, shape: 'hv' }, xaxis: 'x8', yaxis: 'y9', legend: 'legend8' },
                  { x: pushChartData.xVals, y: pushChartData.stats.Agi, type: 'scatter', mode: 'lines', name: 'Agi (Stamina)', line: { color: '#3b82f6', width: 2, shape: 'hv' }, xaxis: 'x8', yaxis: 'y9', legend: 'legend8' },
                  { x: pushChartData.xVals, y: pushChartData.stats.Per, type: 'scatter', mode: 'lines', name: 'Per (Armor Pen)', line: { color: '#eab308', width: 2, shape: 'hv' }, xaxis: 'x8', yaxis: 'y9', legend: 'legend8' },
                  { x: pushChartData.xVals, y: pushChartData.stats.Int, type: 'scatter', mode: 'lines', name: 'Int (EXP)', line: { color: '#06b6d4', width: 2, shape: 'hv' }, xaxis: 'x8', yaxis: 'y9', legend: 'legend8' },
                  { x: pushChartData.xVals, y: pushChartData.stats.Luck, type: 'scatter', mode: 'lines', name: 'Luck (Crits/Mods)', line: { color: '#22c55e', width: 2, shape: 'hv' }, xaxis: 'x8', yaxis: 'y9', legend: 'legend8' },
                  { x: pushChartData.xVals, y: pushChartData.stats.Div, type: 'scatter', mode: 'lines', name: 'Div (Dmg)', line: { color: '#f9a8d4', width: 2, shape: 'hv' }, xaxis: 'x8', yaxis: 'y9', legend: 'legend8' },
                  { x: pushChartData.xVals, y: pushChartData.stats.Corr, type: 'scatter', mode: 'lines', name: 'Corr (Mults)', line: { color: '#a855f7', width: 2, dash: 'dot', shape: 'hv' }, xaxis: 'x8', yaxis: 'y9', legend: 'legend8' },
                  { x: pushChartData.xVals, y: pushChartData.stats.Unspent, type: 'scatter', mode: 'lines', name: 'Unspent (Crippled)', line: { color: '#ffffff', width: 2, dash: 'dash', shape: 'hv' }, xaxis: 'x8', yaxis: 'y9', legend: 'legend8' },

                  // 9. Engine Diagnostics (legend: 'legend9')
                  ...activeDiagnosticsTraces.map(t => ({ ...t, xaxis: 'x9', yaxis: t.yaxis === 'y10' ? 'y10' : 'y11', legend: 'legend9' })),

                  // 10. Cards (legend: 'legend10')
                  ...cardSwimlaneData.traces.map(t => ({ ...t, xaxis: 'x10', yaxis: 'y12', legend: 'legend10' }))
                 ]}
                layout={{
                  uirevision: 'master_timeline_zoom',
                  paper_bgcolor: 'transparent',
                  plot_bgcolor: 'transparent',
                  font: { color: '#FAFAFA' },
                  margin: { l: 60, r: 120, t: 30, b: 50 },
                  
                  // X-Axes (All synced together via matches: 'x')
                  xaxis:  { anchor: 'y',  matches: 'x', showticklabels: true, tickfont: { size: 10, color: '#888' }, gridcolor: '#333', title: { text: 'Timeline (Arch Secs)', font: { size: 10, color: '#888' }, standoff: 5 } },
                  xaxis2: { anchor: showXpRates ? 'y2' : 'y3', matches: 'x', showticklabels: true, tickfont: { size: 10, color: '#888' }, gridcolor: '#333' },
                  xaxis3: { anchor: 'y4', matches: 'x', showticklabels: true, tickfont: { size: 10, color: '#888' }, gridcolor: '#333' },
                  xaxis4: { anchor: 'y5', matches: 'x', showticklabels: true, tickfont: { size: 10, color: '#888' }, gridcolor: '#333' },
                  xaxis5: { anchor: 'y6', matches: 'x', showticklabels: true, tickfont: { size: 10, color: '#888' }, gridcolor: '#333' },
                  xaxis6: { anchor: 'y7', matches: 'x', showticklabels: true, tickfont: { size: 10, color: '#888' }, gridcolor: '#333' },
                  xaxis7: { anchor: 'y8', matches: 'x', showticklabels: true, tickfont: { size: 10, color: '#888' }, gridcolor: '#333' },
                  xaxis8: { anchor: 'y9', matches: 'x', showticklabels: true, tickfont: { size: 10, color: '#888' }, gridcolor: '#333' },
                  xaxis9: { anchor: 'y10', matches: 'x', showticklabels: true, tickfont: { size: 10, color: '#888' }, gridcolor: '#333' },
                  xaxis10:{ anchor: 'y12',matches: 'x', showticklabels: true, tickfont: { size: 12, color: '#eee' }, gridcolor: '#333', title: { text: 'Timeline (Arch Secs)', standoff: 15 } },

                  // Y-Axes (10 Plots -> Domains mathematically spaced)
                  yaxis:  { domain:[0.9225, 1.000], title: { text: 'Milestone', font: { size: 11 } }, gridcolor: '#333', automargin: true },
                  yaxis2: showXpRates ? { domain:[0.820, 0.8975], title: { text: 'Yields (XP)', font: { size: 11 } }, gridcolor: '#333', automargin: true } : { domain:[0.820, 0.8975], visible: false },
                  yaxis3: showFragRates ? { domain: showXpRates ? undefined :[0.820, 0.8975], overlaying: showXpRates ? 'y2' : undefined, side: showXpRates ? 'right' : 'left', title: { text: 'Frags/Min', font: { size: 11 } }, gridcolor: showXpRates ? undefined : '#333', automargin: true } : { domain:[0.820, 0.8975], visible: false },
                  yaxis4: { domain:[0.7175, 0.795], title: { text: 'ETA (Mins)', font: { size: 11 } }, type: 'log', gridcolor: '#333', automargin: true },
                  yaxis5: { domain:[0.615, 0.6925], title: { text: 'Bank Amt', font: { size: 11 } }, gridcolor: '#333', automargin: true },
                  yaxis6: { domain:[0.5125, 0.590], title: { text: 'Budget %', font: { size: 11 } }, range: [0, 100], gridcolor: '#333', automargin: true },
                  yaxis7: { domain:[0.410, 0.4875], title: { text: 'Base Points', font: { size: 11 } }, gridcolor: '#333', automargin: true },
                  yaxis8: { domain:[0.3075, 0.385], title: { text: 'Budget %', font: { size: 11 } }, range: [0, 100], gridcolor: '#333', automargin: true },
                  yaxis9: { domain:[0.205, 0.2825], title: { text: 'Base Points', font: { size: 11 } }, gridcolor: '#333', automargin: true },
                  yaxis10:{ domain:[0.1025, 0.180], title: { text: 'Base Points', font: { size: 11 } }, gridcolor: '#333', automargin: true },
                  yaxis12:{ domain:[0.000, 0.0775], title: { text: 'Block Tier', font: { size: 11 } }, gridcolor: '#333', categoryorder: 'array', categoryarray:[ 'Tier 1', 'Tier 2', 'Tier 3', 'Tier 4' ], automargin: true },
                  
                  // Background Shading for Strategy Phases & Vertical Pivot Lines
                  shapes:[
                    ...(simulationInsights?.phases.map(p => ({
                        type: 'rect',
                        xref: 'x', yref: 'paper',
                        x0: p.start, x1: p.end,
                        y0: 0, y1: 1,
                        fillcolor: p.color,
                        layer: 'below',
                        line: { width: 0 }
                    })) || [ ]),
                    ...(simulationInsights?.minorPivots.map(p => ({
                        type: 'line',
                        x0: p.sec, x1: p.sec,
                        y0: 0, y1: 1, yref: 'paper',
                        line: { color: '#9ca3af', width: 1, dash: 'dot' },
                        layer: 'below'
                    })) || [ ]),
                    ...(simulationInsights?.pivots.map(p => ({
                        type: 'line',
                        x0: p.sec, x1: p.sec,
                        y0: 0, y1: 1, yref: 'paper',
                        line: { color: '#f59e0b', width: 2, dash: 'dot' },
                        layer: 'below'
                    })) || [ ]),
                    ...(diagnosticView.includes('crit') ? simulationInsights?.critPivots.map(p => ({
                        type: 'line',
                        x0: p.sec, x1: p.sec,
                        y0: 0.1025, y1: 0.180, yref: 'paper', // Locked exclusively to Plot 9's domain
                        line: { color: '#f472b6', width: 1, dash: 'dash' },
                        layer: 'above'
                    })) : [ ]),
                    ...(diagnosticView.includes('crit') ? simulationInsights?.floorPivots.map(p => ({
                        type: 'line',
                        x0: p.sec, x1: p.sec,
                        y0: 0.1025, y1: 0.180, yref: 'paper', // Locked exclusively to Plot 9's domain
                        line: { color: '#ef4444', width: 1, dash: 'dot' },
                        layer: 'above'
                    })) : [ ])
                  ],
                  
                  // Annotations for Subplot Titles & Vertical Pivots
                  annotations:[
                    { text: '<b>1. Core Progression: Arch Level & Max Floor</b>', x: 0, y: 1.000, xref: 'paper', yref: 'paper', showarrow: false, font: {size: 14, color: '#fff'}, xanchor: 'left', yanchor: 'bottom', yshift: 5 },
                    { text: '<b>2. Yields: Farm vs Push</b>', x: 0, y: 0.8975, xref: 'paper', yref: 'paper', showarrow: false, font: {size: 14, color: '#fff'}, xanchor: 'left', yanchor: 'bottom', yshift: 5 },
                    { text: '<b>3. ETA Predictor: Next Level vs Next Major Upgrade</b>', x: 0, y: 0.795, xref: 'paper', yref: 'paper', showarrow: false, font: {size: 14, color: '#fff'}, xanchor: 'left', yanchor: 'bottom', yshift: 5 },
                    { text: '<b>4. Fragment Economy & Milestones</b>', x: 0, y: 0.6925, xref: 'paper', yref: 'paper', showarrow: false, font: {size: 14, color: '#fff'}, xanchor: 'left', yanchor: 'bottom', yshift: 5 },
                    { text: '<b>5. Farm Build Priority Trends (100% Normalized)</b>', x: 0, y: 0.590, xref: 'paper', yref: 'paper', showarrow: false, font: {size: 14, color: '#fff'}, xanchor: 'left', yanchor: 'bottom', yshift: 5 },
                    { text: '<b>6. Farm Build Stat Breakpoints (Raw Points)</b>', x: 0, y: 0.4875, xref: 'paper', yref: 'paper', showarrow: false, font: {size: 14, color: '#fff'}, xanchor: 'left', yanchor: 'bottom', yshift: 5 },
                    { text: '<b>7. Push Build Priority Trends (100% Normalized)</b>', x: 0, y: 0.385, xref: 'paper', yref: 'paper', showarrow: false, font: {size: 14, color: '#fff'}, xanchor: 'left', yanchor: 'bottom', yshift: 5 },
                    { text: '<b>8. Push Build Stat Breakpoints (Raw Points)</b>', x: 0, y: 0.2825, xref: 'paper', yref: 'paper', showarrow: false, font: {size: 14, color: '#fff'}, xanchor: 'left', yanchor: 'bottom', yshift: 5 },
                    { text: diagnosticView === 'push_crit' ? '<b>9. PUSH Mechanics: The Critical Hit Engine</b>' : '<b>9. FARM Mechanics: The Critical Hit Engine</b>', x: 0, y: 0.180, xref: 'paper', yref: 'paper', showarrow: false, font: {size: 14, color: '#fff'}, xanchor: 'left', yanchor: 'bottom', yshift: 5 },
                    { text: '<b>10. Card Drops (Swimlanes)</b>', x: 0, y: 0.0775, xref: 'paper', yref: 'paper', showarrow: false, font: {size: 14, color: '#fff'}, xanchor: 'left', yanchor: 'bottom', yshift: 5 },
                    
                    // Pivot Labels (Replicated across all Subplot Tops)
                    ...([1.000, 0.8975, 0.795, 0.6925, 0.590, 0.4875, 0.385, 0.2825, 0.180, 0.0775].flatMap(yPos => 
                      simulationInsights?.pivots.map(p => ({
                          x: p.sec, y: yPos, yref: 'paper',
                          text: `<b>${p.label}</b>`,
                          showarrow: false,
                          font: { size: 12, color: '#fba918' },
                          textangle: -90,
                          xanchor: 'right',
                          yanchor: 'top',
                          yshift: -5,
                          xshift: -5
                      })) || []
                    )),
                    
                    // Minor Pivot Labels (Replicated across all Subplot Tops)
                    ...([1.000, 0.8975, 0.795, 0.6925, 0.590, 0.4875, 0.385, 0.2825, 0.180, 0.0775].flatMap(yPos => 
                      simulationInsights?.minorPivots.map(p => ({
                          x: p.sec, y: yPos, yref: 'paper',
                          text: `${p.label}`,
                          showarrow: false,
                          font: { size: 10, color: '#9ca3af' },
                          textangle: -90,
                          xanchor: 'right',
                          yanchor: 'top',
                          yshift: -5,
                          xshift: -2
                      })) || []
                    )),

                    // Crit Engine Pivot Labels
                    ...(diagnosticView.includes('crit') ? simulationInsights?.critPivots.map(p => ({
                        x: p.sec, y: 0.180, yref: 'paper',
                        text: `${p.label}`,
                        showarrow: false,
                        font: { size: 10, color: '#f472b6' },
                        textangle: -90,
                        xanchor: 'right',
                        yanchor: 'top',
                        yshift: -5,
                        xshift: -2
                    })) : [ ]),

                    // Floor Milestone Pivot Labels
                    ...(diagnosticView.includes('crit') ? simulationInsights?.floorPivots.map(p => ({
                        x: p.sec, y: 0.180, yref: 'paper',
                        text: `${p.label}`,
                        showarrow: false,
                        font: { size: 10, color: '#ef4444' },
                        textangle: -90,
                        xanchor: 'right',
                        yanchor: 'top',
                        yshift: -5,
                        xshift: -2
                    })) : [ ])
                  ],

                  // SPLIT LEGENDS
                  showlegend: true,
                  legend:  { orientation: 'v', x: 1.01, y: 1.000, yanchor: 'top', font: { size: 10, color: '#FAFAFA' }, bgcolor: 'transparent' },
                  legend2: { orientation: 'v', x: 1.01, y: 0.8975, yanchor: 'top', font: { size: 10, color: '#FAFAFA' }, bgcolor: 'transparent' },
                  legend3: { orientation: 'v', x: 1.01, y: 0.795, yanchor: 'top', font: { size: 10, color: '#FAFAFA' }, bgcolor: 'transparent' },
                  legend4: { orientation: 'v', x: 1.01, y: 0.6925, yanchor: 'top', font: { size: 10, color: '#FAFAFA' }, bgcolor: 'transparent' },
                  legend5: { orientation: 'v', x: 1.01, y: 0.590, yanchor: 'top', font: { size: 10, color: '#FAFAFA' }, bgcolor: 'transparent' },
                  legend6: { orientation: 'v', x: 1.01, y: 0.4875, yanchor: 'top', font: { size: 10, color: '#FAFAFA' }, bgcolor: 'transparent' },
                  legend7: { orientation: 'v', x: 1.01, y: 0.385, yanchor: 'top', font: { size: 10, color: '#FAFAFA' }, bgcolor: 'transparent' },
                  legend8: { orientation: 'v', x: 1.01, y: 0.2825, yanchor: 'top', font: { size: 10, color: '#FAFAFA' }, bgcolor: 'transparent' },
                  legend9: { orientation: 'v', x: 1.01, y: 0.180, yanchor: 'top', font: { size: 10, color: '#FAFAFA' }, bgcolor: 'transparent' },
                  legend10:{ orientation: 'v', x: 1.01, y: 0.0775, yanchor: 'top', font: { size: 10, color: '#FAFAFA' }, bgcolor: 'transparent' },
                  
                  autosize: true,
                  hovermode: 'x' // Draws the vertical line through all charts!
                }}
                useResizeHandler={true}
                style={{ width: '100%', height: '100%' }}
              />
                </div>
              </div>
            )}
          </div>

          {/* PUSH BUILD STATS (FLOOR-BASED X-AXIS) */}
          <div className="bg-[#0E1117] border border-st-border rounded p-4 shadow-sm animate-fade-in mb-6">
            <h3 className="text-lg font-bold text-st-text mb-4 border-b border-st-border pb-2 flex items-center gap-2">
               Push Build Stat Breakpoints
               <span className="text-[10px] bg-st-secondary text-gray-400 px-2 py-0.5 rounded font-mono font-normal border border-st-border">X-Axis = Max Floor</span>
            </h3>
            <div className="h-[400px] w-full">
              <Plot
                data={[ 
                  { x: pushChartData.floors, y: pushChartData.stats.Str, type: 'scatter', mode: 'lines+markers', name: 'Str', line: { color: '#ef4444', width: 2 } },
                  { x: pushChartData.floors, y: pushChartData.stats.Agi, type: 'scatter', mode: 'lines+markers', name: 'Agi', line: { color: '#3b82f6', width: 2 } },
                  { x: pushChartData.floors, y: pushChartData.stats.Per, type: 'scatter', mode: 'lines+markers', name: 'Per', line: { color: '#eab308', width: 2 } },
                  { x: pushChartData.floors, y: pushChartData.stats.Int, type: 'scatter', mode: 'lines+markers', name: 'Int', line: { color: '#06b6d4', width: 2 } },
                  { x: pushChartData.floors, y: pushChartData.stats.Luck, type: 'scatter', mode: 'lines+markers', name: 'Luck', line: { color: '#22c55e', width: 2 } },
                  { x: pushChartData.floors, y: pushChartData.stats.Div, type: 'scatter', mode: 'lines+markers', name: 'Div', line: { color: '#f9a8d4', width: 2 } },
                  { x: pushChartData.floors, y: pushChartData.stats.Corr, type: 'scatter', mode: 'lines+markers', name: 'Corr', line: { color: '#a855f7', width: 2, dash: 'dot' } },
                  { x: pushChartData.floors, y: pushChartData.stats.Unspent, type: 'scatter', mode: 'lines+markers', name: 'Unspent', line: { color: '#ffffff', width: 2, dash: 'dash' } }
                 ]}
                layout={{
                  paper_bgcolor: 'transparent',
                  plot_bgcolor: 'transparent',
                  font: { color: '#FAFAFA' },
                  margin: { l: 60, r: 20, t: 10, b: 80 },
                  xaxis: { title: { text: 'Max Floor Pushed', standoff: 15 }, gridcolor: '#333' },
                  yaxis: { title: { text: 'Stat Points Allocated', standoff: 10 }, gridcolor: '#333' },
                  legend: { orientation: 'h', y: -0.3, x: 0.5, xanchor: 'center' },
                  autosize: true
                }}
                useResizeHandler={true}
                style={{ width: '100%', height: '100%' }}
              />
            </div>
          </div>

          <div className="bg-st-bg border border-st-border rounded p-4 shadow-sm animate-fade-in">
            <div className="flex flex-col md:flex-row justify-between items-center mb-4 border-b border-st-border pb-2 gap-3">
              <div className="flex flex-col gap-2 shrink-0">
                <h3 className="text-lg font-bold text-st-text">Node-Graph Timeline</h3>
                <div className="flex flex-wrap gap-1">
                  {[
                    { label: '🔥 Idols', term: 'Idol' },
                    { label: '🎴 Cards', term: 'Card' },
                    { label: '⚔️ Pivots', term: 'Phase' },
                    { label: '🛒 Upgrades', term: 'Bought' },
                    { label: '🚀 Floors', term: 'Max Floor Pushed' }
                  ].map(pf => (
                    <button 
                      key={pf.term}
                      onClick={() => setSearchFilter(searchFilter === pf.term ? '' : pf.term)}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                        searchFilter === pf.term 
                          ? 'bg-st-orange text-[#2b2b2b] border-st-orange' 
                          : 'bg-st-secondary/50 text-st-text-light border-st-border hover:text-st-text hover:border-gray-400'
                      }`}
                    >
                      {pf.label}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
                <div className="relative w-full md:w-64">
                  <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                    <svg className="h-4 w-4 text-st-text-light" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <input 
                    type="text" 
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    placeholder="Search logs (e.g. 'Gleaming')..." 
                    className="w-full bg-st-secondary/30 border border-st-border rounded py-1.5 pl-8 pr-8 text-xs text-st-text focus:border-st-orange outline-none"
                  />
                  {searchFilter && (
                    <button 
                      onClick={() => setSearchFilter('')}
                      className="absolute inset-y-0 right-0 pr-2 flex items-center text-st-text-light hover:text-st-orange transition-colors font-bold text-lg"
                      title="Clear search"
                    >
                      &times;
                    </button>
                  )}
                </div>
                <div className="flex bg-st-secondary/50 rounded border border-st-border text-xs font-bold overflow-hidden shrink-0">
                  <button 
                    onClick={() => setGroupBy('floor')}
                    className={`px-3 py-1.5 transition-colors ${groupBy === 'floor' ? 'bg-st-orange text-st-bg' : 'text-st-text hover:bg-st-secondary'}`}
                  >
                    Group by Max Floor
                  </button>
                  <button 
                    onClick={() => setGroupBy('level')}
                    className={`px-3 py-1.5 transition-colors border-l border-st-border ${groupBy === 'level' ? 'bg-st-orange text-st-bg' : 'text-st-text hover:bg-st-secondary'}`}
                  >
                    Group by Arch Level
                  </button>
                </div>
              </div>
            </div>
            
            <div className="max-h-[600px] overflow-y-auto pr-2 pl-2">
              {Object.entries(
                pathData.history.reduce((acc, node) => {
                  const key = groupBy === 'level' ? node.level : node.floor;
                  if (!acc[ key ]) acc[ key ] =[ ];
                  acc[ key ].push(node);
                  return acc;
                }, { })
              ).map(([ groupKey, nodes ], groupIndex) => {
                
                // 1. Pre-batch the events to group timestamps
                const batches = nodes.reduce((acc, node) => {
                  if (acc.length === 0 || acc[acc.length - 1].arch_sec !== node.arch_sec) {
                    acc.push({ arch_sec: node.arch_sec, time_delta: node.time_delta, active_build: node.active_build, events:[ node ] });
                  } else {
                    if (node.time_delta > 0 && !acc[acc.length - 1].time_delta) {
                      acc[acc.length - 1].time_delta = node.time_delta;
                      acc[acc.length - 1].active_build = node.active_build;
                    }
                    acc[acc.length - 1].events.push(node);
                  }
                  return acc;
                },[ ]);

                // 2. Apply Search Filter
                const lowerFilter = searchFilter.toLowerCase();
                const filteredBatches = searchFilter ? batches.filter(batch => {
                  return batch.events.some(n => 
                    (n.event && n.event.toLowerCase().includes(lowerFilter)) ||
                    (n.desc && n.desc.toLowerCase().includes(lowerFilter)) ||
                    (n.active_build_str && n.active_build_str.toLowerCase().includes(lowerFilter))
                  );
                }) : batches;

                // 3. Hide the entire structural group if no events inside it match the search
                if (filteredBatches.length === 0) return null;

                // 4. Auto-expand the accordion if actively searching, otherwise only expand the very first node
                const isGroupOpen = searchFilter ? true : (groupIndex === 0);

                return (
                  <details 
                    key={groupKey} 
                    className="bg-[#0E1117] border border-st-border rounded mb-3 overflow-hidden shadow-sm" 
                    open={isGroupOpen}
                  >
                    <summary className="p-3 bg-st-secondary/20 font-bold cursor-pointer hover:bg-st-secondary/40 transition-colors flex justify-between items-center text-sm text-st-text outline-none select-none group sticky top-0 z-10 backdrop-blur-md">
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-st-text-light transform transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <span className="text-st-orange">{groupBy === 'level' ? 'Arch Level' : 'Max Floor'} {groupKey} Progression</span>
                      </div>
                      <span className="text-xs bg-st-bg px-2 py-1 rounded-full border border-st-border text-st-text-light">{filteredBatches.length} Events</span>
                    </summary>
                    
                    <div className="p-4 text-xs font-mono relative">
                      {/* The Timeline Spine */}
                      <div className="absolute left-[39px] top-4 bottom-4 w-px bg-st-border" />
                      
                      {filteredBatches.map((group, idx) => {
                        const finalEvent = group.events[group.events.length - 1];

                    return (
                      <div key={idx} className="relative mb-8 last:mb-0">
                        
                        {/* TIME GAP ANNOTATION */}
                        {group.time_delta > 0 && (
                          <div className="absolute -top-6 left-12 flex items-center gap-2 opacity-80 bg-st-bg z-10 px-1 border border-st-border rounded shadow-sm">
                            <span className="text-[10px] text-st-text-light flex items-center gap-1">
                              <svg className="w-3 h-3 text-st-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              +{formatNum(group.time_delta)} Arch Sec
                            </span>
                            <span className="text-st-text-light/50">•</span>
                            <span className={`text-[10px] ${group.active_build === 'Push' ? 'text-purple-400' : 'text-green-400'}`}>
                              {group.active_build} Build: {group.events[0].active_build_str}
                            </span>
                          </div>
                        )}

                        {/* BATCHED EVENT NODE */}
                        <div className="flex gap-6 items-start relative z-10">
                          
                          {/* NODE DOT & TIMESTAMP */}
                          <div className="w-16 flex flex-col items-end shrink-0 pt-1">
                            <div className="text-st-orange font-bold text-xs">{formatNum(group.arch_sec)} s</div>
                          </div>
                          
                          {/* THE DOT */}
                          <div className="w-3 h-3 rounded-full bg-st-bg border-2 border-st-orange mt-1.5 shrink-0 z-10" />

                          {/* EVENTS BUBBLE */}
                          <div className="flex-1 bg-st-secondary/20 border border-st-border rounded p-3 shadow-sm hover:bg-st-secondary/30 transition-colors relative group/event">
                            
                            {/* APPLY WORKSPACE BUTTON */}
                            {finalEvent.state_snapshot && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleApplySnapshot(finalEvent.state_snapshot); }}
                                className="absolute top-3 right-3 p-1.5 bg-st-bg border border-st-border rounded text-st-text-light hover:text-st-orange hover:border-st-orange transition-all opacity-0 group-hover/event:opacity-100 z-20"
                                title="Apply Player State to Workspace"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                                </svg>
                              </button>
                            )}

                            <div className="space-y-3">
                              {group.events.map((node, evIdx) => {
                                let evColor = 'text-st-text';
                                if (node.type === 'level') evColor = 'text-green-400';
                                else if (node.type === 'floor') evColor = 'text-purple-400';
                                else if (node.type === 'upgrade') evColor = 'text-blue-400';
                                else if (node.type === 'card') evColor = 'text-yellow-400';

                                return (
                                  <div key={evIdx}>
                                    <strong className={`block text-sm ${evColor}`}>
                                      {node.event}
                                    </strong>
                                    <span className="text-st-text-light block mt-0.5 leading-relaxed">
                                      {node.desc}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                            
                            {/* SIDE-BY-SIDE SNAPSHOT (Only show the final state after the batch resolves) */}
                            {finalEvent.yields && finalEvent.frags && (
                              <details className="mt-3 group/debug text-[10px] bg-[#0E1117] p-2 rounded border border-st-border">
                                <summary className="cursor-pointer hover:text-gray-300 w-max select-none font-bold text-gray-400 flex items-center gap-1">
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  Player State Snapshot
                                </summary>
                                
                                <div className="pt-2 mt-2 grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-st-border text-gray-400">
                                  
                                  {/* Farm Yields */}
                                  <div>
                                    <strong className="text-green-400 border-b border-st-border pb-0.5 mb-1 block">Farm Yields (/1k Arch Sec)</strong>
                                    XP: {formatNum(((finalEvent.yields.farm?.xp_per_min || 0) / 60) * 1000)}<br/>
                                    C: {(((finalEvent.yields.farm?.frag_1_per_min || 0) / 60) * 1000).toFixed(2)} | R: {(((finalEvent.yields.farm?.frag_2_per_min || 0) / 60) * 1000).toFixed(2)}<br/>
                                    E: {(((finalEvent.yields.farm?.frag_3_per_min || 0) / 60) * 1000).toFixed(2)}
                                  </div>

                                  {/* Push Yields */}
                                  <div>
                                    <strong className="text-purple-400 border-b border-st-border pb-0.5 mb-1 block">Push Yields (/1k Arch Sec)</strong>
                                    XP: {formatNum(((finalEvent.yields.push?.xp_per_min || 0) / 60) * 1000)}<br/>
                                    C: {(((finalEvent.yields.push?.frag_1_per_min || 0) / 60) * 1000).toFixed(2)} | R: {(((finalEvent.yields.push?.frag_2_per_min || 0) / 60) * 1000).toFixed(2)}<br/>
                                    E: {(((finalEvent.yields.push?.frag_3_per_min || 0) / 60) * 1000).toFixed(2)}
                                  </div>

                                  {/* Bank */}
                                  <div>
                                    <strong className="text-st-text-light border-b border-st-border pb-0.5 mb-1 block">Fragment Bank</strong>
                                    C: {(finalEvent.frags?.com || 0).toFixed(2)} | R: {(finalEvent.frags?.rare || 0).toFixed(2)}<br/>
                                    E: {(finalEvent.frags?.epic || 0).toFixed(2)} | L: {(finalEvent.frags?.leg || 0).toFixed(2)}<br/>
                                    M: {(finalEvent.frags?.myth || 0).toFixed(2)} | D: {(finalEvent.frags?.div || 0).toFixed(2)}
                                  </div>

                                </div>

                                {/* PENDING CARD DROPS (DIAGNOSTIC) */}
                                {finalEvent.card_progress && Object.keys(finalEvent.card_progress).length > 0 && (
                                  <div className="mt-3 border-t border-st-border pt-2">
                                    <strong className="text-yellow-400 border-b border-st-border pb-0.5 mb-2 block">Pending Card Drops (Hidden Engine Progress)</strong>
                                    <div className="flex flex-wrap gap-2">
                                      {Object.entries(finalEvent.card_progress).filter(([k,v]) => v > 0).map(([k, v]) => {
                                        const isT4 = k.endsWith('4');
                                        const currentLvl = finalEvent.state_snapshot?.cards?.[k] || 0;
                                        let target = 9.669; // Poly/Inf requirement
                                        let label = 'to Poly';
                                        
                                        if (currentLvl === 0) { target = 0.693; label = isT4 ? 'to Gild' : 'to Base'; }
                                        else if (currentLvl === 3) { label = 'to Inf'; }
                                        
                                        const pct = Math.min(100, (v / target) * 100).toFixed(1);
                                        if (pct < 1) return null; // hide negligible progress
                                        
                                        return (
                                          <div key={k} className="bg-[#1e1e1e] border border-st-border px-2 py-1 rounded text-[10px]">
                                            <span className="capitalize text-st-text">{k}:</span> <span className="text-st-orange font-bold">{pct}%</span> <span className="text-st-text-light">{label}</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </details>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>
            );
          })}
          </div>
        </div>
        </>
      )}

    </div>
  );
}