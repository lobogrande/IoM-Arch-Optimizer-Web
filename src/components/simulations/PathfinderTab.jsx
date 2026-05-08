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
  const [pathData, setPathData] = useState(null);
  const[simStatus, setSimStatus] = useState('');
  const [simProgress, setSimProgress] = useState(0);
  const [groupBy, setGroupBy] = useState('level'); // 'level' or 'floor'
  const [targetLevel, setTargetLevel] = useState("30"); // Absolute target level
  const [startFrags, setStartFrags] = useState({ com: 0, rare: 0, epic: 0, leg: 0, myth: 0, div: 0 });

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
  const[shiftFloor, setShiftFloor] = useState("100");
  const [minWinRate, setMinWinRate] = useState("20");

  const chartData = useMemo(() => {
    if (!pathData) return null;
    const xVals =[ ];
    const xpVals =[ ];
    const divVals =[ ];

    pathData.history.forEach(ev => {
      xVals.push(ev.arch_sec);
      xpVals.push((ev.yields?.farm?.xp_per_min || 0));
      divVals.push(ev.yields?.farm?.frag_6_per_min || 0);
    });

    return { xVals, xpVals, divVals };
  },[pathData]);

  const pushChartData = useMemo(() => {
    if (!pathData) return null;
    const floors =[ ];
    const stats = { Str:[ ], Agi:[ ], Per:[ ], Int:[ ], Luck:[ ], Div:[ ], Corr:[ ] };
    const statKeys =['Str', 'Agi', 'Per', 'Int', 'Luck', 'Div', 'Corr'];

    pathData.history.forEach(ev => {
      if (ev.type === 'floor' && ev.active_build_str) {
        floors.push(ev.floor);
        // Extract the array from "[1/7/0/0/1/9/0]"
        const match = ev.active_build_str.match(/\[(.*?)\]/);
        if (match) {
          const parts = match[1].split('/');
          statKeys.forEach((key, idx) => {
            stats[key].push(parseInt(parts[idx]) || 0);
          });
        }
      }
    });

    return { floors, stats };
  },[pathData]);

  const asc2Template = {
    arch_level: 1,
    current_max_floor: 1,
    arch_ability_infernal_bonus: parseFloat(store.arch_ability_infernal_bonus || "0") / 100.0,
    total_infernal_cards: store.total_infernal_cards || 0,
    base_stats: { Str: 0, Agi: 0, Per: 0, Int: 0, Luck: 0, Div: 0, Corr: 0 },
    // Only keeping external upgrades that persist across Ascensions
    external_levels: { 4: 0, 5: store.external_levels[5] || 0, 6: store.external_levels[6] || 0, 8: store.geoduck_unlocked ? (store.external_levels[8] || 0) : 0, 21: store.external_levels[21] || 0 },
    upgrade_levels: { },
    cards: { } 
  };

  const handleStartPathfinder = async () => {
    setIsSimulating(true);
    setPathData(null);
    setSimProgress(0);
    setSimStatus('Booting Engine...');
    
    try {
      const pool = new EngineWorkerPool();
      await pool.init();
      
      setSimStatus('Syncing Engine State...');
      
      // Force Asc2 Unlocked for the template start!
      const activeState = startMode === 'template' ? { ...asc2Template, asc2_unlocked: true, asc1_unlocked: true } : {
        asc1_unlocked: store.asc1_unlocked,
        asc2_unlocked: store.asc2_unlocked,
        arch_level: store.arch_level,
        current_max_floor: store.current_max_floor,
        arch_ability_infernal_bonus: parseFloat(store.arch_ability_infernal_bonus) / 100.0,
        total_infernal_cards: store.total_infernal_cards,
        base_stats: store.base_stats,
        upgrade_levels: store.upgrade_levels,
        external_levels: store.external_levels,
        cards: store.cards
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

      const parsedShift = parseInt(shiftFloor) || 100;
      const parsedMinWinRate = parseFloat(minWinRate) || 20;
      const result = await runPathfinderSimulation(activeState, targetArch, initialFrags, pool, parsedShift, parsedMinWinRate, (prog) => {
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
            <label className="block text-sm font-bold text-st-text mb-2">Strategic Shift (Target Floor):</label>
            <input 
              type="number" 
              min="1"
              value={shiftFloor}
              onChange={(e) => setShiftFloor(e.target.value)}
              className="w-full bg-[#0E1117] border border-st-border rounded p-2 text-st-text focus:border-st-orange outline-none"
              placeholder="e.g. 100"
            />
            <span className="text-[10px] text-st-text-light block mt-1">Shifts Farm priority to Divine Frags.</span>
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
        </div>

        <div className="bg-[#0E1117] p-3 rounded border border-st-border text-xs font-mono text-st-text-light mb-6">
          {startMode === 'template' ? (
            <div>
              <p>Arch Level: {asc2Template.arch_level}</p>
              <p>Max Floor: {asc2Template.current_max_floor}</p>
              <p>Upgrades: None</p>
              <p className="mt-2 text-[#FAFAFA]">Goal Director Logic:</p>
              <ul className="list-disc ml-4 opacity-80 mt-1">
                <li>Priority 1: Push Floor 200</li>
                <li>Priority 2: Max Internal Upgrades via Fragment Farming</li>
                <li>Priority 3: Farm Divine Fragments (Hades Idol)</li>
                <li>Priority 4: Div4 Farming / Infernal Completion</li>
              </ul>
            </div>
          ) : (
            <div>
              <p>Arch Level: {store.arch_level}</p>
              <p>Max Floor: {store.current_max_floor}</p>
              <p>Targeting remaining goals based on current state...</p>
              
              <div className="mt-4 border-t border-st-border pt-4">
                <label className="block text-sm font-bold text-[#FAFAFA] mb-2">Starting Fragment Bank (Millions):</label>
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

      {/* VISUALIZATIONS & RESULTS AREA */}
      {pathData && (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
            <div className="bg-[#0E1117] border border-st-border rounded p-4 shadow-sm animate-fade-in">
              <h3 className="text-lg font-bold text-st-text mb-4 border-b border-st-border pb-2">Farm Yields over Time</h3>
              <div className="h-[400px] w-full">
                <Plot
                  data={[
                    {
                      x: chartData.xVals,
                      y: chartData.xpVals,
                      type: 'scatter',
                      mode: 'lines',
                      name: 'XP / Min',
                      line: { color: '#4ade80', shape: 'hv', width: 2 },
                      yaxis: 'y'
                    },
                    {
                      x: chartData.xVals,
                      y: chartData.divVals,
                      type: 'scatter',
                      mode: 'lines',
                      name: 'Divine Frags / Min',
                      line: { color: '#facc15', shape: 'hv', width: 2 },
                      yaxis: 'y2'
                    }
                  ]}
                  layout={{
                    paper_bgcolor: 'transparent',
                    plot_bgcolor: 'transparent',
                    font: { color: '#FAFAFA' },
                    margin: { l: 50, r: 50, t: 10, b: 40 },
                    xaxis: { title: 'Timeline (Arch Seconds)', gridcolor: '#333' },
                    yaxis: { title: 'XP/Min', titlefont: { color: '#4ade80' }, tickfont: { color: '#4ade80' }, gridcolor: '#333' },
                    yaxis2: { title: 'Div Frags/Min', titlefont: { color: '#facc15' }, tickfont: { color: '#facc15' }, overlaying: 'y', side: 'right', showgrid: false },
                    legend: { orientation: 'h', y: -0.2, x: 0.5, xanchor: 'center' },
                    autosize: true
                  }}
                  useResizeHandler={true}
                  style={{ width: '100%', height: '100%' }}
                />
              </div>
            </div>

            <div className="bg-[#0E1117] border border-st-border rounded p-4 shadow-sm animate-fade-in">
              <h3 className="text-lg font-bold text-st-text mb-4 border-b border-st-border pb-2">Push Build Stat Distribution</h3>
              <div className="h-[400px] w-full">
                <Plot
                  data={[
                    { x: pushChartData.floors, y: pushChartData.stats.Str, type: 'scatter', mode: 'lines+markers', name: 'Str', line: { color: '#ef4444', width: 2 } },
                    { x: pushChartData.floors, y: pushChartData.stats.Agi, type: 'scatter', mode: 'lines+markers', name: 'Agi', line: { color: '#3b82f6', width: 2 } },
                    { x: pushChartData.floors, y: pushChartData.stats.Per, type: 'scatter', mode: 'lines+markers', name: 'Per', line: { color: '#eab308', width: 2 } },
                    { x: pushChartData.floors, y: pushChartData.stats.Int, type: 'scatter', mode: 'lines+markers', name: 'Int', line: { color: '#06b6d4', width: 2 } },
                    { x: pushChartData.floors, y: pushChartData.stats.Luck, type: 'scatter', mode: 'lines+markers', name: 'Luck', line: { color: '#22c55e', width: 2 } },
                    { x: pushChartData.floors, y: pushChartData.stats.Div, type: 'scatter', mode: 'lines+markers', name: 'Div', line: { color: '#f9a8d4', width: 2 } },
                    { x: pushChartData.floors, y: pushChartData.stats.Corr, type: 'scatter', mode: 'lines+markers', name: 'Corr', line: { color: '#a855f7', width: 2, dash: 'dot' } }
                  ]}
                  layout={{
                    paper_bgcolor: 'transparent',
                    plot_bgcolor: 'transparent',
                    font: { color: '#FAFAFA' },
                    margin: { l: 40, r: 20, t: 10, b: 40 },
                    xaxis: { title: 'Max Floor Pushed', gridcolor: '#333' },
                    yaxis: { title: 'Stat Points Allocated', gridcolor: '#333' },
                    legend: { orientation: 'h', y: -0.2, x: 0.5, xanchor: 'center' },
                    autosize: true
                  }}
                  useResizeHandler={true}
                  style={{ width: '100%', height: '100%' }}
                />
              </div>
            </div>
          </div>

          <div className="bg-st-bg border border-st-border rounded p-4 shadow-sm animate-fade-in">
            <div className="flex justify-between items-center mb-4 border-b border-st-border pb-2">
              <h3 className="text-lg font-bold text-st-text">Node-Graph Timeline</h3>
              <div className="flex bg-st-secondary/50 rounded border border-st-border text-xs font-bold overflow-hidden">
                <button 
                  onClick={() => setGroupBy('level')}
                  className={`px-3 py-1.5 transition-colors ${groupBy === 'level' ? 'bg-st-orange text-st-bg' : 'text-st-text hover:bg-st-secondary'}`}
                >
                  Group by Arch Level
                </button>
                <button 
                  onClick={() => setGroupBy('floor')}
                  className={`px-3 py-1.5 transition-colors border-l border-st-border ${groupBy === 'floor' ? 'bg-st-orange text-st-bg' : 'text-st-text hover:bg-st-secondary'}`}
                >
                  Group by Max Floor
                </button>
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
              ).map(([ groupKey, nodes ]) => (
                <details 
                  key={groupKey} 
                  className="bg-[#0E1117] border border-st-border rounded mb-3 overflow-hidden shadow-sm" 
                  open={groupKey === "1" || groupKey === "30" || groupKey === "2"}
                >
                  <summary className="p-3 bg-st-secondary/20 font-bold cursor-pointer hover:bg-st-secondary/40 transition-colors flex justify-between items-center text-sm text-st-text outline-none select-none group sticky top-0 z-10 backdrop-blur-md">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-st-text-light transform transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      <span className="text-st-orange">{groupBy === 'level' ? 'Arch Level' : 'Max Floor'} {groupKey} Progression</span>
                    </div>
                    <span className="text-xs bg-st-bg px-2 py-1 rounded-full border border-st-border text-st-text-light">{nodes.length} Events</span>
                  </summary>
                  
                  <div className="p-4 text-xs font-mono relative">
                    {/* The Timeline Spine */}
                    <div className="absolute left-[39px] top-4 bottom-4 w-px bg-st-border" />
                    
                    {nodes.reduce((acc, node) => {
                    // Group events that occur at the exact same Arch Sec timestamp
                    if (acc.length === 0 || acc[acc.length - 1].arch_sec !== node.arch_sec) {
                      acc.push({
                        arch_sec: node.arch_sec,
                        time_delta: node.time_delta,
                        active_build: node.active_build,
                        events:[ node ]
                      });
                    } else {
                      // Grab the time gap annotation if it was recorded on the first event in the batch
                      if (node.time_delta > 0 && !acc[acc.length - 1].time_delta) {
                        acc[acc.length - 1].time_delta = node.time_delta;
                        acc[acc.length - 1].active_build = node.active_build;
                      }
                      acc[acc.length - 1].events.push(node);
                    }
                    return acc;
                  },[ ]).map((group, idx) => {
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
                          <div className="flex-1 bg-st-secondary/20 border border-st-border rounded p-3 shadow-sm hover:bg-st-secondary/30 transition-colors">
                            <div className="space-y-3">
                              {group.events.map((node, evIdx) => {
                                let evColor = 'text-st-text';
                                if (node.type === 'level') evColor = 'text-green-400';
                                else if (node.type === 'floor') evColor = 'text-purple-400';
                                else if (node.type === 'upgrade') evColor = 'text-blue-400';

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
                              </details>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>
            ))}
          </div>
        </div>
        </>
      )}

    </div>
  );
}