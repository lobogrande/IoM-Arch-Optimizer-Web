// src/components/simulations/RunHistoryTable.jsx
import { useState, useMemo } from 'react';
import useStore from '../../store';
import { FRAG_ICONS } from '../../game_data';

/**
 * RunHistoryTable - Reusable component for displaying run history
 * 
 * @param {string} mode - Either 'synthesis' (with checkboxes) or 'optimizer' (with view buttons)
 * @param {function} onViewRun - Callback when a run is selected to view (optimizer mode only)
 * @param {array} viewTargets - Optional controlled filter state for visible targets
 * @param {function} onViewTargetsChange - Optional callback when filter changes
 */
export default function RunHistoryTable({ mode = 'synthesis', onViewRun, viewTargets: controlledViewTargets, onViewTargetsChange }) {
  const store = useStore();
  
  const activeStats = [ 'Str', 'Agi', 'Per', 'Int', 'Luck' ];
  if (store.asc1_unlocked) activeStats.push('Div');
  if (store.asc2_unlocked) activeStats.push('Corr');

  const history = store.run_history || [];
  const uniqueTargets = [...new Set(history.map(r => r.Target))];
  const lastTgt = store.opt_results?.run_target_metric;
  
  // Use controlled state if provided, otherwise use internal state
  const [internalViewTargets, setInternalViewTargets] = useState(null);
  const isControlled = controlledViewTargets !== undefined;
  const viewTargets = isControlled ? controlledViewTargets : internalViewTargets;
  const setViewTargets = isControlled ? onViewTargetsChange : setInternalViewTargets;
  
  const currentViewTargets = viewTargets !== null ? viewTargets : (lastTgt && uniqueTargets.includes(lastTgt) ? [lastTgt] : uniqueTargets);
  const visibleHistory = history.map((r, idx) => ({ ...r, _global_idx: idx })).filter(r => currentViewTargets.includes(r.Target));
  const checkedRuns = mode === 'synthesis' ? visibleHistory.filter(r => r.Include) : [];

  const getProfileDisplayName = (r) => {
    if (r.ProfileId) {
      const p = store.profiles?.find(x => x.id === r.ProfileId);
      const baseName = p ? p.name : (r.ProfileName || "Deleted");
      return baseName + (r.IsModified ? " *" : "");
    }
    if (r.Profile && r.Profile !== 'Guest' && r.Profile !== 'Legacy') {
      const cleanName = r.Profile.replace(' *', '');
      const isMod = r.Profile.endsWith(' *');
      const p = store.profiles?.find(x => x.name === cleanName);
      if (p) return p.name + (isMod ? " *" : "");
    }
    return r.Profile || 'Legacy';
  };

  const toggleInclude = (globalIdx) => {
    if (mode !== 'synthesis') return;
    const newHistory = [...history];
    newHistory[globalIdx].Include = !newHistory[globalIdx].Include;
    store.setSimsState('run_history', newHistory);
  };

  const deleteRun = (globalIdx) => {
    const newHistory = [...history];
    newHistory.splice(globalIdx, 1);
    store.setSimsState('run_history', newHistory);
  };

  const deleteUnchecked = () => {
    const kept = history.filter(r => !currentViewTargets.includes(r.Target) || r.Include);
    store.setSimsState('run_history', kept);
  };

  const tableStats = useMemo(() => {
    const stats = [...activeStats];
    if (visibleHistory.some(r => r.Unassigned !== undefined)) stats.push('Unassigned');
    return stats;
  }, [activeStats, visibleHistory]);

  return (
    <div>
      <h4 className="text-lg font-bold mb-1">📋 Run History Table</h4>
      
      {/* Filter UI */}
      {uniqueTargets.length > 1 && (
        <div className="mb-4 flex flex-col md:flex-row gap-4 items-start">
          <div className="w-full md:w-2/3">
            <label className="block text-sm font-bold mb-1">🔍 Filter visible runs by optimization target:</label>
            <select
              multiple
              value={currentViewTargets}
              onChange={(e) => setViewTargets(Array.from(e.target.selectedOptions, option => option.value))}
              className="w-full bg-st-bg border border-st-border rounded p-2 text-st-text focus:border-st-orange focus:outline-none"
              style={{ height: '80px' }}
            >
              {uniqueTargets.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => setViewTargets(uniqueTargets)}
                className="flex-1 px-2 py-1 text-xs bg-st-secondary text-st-text rounded border border-st-border hover:border-st-orange transition-colors font-bold"
              >
                ☑️ Select All
              </button>
              <button
                onClick={() => setViewTargets([])}
                className="flex-1 px-2 py-1 text-xs bg-st-secondary text-st-text rounded border border-st-border hover:border-st-orange transition-colors font-bold"
              >
                ❌ Clear All
              </button>
            </div>
            <div className="text-xs text-st-text-light mt-1">Hold Ctrl/Cmd to select multiple (or use buttons above)</div>
          </div>
          {mode === 'synthesis' && (
            <div className="w-full md:w-1/3 mt-0 md:mt-[28px]">
              <button 
                onClick={() => {
                  const newHistory = [...history];
                  visibleHistory.forEach(r => { newHistory[r._global_idx].Include = !r.Include; });
                  store.setSimsState('run_history', newHistory);
                }}
                className="w-full py-2 bg-st-secondary border border-st-border text-st-text font-bold rounded hover:border-st-orange transition-colors"
              >
                ☑️ Toggle All Visible
              </button>
            </div>
          )}
        </div>
      )}
      
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between mb-4">
        <div className="text-sm text-st-text-light">
          {mode === 'synthesis' ? (
            <>
              <p className="mb-1">Check the boxes for your top runs to mix them into your Meta-Build.</p>
              <p className="italic text-st-orange/80 text-xs">⚠️ The Score/Yields below are from 100-simulation sprints. Expect up to ±10% variance on high-RNG floors until you Synthesize them!</p>
            </>
          ) : (
            <p className="mb-1">Click "View" to load any historical run's full dashboard results.</p>
          )}
        </div>
        
        <div className="flex gap-2">
          {mode === 'synthesis' && (
            <>
              <button 
                onClick={() => onViewRun && onViewRun(checkedRuns[0])}
                disabled={checkedRuns.length !== 1}
                className="px-6 py-2 bg-[#2b2b2b] border border-st-orange text-st-orange font-bold rounded hover:bg-st-orange hover:text-[#2b2b2b] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title={checkedRuns.length !== 1 ? "Check exactly ONE run to view its dashboard" : ""}
              >
                📊 View Dashboard for Checked Run
              </button>
              <button
                onClick={deleteUnchecked}
                className="px-4 py-2 bg-[#2b2b2b] border border-red-900 text-red-400 font-bold rounded hover:bg-red-900 hover:text-white transition-colors"
              >
                🗑️ Delete Unchecked
              </button>
            </>
          )}
        </div>
      </div>

      <div className="relative">
        {mode === 'synthesis' && (
          <div data-tour="synth-table" className="absolute top-0 left-2 w-10 h-10 pointer-events-none"></div>
        )}

        <div className="overflow-x-auto border border-st-border rounded bg-st-bg">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-st-border bg-black/10">
                {mode === 'synthesis' && (
                  <th className="p-3 w-10 text-center">
                    <input 
                      type="checkbox" 
                      checked={visibleHistory.length > 0 && visibleHistory.every(r => r.Include)}
                      onChange={() => {
                        const newHistory = [ ...history ];
                        const targetState = !(visibleHistory.length > 0 && visibleHistory.every(r => r.Include));
                        visibleHistory.forEach(r => { newHistory[r._global_idx].Include = targetState; });
                        store.setSimsState('run_history', newHistory);
                      }}
                      className="accent-st-orange w-4 h-4 cursor-pointer"
                      title="Select/Deselect All Visible"
                    />
                  </th>
                )}
                {mode === 'optimizer' && (
                  <th className="p-3 w-20 text-center">Action</th>
                )}
                <th className="p-3">Profile</th>
                <th className="p-3">Date</th>
                <th className="p-3">Target</th>
                <th className="p-3">Score / Yield</th>
                <th className="p-3">Avg Floor</th>
                <th className="p-3">Max Floor</th>
                {tableStats.map(s => <th key={s} className="p-3">{s === 'Unassigned' ? 'Unspent' : s}</th>)}
                <th className="p-3 w-10 text-center"></th>
              </tr>
            </thead>
            <tbody>
              {visibleHistory.length === 0 ? (
                <tr><td colSpan={mode === 'synthesis' ? tableStats.length + 9 : tableStats.length + 9} className="p-4 text-center text-st-text-light">No runs match current filter.</td></tr>
              ) : visibleHistory.map((r) => {
                const isFloor = r.Target === 'highest_floor';
                const isDinoQuest = r.Target === 'dino_quest_floors_per_sec';
                const score = isFloor 
                  ? r['Metric Score']  // Floor number, no scaling
                  : isDinoQuest 
                    ? (r['Metric Score'] * 1000).toFixed(2)  // Per second to per 1k seconds
                    : ((r['Metric Score'] / 60.0) * 1000.0).toFixed(1);  // Per minute to per 1k seconds
                const runTime = r.Timestamp || r._restore_state?.opt_results?.run_id || r._restore_state?.run_id;
                const timeStr = runTime ? new Date(runTime).toLocaleString(undefined, { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '-';
                
                let fragIcon = null;
                if (r.Target.includes('frag_')) {
                  const match = r.Target.match(/frag_(\d)/);
                  if (match) {
                    const fragTier = parseInt(match[1]);
                    fragIcon = <img src={FRAG_ICONS[fragTier]} alt="" className="w-4 h-4 inline-block mr-1" style={{ imageRendering: 'pixelated' }} onError={(e) => e.target.style.display = 'none'} />;
                  }
                }
                
                return (
                  <tr key={r._global_idx} className="border-b border-st-border/50 hover:bg-black/5 transition-colors group">
                    {mode === 'synthesis' && (
                      <td className="p-3 text-center">
                        <input 
                          type="checkbox" 
                          checked={r.Include || false} 
                          onChange={() => toggleInclude(r._global_idx)}
                          className="accent-st-orange w-4 h-4 cursor-pointer"
                        />
                      </td>
                    )}
                    {mode === 'optimizer' && (
                      <td className="p-3 text-center">
                        <button
                          onClick={() => onViewRun && onViewRun(r)}
                          className="px-2 py-1 bg-st-orange text-[#2b2b2b] font-bold text-xs rounded hover:bg-[#ffb045] transition-colors"
                        >
                          View
                        </button>
                      </td>
                    )}
                    <td className="p-3 font-bold text-xs truncate max-w-[100px]" title={getProfileDisplayName(r)}>{getProfileDisplayName(r)}</td>
                    <td className="p-3 text-xs text-st-text-light whitespace-nowrap">{timeStr}</td>
                    <td className="p-3 font-mono text-xs">{r.Target.replace('_per_min', '')}</td>
                    <td className="p-3 font-bold text-st-orange">
                      {fragIcon}
                      {score}
                    </td>
                    <td className="p-3">{r['Avg Floor'].toFixed(1)}</td>
                    <td className="p-3">{r['Max Floor']}</td>
                    {tableStats.map(s => <td key={s} className={`p-3 ${s === 'Unassigned' ? 'text-st-orange font-bold' : 'text-st-text-light'}`}>{r[s] !== undefined ? r[s] : '-'}</td>)}
                    <td className="p-3 text-center">
                      <button
                        onClick={() => deleteRun(r._global_idx)}
                        className="text-red-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Delete this run"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
