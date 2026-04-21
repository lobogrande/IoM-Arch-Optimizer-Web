// src/components/simulations/SandboxTab.jsx
import { useMemo, useRef } from 'react';
import useStore from '../../store';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';

ModuleRegistry.registerModules([ AllCommunityModule ]);

export default function SandboxTab() {
  const store = useStore();
  const sandboxGridRef = useRef(null);

  const sandboxMinHits = store.sandboxMinHits;
  const setSandboxMinHits = store.setSandboxMinHits;
  const sandboxShowUnreachable = store.sandboxShowUnreachable;
  const setSandboxShowUnreachable = store.setSandboxShowUnreachable;
  const sandboxShowCrits = store.sandboxShowCrits;
  const setSandboxShowCrits = store.setSandboxShowCrits;
  const sandboxBlockFilters = store.sandboxBlockFilters;
  const setSandboxBlockFilters = store.setSandboxBlockFilters;
  const sandbox_baseline = store.sandbox_baseline;
  const sandbox_baseline_stats = store.sandbox_baseline_stats;
  const setSandboxBaseline = store.setSandboxBaseline;

  const sbData = store.sandbox_calculated_stats;
  const tFloor = store.sandbox_floor ?? store.current_max_floor;

  const totalAllowed = parseInt(store.arch_level) + parseInt(store.upgrade_levels[12] || 0);
  const capInc = parseInt(store.upgrade_levels[45] || 0) * 5; 

  const MAX_STAT_CAPS = {
    Str: 55, Agi: 55, Per: 30, Int: 30, Luck: 30,
    Div: store.asc1_unlocked ? 15 : 0, 
    Corr: store.asc2_unlocked ? 15 : 0,
    Unassigned: 9999
  };

  const activeStats = [ 'Str', 'Agi', 'Per', 'Int', 'Luck' ];
  if (store.asc1_unlocked) activeStats.push('Div');
  if (store.asc2_unlocked) activeStats.push('Corr');

  const baselineMap = useMemo(() => {
    if (!sandbox_baseline || !sandbox_baseline.blocks_data) return null;
    const map = new Map();
    sandbox_baseline.blocks_data.forEach(b => map.set(b.name, b));
    return map;
  }, [sandbox_baseline]);

  const sandboxBlocks = useMemo(() => {
    if (!sbData) return[];
    let filtered = sbData.blocks_data;
    if (!sandboxShowUnreachable) {
      filtered = filtered.filter(b => tFloor >= b.min_floor);
    }
    if (sandboxMinHits > 1) filtered = filtered.filter(b => b.avg_hits >= sandboxMinHits);
    if (sandboxBlockFilters.length > 0) filtered = filtered.filter(b => sandboxBlockFilters.includes(b.name));
    return filtered;
  }, [sbData, tFloor, sandboxShowUnreachable, sandboxMinHits, sandboxBlockFilters]);

  const uniqueBlockNames = sbData ? Array.from(new Set(sbData.blocks_data.map(b => b.name))) :[];

  const sandboxDefaultColDef = useMemo(() => ({
    sortable: true,
    filter: true,
    resizable: true
  }),[]);

  const sandboxAutoSizeStrategy = useMemo(() => ({
    type: 'fitCellContents'
  }),[]);

  const sandboxColumns = useMemo(() => {
    const createDiffRenderer = (field, isLowerBetter = false) => (p) => {
      const val = p.data[field];
      let baseVal = null;
      if (baselineMap && baselineMap.has(p.data.name)) {
        baseVal = baselineMap.get(p.data.name)[field];
      }

      const formattedVal = Math.floor(val).toLocaleString();
      if (baseVal === null || baseVal === undefined || Math.floor(val) === Math.floor(baseVal)) {
        return <span>{formattedVal}</span>;
      }

      const diff = Math.floor(val) - Math.floor(baseVal);
      const diffStr = diff > 0 ? `+${diff.toLocaleString()}` : diff.toLocaleString();
      
      const isGood = isLowerBetter ? diff < 0 : diff > 0;
      const colorClass = isGood ? '#4CAF50' : '#ff4b4b';

      return (
        <div className="flex items-center justify-center w-full gap-1 h-full">
          <span>{formattedVal}</span>
          <span style={{ color: colorClass, fontSize: '0.75rem', fontWeight: 'bold' }}>({diffStr})</span>
        </div>
      );
    };

    const cols =[
      { 
        field: "id", headerName: "Icon", pinned: "left", minWidth: 70, sortable: false, filter: false,
        cellRenderer: (p) => (
          <div className="flex justify-center items-center h-full">
            <img src={`/assets/cards/cores/${p.value}.png`} alt={p.value} className="w-8 h-8 pixelated" />
          </div>
        )
      },
      { field: "name", headerName: "Block", pinned: "left" },
      { field: "mod_hp", headerName: "HP", valueFormatter: p => Math.floor(p.value).toLocaleString(), filter: 'agNumberColumnFilter' },
      { field: "mod_eff_armor", headerName: "Armor", valueFormatter: p => Math.floor(p.value).toLocaleString(), filter: 'agNumberColumnFilter' },
      { field: "edps", headerName: "EDPS", cellRenderer: createDiffRenderer("edps", false), filter: 'agNumberColumnFilter', cellStyle: { color: '#ffa229', fontWeight: 'bold' } },
      { field: "enr_edps", headerName: "Enr EDPS", cellRenderer: createDiffRenderer("enr_edps", false), filter: 'agNumberColumnFilter', cellStyle: { color: '#f87171', fontWeight: 'bold' } },
      { field: "reg_hit", headerName: "Reg Hit", cellRenderer: createDiffRenderer("reg_hit", false), filter: 'agNumberColumnFilter' },
      { field: "avg_hits", headerName: "Avg Hits", cellRenderer: createDiffRenderer("avg_hits", true), filter: 'agNumberColumnFilter', cellStyle: { fontWeight: 'bold' } },
      { field: "max_hits", headerName: "Max Hits", cellRenderer: createDiffRenderer("max_hits", true), filter: 'agNumberColumnFilter', cellStyle: { color: '#7D808D' } }
    ];

    if (sandboxShowCrits) {
      cols.push(
        { field: "crit", headerName: "Crit", cellRenderer: createDiffRenderer("crit", false), filter: 'agNumberColumnFilter', cellStyle: { backgroundColor: 'rgba(0,0,0,0.05)' } },
        { field: "scrit", headerName: "sCrit", cellRenderer: createDiffRenderer("scrit", false), filter: 'agNumberColumnFilter', cellStyle: { backgroundColor: 'rgba(0,0,0,0.05)' } },
        { field: "ucrit", headerName: "uCrit", cellRenderer: createDiffRenderer("ucrit", false), filter: 'agNumberColumnFilter', cellStyle: { backgroundColor: 'rgba(0,0,0,0.05)' } },
        { field: "enr_hit", headerName: "Enr Hit", cellRenderer: createDiffRenderer("enr_hit", false), filter: 'agNumberColumnFilter', cellStyle: { color: '#fca5a5', backgroundColor: 'rgba(127,29,29,0.05)' } },
        { field: "enr_crit", headerName: "Enr Crit", cellRenderer: createDiffRenderer("enr_crit", false), filter: 'agNumberColumnFilter', cellStyle: { color: '#fca5a5', backgroundColor: 'rgba(127,29,29,0.05)' } },
        { field: "enr_scrit", headerName: "Enr sCrit", cellRenderer: createDiffRenderer("enr_scrit", false), filter: 'agNumberColumnFilter', cellStyle: { color: '#fca5a5', backgroundColor: 'rgba(127,29,29,0.05)' } },
        { field: "enr_ucrit", headerName: "Enr uCrit", cellRenderer: createDiffRenderer("enr_ucrit", false), filter: 'agNumberColumnFilter', cellStyle: { color: '#fca5a5', backgroundColor: 'rgba(127,29,29,0.05)' } }
      );
    }
    return cols;
  },[sandboxShowCrits, baselineMap]);

  return (
    <div className="space-y-6 animate-fade-in">
      <h2 className="text-2xl font-bold">🧪 Block Hit Sandbox</h2>
      <div className="text-sm text-st-text-light">
        <p>💡 <strong>What is a Breakpoint?</strong></p>
        <p>A breakpoint is the exact stat number required to reduce the hits needed to break a block (e.g., dropping from 3 hits down to 2). Because blocks can only take whole hits, any stat points you spend that <em>don't</em> push you past the next breakpoint are mathematically wasted!</p>
      </div>

      <details className="st-container group cursor-pointer marker:text-st-orange mb-6">
        <summary className="font-bold">📚 Math & Formulas Breakdown (Click to expand)</summary>
        <div className="mt-4 text-sm space-y-2 cursor-default font-mono">
          <p><strong>Legend:</strong> P[x] = Probability of x | M[x] = Multiplier of x</p>
          <p><strong>Formulas:</strong></p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Armor = (Base Armor) - (Armor Pen)</li>
            <li>Regular Hit = (Damage - Armor)</li>
            <li>Crit Hit = (Damage - Armor) × M[Crit]</li>
            <li>Super Crit Hit = (Damage - Armor) × M[Crit] × M[sCrit]</li>
            <li>Ultra Crit Hit = (Damage - Armor) × M[Crit] × M[sCrit] × M[uCrit]</li>
          </ul>
          <p className="mt-3 text-st-orange font-bold">Expected Damage Per Swing (EDPS):</p>
          <p>EDPS = (P[Reg]×1.0 + P[Crit]×M[Crit] + P[sCrit]×M[sCrit] + P[uCrit]×M[uCrit]) × (Damage - Armor)</p>
        </div>
      </details>

      <hr className="border-st-border" />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <div className="st-container bg-black/10">
            <div className="grid grid-cols-2 gap-2 mb-2">
              <button 
                onClick={() => {
                  activeStats.forEach(s => store.setSandboxStat(s, store.base_stats[s] || 0));
                }}
                className="w-full py-2 bg-st-secondary border border-st-border text-xs font-bold rounded hover:border-st-orange transition-colors"
              >
                🔄 Pull Global
              </button>
              <button 
                onClick={() => {
                  const sbTotal = activeStats.reduce((acc, s) => acc + (store.sandbox_stats[s] || 0), 0);
                  if (sbTotal > totalAllowed) {
                    alert(`❌ Cannot push: Sandbox uses ${sbTotal} points but budget is ${totalAllowed}!`);
                    return;
                  }
                  activeStats.forEach(s => store.setBaseStat(s, store.sandbox_stats[s] || 0));
                  alert("✅ Sandbox stats pushed to Global UI!");
                }}
                className="w-full py-2 bg-st-secondary border border-st-border text-xs font-bold rounded hover:border-st-orange transition-colors"
              >
                📤 Push Global
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-6">
              <button 
                onClick={() => {
                  store.setSimsState('duelStatsA', store.sandbox_stats);
                  store.setSimActiveSubTab('duel');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="w-full py-2 bg-[#2b2b2b] border border-st-orange text-st-orange text-xs font-bold rounded hover:bg-st-orange hover:text-[#2b2b2b] transition-colors"
              >
                ⚔️ Duel (A)
              </button>
              <button 
                onClick={() => {
                  store.setSimsState('duelStatsB', store.sandbox_stats);
                  store.setSimActiveSubTab('duel');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="w-full py-2 bg-[#2b2b2b] border border-st-orange text-st-orange text-xs font-bold rounded hover:bg-st-orange hover:text-[#2b2b2b] transition-colors"
              >
                ⚔️ Duel (B)
              </button>
            </div>
            
            <div className="flex gap-2 mb-2">
              <button 
                onClick={() => setSandboxBaseline(sbData, store.sandbox_stats)}
                disabled={!sbData}
                className="flex-1 py-2 bg-[#2b2b2b] border border-st-orange text-st-orange text-xs font-bold rounded hover:bg-st-orange hover:text-[#2b2b2b] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                🔒 Lock Baseline
              </button>
              {sandbox_baseline && (
                <button 
                  onClick={() => {
                    if (sandbox_baseline_stats) store.setSandboxStats(sandbox_baseline_stats);
                  }}
                  className="flex-1 py-2 bg-[#2b2b2b] border border-blue-500 text-blue-400 text-xs font-bold rounded hover:bg-blue-900 hover:text-white transition-colors"
                >
                  ⏪ Restore
                </button>
              )}
              {sandbox_baseline && (
                <button 
                  onClick={() => setSandboxBaseline(null, null)}
                  className="flex-1 py-2 bg-st-secondary border border-red-900 text-red-400 text-xs font-bold rounded hover:bg-red-900 hover:text-white transition-colors"
                >
                  🔓 Clear
                </button>
              )}
            </div>
            <div className="text-xs text-st-text-light mb-6 leading-tight">
              Take a snapshot of the current table. Tweak your stats below to instantly see exactly how much damage you gain or lose!
            </div>

            <h4 className="font-bold mb-4">Sandbox Stats</h4>
            <div className="grid grid-cols-2 gap-3 mb-6">
              {activeStats.map(stat => (
                <div key={stat} className="st-container flex flex-col items-center bg-st-bg p-2">
                  <div className="text-center mb-1">
                    <span className="font-bold text-xs">{stat}</span><br/>
                    <span className="text-[10px] text-st-text-light">(Max: {MAX_STAT_CAPS[stat]})</span>
                  </div>
                  <img 
                    src={`/assets/stats_small/${stat.toLowerCase()}.png`} 
                    onError={(e) => { e.target.onerror = null; e.target.src = `/assets/stats/${stat.toLowerCase()}.png` }}
                    alt={stat} 
                    className="h-6 w-6 pixelated mb-2"
                  />
                  <input
                    type="number"
                    min="0"
                    max={MAX_STAT_CAPS[stat]}
                    value={store.sandbox_stats[stat] !== undefined ? store.sandbox_stats[stat] : 0}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => store.setSandboxStat(stat, e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0))}
                    onBlur={(e) => {
                      let parsed = parseInt(e.target.value) || 0;
                      if (parsed > MAX_STAT_CAPS[stat]) parsed = MAX_STAT_CAPS[stat];
                      if (parsed < 0) parsed = 0;
                      store.setSandboxStat(stat, parsed);
                    }}
                    className="st-input p-1 text-sm h-8"
                  />
                  <div className="flex flex-wrap justify-center gap-1 mt-2 w-full">
                    <button onClick={() => store.setSandboxStat(stat, Math.max(0, (store.sandbox_stats[stat] || 0) - 5))} className="flex-1 px-1 py-1 text-[10px] bg-st-secondary text-st-text rounded border border-st-border hover:border-st-orange transition-colors">-5</button>
                    <button onClick={() => store.setSandboxStat(stat, Math.min(MAX_STAT_CAPS[stat], (store.sandbox_stats[stat] || 0) + 5))} className="flex-1 px-1 py-1 text-[10px] bg-st-secondary text-st-text rounded border border-st-border hover:border-st-orange transition-colors">+5</button>
                    <button onClick={() => store.setSandboxStat(stat, MAX_STAT_CAPS[stat])} className="flex-1 px-1 py-1 text-[10px] font-bold bg-st-secondary text-st-text rounded border border-st-border hover:border-st-orange transition-colors">Max</button>
                  </div>
                </div>
              ))}
            </div>

            <hr className="border-st-border mb-4" />
            <h4 className="font-bold mb-4">Settings</h4>
            
            <div className="space-y-4 text-sm">
             <div>
                <label className="block mb-1">Target Floor:</label>
                <input 
                  type="number"
                  value={store.sandbox_floor ?? store.current_max_floor}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => store.setSimsState('sandbox_floor', e.target.value === '' ? '' : parseInt(e.target.value))}
                  onBlur={(e) => store.setSimsState('sandbox_floor', Math.max(1, parseInt(e.target.value) || 1))}
                  className="st-input h-8" 
                />
              </div>
              <div>
                <label className="block mb-1">Min Avg Hits to Kill:</label>
                <input 
                  type="number"
                  value={sandboxMinHits}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setSandboxMinHits(e.target.value === '' ? '' : parseInt(e.target.value))}
                  onBlur={(e) => setSandboxMinHits(Math.max(1, parseInt(e.target.value) || 1))}
                  className="st-input h-8" 
                />
              </div>
              <label className="flex items-center space-x-2 cursor-pointer mt-2">
                <input 
                  type="checkbox" 
                  checked={sandboxShowUnreachable}
                  onChange={() => setSandboxShowUnreachable(!sandboxShowUnreachable)}
                  className="accent-st-orange w-4 h-4"
                />
                <span>Show Unreachable Blocks</span>
              </label>
            </div>
          </div>
        </div>

        <div className="lg:col-span-3">
          <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-end mb-4">
            <div className="w-full md:w-1/2">
              <label className="block font-bold mb-1">🎯 Target Breakpoints</label>
              <select 
                multiple
                value={sandboxBlockFilters}
                onChange={(e) => setSandboxBlockFilters(Array.from(e.target.selectedOptions, o => o.value))}
                className="w-full bg-st-bg border border-st-border rounded p-2 text-st-text focus:border-st-orange focus:outline-none h-[80px]"
              >
                {uniqueBlockNames.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
            
            <div className="w-full md:w-1/2 flex flex-col items-start md:items-end space-y-3">
              <div className="text-xs text-st-text-light text-left md:text-right">
                <div><strong>Avg Hits:</strong> Number of hits to destroy the block based on EDPS (Average Damage over time).</div>
                <div><strong>Max Hits:</strong> Number of hits to destroy the block based purely on Regular (Non-Crit) damage.</div>
              </div>
              <div className="flex gap-2 w-full md:w-auto">
                <label className="flex flex-1 items-center justify-center space-x-2 cursor-pointer bg-st-secondary px-3 py-2 border border-st-border rounded hover:border-st-orange transition-colors text-sm">
                  <input 
                    type="checkbox" 
                    checked={sandboxShowCrits}
                    onChange={() => setSandboxShowCrits(!sandboxShowCrits)}
                    className="accent-st-orange w-4 h-4"
                  />
                  <span className="font-bold">🔍 Show Detailed Crits</span>
                </label>
                <button 
                  onClick={() => sandboxGridRef.current?.api.setFilterModel(null)}
                  className="px-3 py-2 bg-st-secondary border border-st-border text-st-text font-bold rounded hover:border-st-orange transition-colors text-sm whitespace-nowrap"
                >
                  🔄 Reset Filters
                </button>
              </div>
            </div>
          </div>

          <div 
            className={`border border-st-border rounded bg-st-bg h-[600px] w-full outline-none ${store.theme === 'dark' ? 'ag-theme-quartz-dark' : 'ag-theme-quartz'}`}
            tabIndex={-1}
            onMouseEnter={(e) => {
              if (!e.currentTarget.contains(document.activeElement)) {
                e.currentTarget.focus();
              }
            }}
          >
            {!sbData ? (
              <div className="flex items-center justify-center h-full text-st-text-light">Calculating sandbox math...</div>
            ) : (
              <AgGridReact
                ref={sandboxGridRef}
                theme="legacy"
                rowData={sandboxBlocks}
                defaultColDef={sandboxDefaultColDef}
                autoSizeStrategy={sandboxAutoSizeStrategy}
                columnDefs={sandboxColumns}
                onFirstDataRendered={(p) => { try { p.api.autoSizeColumns(p.api.getColumns().map(c => c.getColId())); } catch(e){} }}
                onRowDataUpdated={(p) => { try { p.api.autoSizeColumns(p.api.getColumns().map(c => c.getColId())); } catch(e){} }}
                onNewColumnsLoaded={(p) => { try { p.api.autoSizeColumns(p.api.getColumns().map(c => c.getColId())); } catch(e){} }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}