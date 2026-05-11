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
  const[pathData, setPathData] = useState(null);
  const[simStatus, setSimStatus] = useState('');
  const [simProgress, setSimProgress] = useState(0);
  const [groupBy, setGroupBy] = useState('floor'); // 'floor' or 'level'
  const [targetLevel, setTargetLevel] = useState("30"); // Absolute target level
  const [startFrags, setStartFrags] = useState(store.frags || { com: 0, rare: 0, epic: 0, leg: 0, myth: 0, div: 0 });
  const [startCardProgress, setStartCardProgress] = useState(store.card_progress || { });
  const [selectedFragPlot, setSelectedFragPlot] = useState('com');
  
  // Yield Rates Chart Filters
  const [showXpRates, setShowXpRates] = useState(true);
  const[showFragRates, setShowFragRates] = useState(true);
  const[selectedRateFrag, setSelectedRateFrag] = useState('div');
  
  // Card Plot Filters
  const [cardRarityFilter, setCardRarityFilter] = useState([ 'dirt', 'com', 'rare', 'epic', 'leg', 'myth', 'div' ]);

  // Sync workspace state inputs automatically when switching to "current" or applying a log state
  React.useEffect(() => {
    if (startMode === 'current') {
      setStartFrags(store.frags || { com: 0, rare: 0, epic: 0, leg: 0, myth: 0, div: 0 });
      setStartCardProgress(store.card_progress || { });
    }
  }, [ store.frags, store.card_progress, startMode ]);

  const handleFragChange = (key, val) => {
    setStartFrags(prev => ({ ...prev, [key]: parseFloat(val) || 0 }));
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
      base_stats: { ...snap.base_stats },
      upgrade_levels: { ...snap.upgrade_levels },
      external_levels: snap.external_levels ? { ...snap.external_levels } : useStore.getState().external_levels,
      cards: snap.cards ? { ...snap.cards } : useStore.getState().cards,
      card_progress: snap.card_progress ? { ...snap.card_progress } : { },
      frags: snap.frags ? { ...snap.frags } : useStore.getState().frags,
      total_infernal_cards: snap.total_infernal_cards !== undefined ? snap.total_infernal_cards : useStore.getState().total_infernal_cards
    });
    
    // Auto-update the initial time for chunked simulations
    if (snap.arch_sec !== undefined) {
      setStartingArchSecs(Math.floor(snap.arch_sec).toString());
    }

    setSimStatus(`Workspace updated to Level ${snap.arch_level} / Floor ${snap.current_max_floor}!`);
    setTimeout(() => setSimStatus(''), 3000);
  };

  const handleExportTimeline = () => {
    if (!pathData) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(pathData.history, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `pathfinder_chunk_lvl${pathData.history[0]?.level || 1}_to_${targetLevel}.json`);
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
    const fragUIName = { com: 'Common', rare: 'Rare', epic: 'Epic', leg: 'Legendary', myth: 'Mythic', div: 'Divine' }[selectedRateFrag] || 'Divine';

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

  const corrDiagnosticsData = useMemo(() => {
    if (!pathData) return null;
    const xVals =[ ];
    const corrVals =[ ];
    const armorCrackVals =[ ];
    const modPowerVals =[ ];

    pathData.history.forEach(ev => {
      if (ev.state_snapshot && ev.state_snapshot.base_stats) {
        xVals.push(ev.arch_sec);
        const stats = ev.state_snapshot.base_stats;
        corrVals.push(stats.Corr || 0);
        armorCrackVals.push((stats.Str || 0) + (stats.Div || 0) + (stats.Per || 0));
        modPowerVals.push((stats.Luck || 0) + Math.max(stats.Int || 0, stats.Per || 0));
      }
    });
    return { xVals, corrVals, armorCrackVals, modPowerVals };
  }, [pathData]);

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

  const templates = {
    founder: {
      name: "Founder_Asc2_Start",
      arch_level: 1,
      current_max_floor: 1,
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
    setIsSimulating(true);
    setPathData(null);
    setSimProgress(0);
    setSimStatus('Booting Engine...');
    
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
        arch_ability_infernal_bonus: parseFloat(store.arch_ability_infernal_bonus) / 100.0,
        total_infernal_cards: store.total_infernal_cards,
        base_stats: store.base_stats,
        upgrade_levels: store.upgrade_levels,
        external_levels: store.external_levels,
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
      const result = await runPathfinderSimulation(activeState, targetArch, initialFrags, pool, parsedMinWinRate, parsedArchSecs, (prog) => {
        setSimProgress(prog.progress);
        setSimStatus(prog.status);
      });

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
        <p className="text-sm text-st-text-light">
          My experimental macro-optimizer. This tool attempts to project your optimal trajectory through Ascension 2 
          by forecasting milestones, fragment accumulation, and upgrade purchases over Expected Arch Time.
        </p>
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div>
            <label className="block text-sm font-bold text-st-text mb-2">Target Arch Level (Stopping Point):</label>
            <input 
              type="number" 
              min="2"
              value={targetLevel}
              onChange={(e) => setTargetLevel(e.target.value)}
              className="w-full bg-[#0E1117] border border-st-border rounded p-2 text-st-text focus:border-st-orange outline-none"
              placeholder="e.g. 50"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-st-text mb-2">Push Confidence Threshold (%):</label>
            <input 
              type="number" 
              min="1"
              max="100"
              value={minWinRate}
              onChange={(e) => setMinWinRate(e.target.value)}
              className="w-full bg-[#0E1117] border border-st-border rounded p-2 text-st-text focus:border-st-orange outline-none"
              placeholder="e.g. 20"
            />
            <span className="text-[10px] text-st-text-light block mt-1">Min. Win Rate to attempt max floor push.</span>
          </div>
          <div>
            <label className="block text-sm font-bold text-st-text mb-2">Initial Time (Arch Secs):</label>
            <input 
              type="number" 
              min="0"
              value={startingArchSecs}
              onChange={(e) => setStartingArchSecs(e.target.value)}
              className="w-full bg-[#0E1117] border border-st-border rounded p-2 text-st-text focus:border-st-orange outline-none"
              placeholder="e.g. 0"
            />
            <span className="text-[10px] text-st-text-light block mt-1">Offset for chunked simulations.</span>
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
              <p>Total Cards: {asc2Template.total_infernal_cards} | Hades Lvl: {asc2Template.external_levels[21]}</p>
              <p className="mt-2 text-[#FAFAFA]">Autonomous Endgame Director:</p>
              <ul className="list-disc ml-4 opacity-80 mt-1">
                <li>Automated Pivot 1: Pure Fragment builds for Upgrades 41-45</li>
                <li>Automated Pivot 2: Hestia Idol auto-tribute logic (Caps at 3000)</li>
                <li>Automated Pivot 3: Post-Hestia transition to Divine Idol auto-tribute pool</li>
                <li>Automated Pivot 4: Post-Idol transition to Tier 4 Block Hunting</li>
              </ul>
            </div>
          ) : (
            <div>
              <p>Arch Level: {store.arch_level}</p>
              <p>Max Floor: {store.current_max_floor}</p>
              <p>Targeting remaining goals based on current state...</p>
              
              <div className="mt-4 border-t border-st-border pt-4">
                <label className="block text-sm font-bold text-[#FAFAFA] mb-2">Starting Fragment Bank (Raw Amounts):</label>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
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
              </div>

              <div className="mt-4 border-t border-st-border pt-4">
                <label className="block text-sm font-bold text-[#FAFAFA] mb-2">Card Fragment Progress (Poly/Infernal EV):</label>
                <div className="grid grid-cols-4 md:grid-cols-7 gap-2 max-h-48 overflow-y-auto pr-1">
                  {[ 'dirt1', 'com1', 'rare1', 'epic1', 'leg1', 'myth1', 'div1',
                    'dirt2', 'com2', 'rare2', 'epic2', 'leg2', 'myth2', 'div2',
                    'dirt3', 'com3', 'rare3', 'epic3', 'leg3', 'myth3', 'div3',
                    'dirt4', 'com4', 'rare4', 'epic4', 'leg4', 'myth4', 'div4'
                  ].map(blockId => {
                    const lvl = store.cards[blockId] || 0;
                    const canEdit = lvl > 0 && lvl < 4;
                    
                    return (
                      <div key={blockId} className="flex flex-col">
                        <label className={`text-[10px] mb-1 capitalize ${canEdit ? 'text-st-text-light' : 'text-st-border'}`}>
                          {blockId} (L{lvl})
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          disabled={!canEdit}
                          value={startCardProgress[blockId] === 0 ? '' : (startCardProgress[blockId] || '')}
                          onChange={(e) => setStartCardProgress(p => ({ ...p, [blockId]: parseFloat(e.target.value) || 0 }))}
                          className={`bg-st-bg border border-st-border rounded px-2 py-1 focus:border-st-orange outline-none text-xs ${!canEdit ? 'opacity-50 cursor-not-allowed text-st-border' : 'text-st-text'}`}
                          placeholder={canEdit ? "0.0" : "N/A"}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

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
      {pathData && (
        <>
          {/* EDUCATIONAL RULES & CONTROLS */}
          <div className="bg-[#0E1117] border border-st-border rounded p-4 shadow-sm animate-fade-in mb-6">
            <h3 className="text-xl font-bold text-st-text mb-4 border-b border-st-border pb-2 flex items-center gap-2">
               <span className="text-purple-400">🧠</span> Master Timeline Analysis
            </h3>
            
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
                <div className="bg-st-secondary/30 p-3 rounded border border-st-border border-l-2 border-l-red-500">
                  <h4 className="text-xs font-bold text-gray-200 mb-1">1. The Armor Veto (Pushing)</h4>
                  <p className="text-[10px] text-gray-400">
                    If effective armor zeroes out base damage, Corruption's multiplier is useless. To crack high-tier blocks, the engine forcefully zeroes out Corruption to afford <span className="text-red-400 font-mono">Str+Div+Per</span>.
                  </p>
                </div>
                <div className="bg-st-secondary/30 p-3 rounded border border-st-border border-l-2 border-l-green-500">
                  <h4 className="text-xs font-bold text-gray-200 mb-1">2. The Crippled Build Ratio</h4>
                  <p className="text-[10px] text-gray-400">
                    When farming low-tier cards, armor is irrelevant. The engine ignores Armor Crack and hyper-scales <span className="text-green-400 font-mono">Luck+Int</span>, compounding mod yields with maxed Corruption.
                  </p>
                </div>
                <div className="bg-st-secondary/30 p-3 rounded border border-st-border border-l-2 border-l-purple-500">
                  <h4 className="text-xs font-bold text-gray-200 mb-1">3. The Suicide Loop</h4>
                  <p className="text-[10px] text-gray-400">
                    While maximizing Corruption, the engine starves <span className="text-blue-400 font-mono">Agility</span> to shrink the stamina pool. This forces rapid resets to maximize kills-per-minute on weak blocks.
                  </p>
                </div>
            </div>

            {/* MASTER PLOT (With embedded, absolutely positioned controls) */}
            <div className="w-full mt-4 relative" style={{ height: '3200px' }}>
              
              {/* YIELDS CONTROLS (Absolute positioned to match Plot 3 domain: 0.740 top) */}
              <div className="absolute right-[80px] z-10 flex items-center gap-3 bg-[#111] border border-st-border px-3 py-1.5 rounded shadow-md" style={{ top: '850px' }}>
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

              {/* ECONOMY CONTROLS (Absolute positioned to match Plot 4 domain: 0.611 top) */}
              <div className="absolute right-[80px] z-10 flex items-center gap-2 bg-[#111] border border-st-border px-3 py-1.5 rounded shadow-md" style={{ top: '1250px' }}>
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

              {/* CARD CONTROLS (Absolute positioned to match Plot 8 domain: 0.095 top) */}
              <div className="absolute right-[80px] z-10 flex items-center gap-1.5 bg-[#111] border border-st-border px-3 py-1.5 rounded shadow-md" style={{ top: '2860px' }}>
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
                  // 1. Progression
                  { x: chartData.xVals, y: chartData.levelVals, type: 'scatter', mode: 'lines', name: 'Arch Level', line: { color: '#3b82f6', shape: 'hv', width: 2 }, xaxis: 'x', yaxis: 'y', legendgroup: 'prog' },
                  { x: chartData.xVals, y: chartData.floorVals, type: 'scatter', mode: 'lines', name: 'Max Floor', line: { color: '#ef4444', shape: 'hv', width: 2 }, xaxis: 'x', yaxis: 'y', legendgroup: 'prog' },
                  
                  // 2. Opp Cost
                  { x: chartData.pivotXVals, y: chartData.ttnlVals, type: 'scatter', mode: 'lines', name: 'Mins to Level (XP)', line: { color: '#f87171', shape: 'hv', width: 2 }, xaxis: 'x2', yaxis: 'y2', legendgroup: 'opp' },
                  { x: chartData.pivotXVals, y: chartData.ttfVals, type: 'scatter', mode: 'lines', name: 'Mins to Major Upg', line: { color: '#a3e635', shape: 'hv', width: 2 }, xaxis: 'x2', yaxis: 'y2', legendgroup: 'opp' },
                  
                  // 3. Yields
                  ...(showXpRates ?[
                      { x: chartData.xVals, y: chartData.xpVals, type: 'scatter', mode: 'lines', name: 'Farm XP', line: { color: '#4ade80', shape: 'hv', width: 2 }, xaxis: 'x3', yaxis: 'y3', legendgroup: 'yields' },
                      { x: chartData.xVals, y: chartData.pushXpVals, type: 'scatter', mode: 'lines', name: 'Push XP', line: { color: '#ef4444', shape: 'hv', width: 1.5, dash: 'dot' }, xaxis: 'x3', yaxis: 'y3', legendgroup: 'yields' }
                  ] :[ ]),
                  ...(showFragRates ?[
                      { x: chartData.xVals, y: chartData.farmFragVals, type: 'scatter', mode: 'lines', name: `Farm ${chartData.fragUIName}/Min`, line: { color: '#facc15', shape: 'hv', width: 2 }, xaxis: 'x3', yaxis: 'y4', legendgroup: 'yields' },
                      { x: chartData.xVals, y: chartData.pushFragVals, type: 'scatter', mode: 'lines', name: `Push ${chartData.fragUIName}/Min`, line: { color: '#ca8a04', shape: 'hv', width: 1.5, dash: 'dot' }, xaxis: 'x3', yaxis: 'y4', legendgroup: 'yields' }
                  ] : [ ]),

                  // 4. Economy
                  { x: fragChartData.xVals, y: fragChartData.yVals, type: 'scatter', mode: 'lines', name: `${fragDict[selectedFragPlot]} Bank`, line: { color: fragChartData.color, width: 2, shape: 'hv' }, fill: 'tozeroy', fillcolor: fragChartData.color + '20', xaxis: 'x4', yaxis: 'y5', legendgroup: 'econ' },
                  { x: fragChartData.markerX, y: fragChartData.markerY, type: 'scatter', mode: 'markers', name: 'Purchases', marker: { color: '#ffffff', size: 8, line: { color: fragChartData.color, width: 2 } }, text: fragChartData.markerText, hoverinfo: 'text', xaxis: 'x4', yaxis: 'y5', legendgroup: 'econ' },

                  // 5. Push Stats
                  { x: pushChartData.xVals, y: pushChartData.stats.Str, type: 'scatter', mode: 'lines', name: 'Str', line: { color: '#ef4444', width: 2, shape: 'hv' }, xaxis: 'x10', yaxis: 'y10', legendgroup: 'push_stats' },
                  { x: pushChartData.xVals, y: pushChartData.stats.Agi, type: 'scatter', mode: 'lines', name: 'Agi', line: { color: '#3b82f6', width: 2, shape: 'hv' }, xaxis: 'x10', yaxis: 'y10', legendgroup: 'push_stats' },
                  { x: pushChartData.xVals, y: pushChartData.stats.Per, type: 'scatter', mode: 'lines', name: 'Per', line: { color: '#eab308', width: 2, shape: 'hv' }, xaxis: 'x10', yaxis: 'y10', legendgroup: 'push_stats' },
                  { x: pushChartData.xVals, y: pushChartData.stats.Int, type: 'scatter', mode: 'lines', name: 'Int', line: { color: '#06b6d4', width: 2, shape: 'hv' }, xaxis: 'x10', yaxis: 'y10', legendgroup: 'push_stats' },
                  { x: pushChartData.xVals, y: pushChartData.stats.Luck, type: 'scatter', mode: 'lines', name: 'Luck', line: { color: '#22c55e', width: 2, shape: 'hv' }, xaxis: 'x10', yaxis: 'y10', legendgroup: 'push_stats' },
                  { x: pushChartData.xVals, y: pushChartData.stats.Div, type: 'scatter', mode: 'lines', name: 'Div', line: { color: '#f9a8d4', width: 2, shape: 'hv' }, xaxis: 'x10', yaxis: 'y10', legendgroup: 'push_stats' },
                  { x: pushChartData.xVals, y: pushChartData.stats.Corr, type: 'scatter', mode: 'lines', name: 'Corr', line: { color: '#a855f7', width: 2, dash: 'dot', shape: 'hv' }, xaxis: 'x10', yaxis: 'y10', legendgroup: 'push_stats' },
                  { x: pushChartData.xVals, y: pushChartData.stats.Unspent, type: 'scatter', mode: 'lines', name: 'Unspent', line: { color: '#ffffff', width: 2, dash: 'dash', shape: 'hv' }, xaxis: 'x10', yaxis: 'y10', legendgroup: 'push_stats' },

                  // 6. Farm Stats
                  { x: farmChartData.xVals, y: farmChartData.stats.Str, type: 'scatter', mode: 'lines', name: 'Str', line: { color: '#ef4444', width: 2 }, xaxis: 'x5', yaxis: 'y6', legendgroup: 'stats' },
                  { x: farmChartData.xVals, y: farmChartData.stats.Agi, type: 'scatter', mode: 'lines', name: 'Agi', line: { color: '#3b82f6', width: 2 }, xaxis: 'x5', yaxis: 'y6', legendgroup: 'stats' },
                  { x: farmChartData.xVals, y: farmChartData.stats.Per, type: 'scatter', mode: 'lines', name: 'Per', line: { color: '#eab308', width: 2 }, xaxis: 'x5', yaxis: 'y6', legendgroup: 'stats' },
                  { x: farmChartData.xVals, y: farmChartData.stats.Int, type: 'scatter', mode: 'lines', name: 'Int', line: { color: '#06b6d4', width: 2 }, xaxis: 'x5', yaxis: 'y6', legendgroup: 'stats' },
                  { x: farmChartData.xVals, y: farmChartData.stats.Luck, type: 'scatter', mode: 'lines', name: 'Luck', line: { color: '#22c55e', width: 2 }, xaxis: 'x5', yaxis: 'y6', legendgroup: 'stats' },
                  { x: farmChartData.xVals, y: farmChartData.stats.Div, type: 'scatter', mode: 'lines', name: 'Div', line: { color: '#f9a8d4', width: 2 }, xaxis: 'x5', yaxis: 'y6', legendgroup: 'stats' },
                  { x: farmChartData.xVals, y: farmChartData.stats.Corr, type: 'scatter', mode: 'lines', name: 'Corr', line: { color: '#a855f7', width: 2, dash: 'dot' }, xaxis: 'x5', yaxis: 'y6', legendgroup: 'stats' },

                  // 6. Corr Mechanics
                  { x: corrDiagnosticsData.xVals, y: corrDiagnosticsData.armorCrackVals, type: 'scatter', mode: 'lines', name: 'Armor Crack', line: { color: '#ef4444', width: 2, shape: 'hv' }, xaxis: 'x6', yaxis: 'y7', legendgroup: 'corr' },
                  { x: corrDiagnosticsData.xVals, y: corrDiagnosticsData.modPowerVals, type: 'scatter', mode: 'lines', name: 'Mod Power', line: { color: '#4ade80', width: 2, shape: 'hv' }, xaxis: 'x6', yaxis: 'y7', legendgroup: 'corr' },
                  { x: corrDiagnosticsData.xVals, y: corrDiagnosticsData.corrVals, type: 'scatter', mode: 'none', fill: 'tozeroy', name: 'Corr Alloc', fillcolor: 'rgba(168, 85, 247, 0.25)', xaxis: 'x6', yaxis: 'y8', legendgroup: 'corr' },

                  // 7. Cards
                  ...cardSwimlaneData.traces.map(t => ({ ...t, xaxis: 'x7', yaxis: 'y9', legendgroup: 'cards' }))
                 ]}
                layout={{
                  uirevision: 'master_timeline_zoom',
                  paper_bgcolor: 'transparent',
                  plot_bgcolor: 'transparent',
                  font: { color: '#FAFAFA' },
                  margin: { l: 60, r: 60, t: 30, b: 50 },
                  
                  // X-Axes (All synced together via matches: 'x')
                  xaxis:  { anchor: 'y',  matches: 'x', showticklabels: true, tickfont: { size: 10, color: '#888' }, gridcolor: '#333' },
                  xaxis2: { anchor: 'y2', matches: 'x', showticklabels: true, tickfont: { size: 10, color: '#888' }, gridcolor: '#333' },
                  xaxis3: { anchor: showXpRates ? 'y3' : 'y4', matches: 'x', showticklabels: true, tickfont: { size: 10, color: '#888' }, gridcolor: '#333' },
                  xaxis4: { anchor: 'y5', matches: 'x', showticklabels: true, tickfont: { size: 10, color: '#888' }, gridcolor: '#333' },
                  xaxis10:{ anchor: 'y10',matches: 'x', showticklabels: true, tickfont: { size: 10, color: '#888' }, gridcolor: '#333' },
                  xaxis5: { anchor: 'y6', matches: 'x', showticklabels: true, tickfont: { size: 10, color: '#888' }, gridcolor: '#333' },
                  xaxis6: { anchor: 'y7', matches: 'x', showticklabels: true, tickfont: { size: 10, color: '#888' }, gridcolor: '#333' },
                  xaxis7: { anchor: 'y9', matches: 'x', showticklabels: true, tickfont: { size: 12, color: '#eee' }, gridcolor: '#333', title: { text: 'Timeline (Arch Secs)', standoff: 15 } },

                  // Y-Axes (Perfectly spaced mathematically: gap=0.034, height=0.095)
                  yaxis:  { domain: [0.903, 0.998], title: { text: 'Milestone', font: { size: 11 } }, gridcolor: '#333', automargin: true },
                  yaxis2: { domain: [0.774, 0.869], title: { text: 'Cost (Mins)', font: { size: 11 } }, type: 'log', gridcolor: '#333', automargin: true },
                  
                  // Dynamic Plot 3: Yields (y3 = XP, y4 = Frags)
                  yaxis3: showXpRates ? { domain:[0.645, 0.740], title: { text: 'Yields (XP)', font: { size: 11 } }, gridcolor: '#333', automargin: true } : { domain:[0.645, 0.740], visible: false },
                  yaxis4: showFragRates ? { domain: showXpRates ? undefined :[0.645, 0.740], overlaying: showXpRates ? 'y3' : undefined, side: showXpRates ? 'right' : 'left', title: { text: 'Frags/Min', font: { size: 11 } }, gridcolor: showXpRates ? undefined : '#333', automargin: true } : { domain: [0.645, 0.740], visible: false },
                  
                  yaxis5: { domain: [0.516, 0.611], title: { text: 'Bank Amt', font: { size: 11 } }, gridcolor: '#333', automargin: true },
                  yaxis10:{ domain:[0.387, 0.482], title: { text: 'Points', font: { size: 11 } }, gridcolor: '#333', automargin: true },
                  yaxis6: { domain:[0.258, 0.353], title: { text: 'Points', font: { size: 11 } }, gridcolor: '#333', automargin: true },
                  yaxis7: { domain:[0.129, 0.224], title: { text: 'Combined', font: { size: 11 } }, gridcolor: '#333', automargin: true },
                  yaxis8: { overlaying: 'y7', side: 'right', range:[ 0, 16 ], tickfont: { color: '#c084fc' }, title: { text: 'Corr Alloc', font: { color: '#c084fc', size: 11 } }, automargin: true },
                  yaxis9: { domain: [0.000, 0.095], title: { text: 'Block Tier', font: { size: 11 } }, gridcolor: '#333', categoryorder: 'array', categoryarray:[ 'Tier 1', 'Tier 2', 'Tier 3', 'Tier 4' ], automargin: true },
                  
                  // Annotations for Subplot Titles
                  annotations:[
                    { text: '<b>1. Progression Trends</b>', x: 0, y: 0.998, xref: 'paper', yref: 'paper', showarrow: false, font: {size: 14, color: '#fff'}, xanchor: 'left', yanchor: 'bottom', yshift: 5 },
                    { text: '<b>2. Strategic Pivot Point (Opportunity Cost)</b>', x: 0, y: 0.869, xref: 'paper', yref: 'paper', showarrow: false, font: {size: 14, color: '#fff'}, xanchor: 'left', yanchor: 'bottom', yshift: 5 },
                    { text: '<b>3. Yields: Farm vs Push</b>', x: 0, y: 0.740, xref: 'paper', yref: 'paper', showarrow: false, font: {size: 14, color: '#fff'}, xanchor: 'left', yanchor: 'bottom', yshift: 5 },
                    { text: '<b>4. Fragment Economy & Milestones</b>', x: 0, y: 0.611, xref: 'paper', yref: 'paper', showarrow: false, font: {size: 14, color: '#fff'}, xanchor: 'left', yanchor: 'bottom', yshift: 5 },
                    { text: '<b>5. Push Build Stat Distribution</b>', x: 0, y: 0.482, xref: 'paper', yref: 'paper', showarrow: false, font: {size: 14, color: '#fff'}, xanchor: 'left', yanchor: 'bottom', yshift: 5 },
                    { text: '<b>6. Farm Build Stat Distribution</b>', x: 0, y: 0.353, xref: 'paper', yref: 'paper', showarrow: false, font: {size: 14, color: '#fff'}, xanchor: 'left', yanchor: 'bottom', yshift: 5 },
                    { text: '<b>7. Engine Mechanics: Corruption Optimization</b>', x: 0, y: 0.224, xref: 'paper', yref: 'paper', showarrow: false, font: {size: 14, color: '#fff'}, xanchor: 'left', yanchor: 'bottom', yshift: 5 },
                    { text: '<b>8. Card Drops (Swimlanes)</b>', x: 0, y: 0.095, xref: 'paper', yref: 'paper', showarrow: false, font: {size: 14, color: '#fff'}, xanchor: 'left', yanchor: 'bottom', yshift: 5 }
                  ],

                  showlegend: true,
                  legend: { orientation: 'v', x: 1.05, y: 1 },
                  autosize: true,
                  hovermode: 'x' // Draws the vertical line through all charts!
                }}
                useResizeHandler={true}
                style={{ width: '100%', height: '100%' }}
              />
            </div>
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

          {/* PUSH BUILD STATS (FLOOR-BASED X-AXIS) */}
          <div className="bg-[#0E1117] border border-st-border rounded p-4 shadow-sm animate-fade-in mb-6">
            <h3 className="text-lg font-bold text-st-text mb-4 border-b border-st-border pb-2 flex items-center gap-2">
               Push Build Stat Breakpoints
               <span className="text-[10px] bg-st-secondary text-gray-400 px-2 py-0.5 rounded font-mono font-normal border border-st-border">X-Axis = Max Floor Pushed</span>
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
                  xaxis: { title: { text: 'Max Floor', standoff: 15 }, gridcolor: '#333' },
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
              <h3 className="text-lg font-bold text-st-text shrink-0">Node-Graph Timeline</h3>
              
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
                    className="w-full bg-st-secondary/30 border border-st-border rounded py-1.5 pl-8 pr-2 text-xs text-st-text focus:border-st-orange outline-none"
                  />
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
              ).map(([ groupKey, nodes ]) => {
                
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

                // 4. Auto-expand the accordion if actively searching, otherwise use default logic
                const isGroupOpen = searchFilter ? true : (groupKey === "1" || groupKey === "30" || groupKey === "2");

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