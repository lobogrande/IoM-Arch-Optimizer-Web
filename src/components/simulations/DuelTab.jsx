// src/components/simulations/DuelTab.jsx
import { useState } from 'react';
import useStore from '../../store';
import { EngineWorkerPool } from '../../utils/optimizer';

const OPT_GOALS =[
  "Max Floor Push", 
  "Max EXP Yield", 
  "Fragment Farming", 
  "Block Card Farming"
];

const FRAG_NAMES = {
  0: "Dirt", 1: "Common", 2: "Rare", 3: "Epic", 4: "Legendary", 5: "Mythic", 6: "Divine"
};

export default function DuelTab() {
  const store = useStore();

  const[duelOptGoal, setDuelOptGoal] = useState("Max Floor Push");
  const[duelTargetFrag, setDuelTargetFrag] = useState(6);
  const [duelTargetBlock, setDuelTargetBlock] = useState("div3");

  const duelStatsA = store.duelStatsA || { Str: 0, Agi: 0, Per: 0, Int: 0, Luck: 0, Div: 0, Corr: 0 };
  const duelStatsB = store.duelStatsB || { Str: 0, Agi: 0, Per: 0, Int: 0, Luck: 0, Div: 0, Corr: 0 };
  const setDuelStatsA = (val) => store.setSimsState('duelStatsA', val);
  const setDuelStatsB = (val) => store.setSimsState('duelStatsB', val);

  const [isDueling, setIsDueling] = useState(false);
  const [duelProgressMsg, setDuelProgressMsg] = useState("");
  const[duelProgressPct, setDuelProgressPct] = useState(0);
  const [duelResults, setDuelResults] = useState(null);

  const activeStats = [ 'Str', 'Agi', 'Per', 'Int', 'Luck' ];
  if (store.asc1_unlocked) activeStats.push('Div');
  if (store.asc2_unlocked) activeStats.push('Corr');

  const MAX_STAT_CAPS = {
    Str: 55, Agi: 55, Per: 30, Int: 30, Luck: 30,
    Div: store.asc1_unlocked ? 15 : 0, 
    Corr: store.asc2_unlocked ? 15 : 0,
    Unassigned: 9999
  };

  const handleRunDuel = async () => {
    setIsDueling(true);
    setDuelProgressMsg("Booting Telemetry Engine...");
    setDuelProgressPct(0);
    try {
      const pool = new EngineWorkerPool();
      await pool.init();
      
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
      
      const runsPerBuild = 500;
      const totalRuns = runsPerBuild * 2;
      
      const runBuild = async (statsToTest, buildName, buildIndex) => {
        const sumData = {};
        let count = 0;
        const floors = [ ];
        const promises = [ ];
        for (let i = 0; i < runsPerBuild; i++) {
          const p = pool.runTask(statsToTest).then(res => {
            if (!res.aborted) {
              for (const [ k, v ] of Object.entries(res)) {
                if (typeof v === 'number') sumData[k] = (sumData[k] || 0) + v;
              }
              floors.push(res.highest_floor);
              count++;
              
              const globalCount = (buildIndex * runsPerBuild) + count;
              if (count % 25 === 0 || count === runsPerBuild) {
                setDuelProgressMsg(`⚔️ ${buildName}: Simulating run ${count}/${runsPerBuild}`);
                setDuelProgressPct((globalCount / totalRuns) * 100);
              }
            }
          });
          promises.push(p);
        }
        await Promise.all(promises);
        const avgData = {};
        for (const [ k, v ] of Object.entries(sumData)) {
          avgData[k] = v / count;
        }
        
        if (floors.length > 0) {
          const maxFloor = Math.max(...floors);
          const maxCount = floors.filter(f => f === maxFloor).length;
          avgData['abs_max_floor'] = maxFloor;
          avgData['abs_max_chance'] = maxCount / floors.length;
        }
        return avgData;
      };

      const resA = await runBuild(duelStatsA, "Build A", 0);
      const resB = await runBuild(duelStatsB, "Build B", 1);
      
      setDuelResults({ A: resA, B: resB });
      pool.terminate();
    } catch (err) {
      console.error(err);
      alert("Duel failed: " + err.message);
    }
    setIsDueling(false);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <h2 className="text-2xl font-bold">⚔️ Deep Telemetry (Build Duel)</h2>
      <p className="text-st-text-light">Pit two builds against each other in a controlled environment to output their exact mathematical differences over <strong>500 simulations</strong>.</p>

      <div className="st-container">
        <h4 className="font-bold mb-4">🎯 Optimization Target</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold mb-1">Telemetry Focus</label>
            <select 
              value={duelOptGoal} 
              onChange={(e) => setDuelOptGoal(e.target.value)}
              className="w-full bg-st-bg border border-st-border rounded p-2 text-st-text focus:border-st-orange focus:outline-none"
            >
              {OPT_GOALS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          
          <div>
            {duelOptGoal === "Fragment Farming" && (
              <>
                <label className="block text-sm font-bold mb-1">Target Fragment</label>
                <select 
                  value={duelTargetFrag} 
                  onChange={(e) => setDuelTargetFrag(parseInt(e.target.value))}
                  className="w-full bg-st-bg border border-st-border rounded p-2 text-st-text focus:border-st-orange focus:outline-none"
                >
                  {Object.entries(FRAG_NAMES)
                    .filter(([val]) => {
                      const fragTier = parseInt(val);
                      if (fragTier === 0) return false;
                      if (fragTier === 6 && !store.asc1_unlocked) return false;
                      return true;
                    })
                    .map(([val, name]) => (
                      <option key={val} value={val}>{name}</option>
                  ))}
                </select>
              </>
            )}
            {duelOptGoal === "Block Card Farming" && (
              <>
                <label className="block text-sm font-bold mb-1">Target Block ID</label>
                <input 
                  type="text" 
                  value={duelTargetBlock} 
                  onChange={(e) => setDuelTargetBlock(e.target.value.toLowerCase())}
                  onBlur={(e) => { if (e.target.value.trim() === '') setDuelTargetBlock('myth3'); }}
                  placeholder="e.g., com1, myth3"
                  className="w-full bg-st-bg border border-st-border rounded p-2 text-st-text focus:border-st-orange focus:outline-none"
                />
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="st-container border-t-4 border-t-blue-500">
          <h4 className="font-bold mb-4 text-blue-400">Build A</h4>
          <div className="grid grid-cols-4 gap-2">
            {activeStats.map(stat => (
              <div key={stat}>
                <label className="block text-xs mb-1 font-bold">
                  {stat} <span className="font-normal text-[10px] text-st-text-light">(Max: {MAX_STAT_CAPS[stat]})</span>
                </label>
                <input 
                  type="number"
                  min="0"
                  max={MAX_STAT_CAPS[stat]}
                  value={duelStatsA[stat] !== undefined ? duelStatsA[stat] : 0} 
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setDuelStatsA({...duelStatsA, [stat]: e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0)})}
                  onBlur={(e) => {
                    let parsed = parseInt(e.target.value) || 0;
                    if (parsed > MAX_STAT_CAPS[stat]) parsed = MAX_STAT_CAPS[stat];
                    if (parsed < 0) parsed = 0;
                    setDuelStatsA({...duelStatsA,[stat]: parsed});
                  }}
                  className="st-input p-2 text-sm"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="st-container border-t-4 border-t-st-orange">
          <h4 className="font-bold mb-4 text-st-orange">Build B</h4>
          <div className="grid grid-cols-4 gap-2">
            {activeStats.map(stat => (
              <div key={stat}>
                <label className="block text-xs mb-1 font-bold">
                  {stat} <span className="font-normal text-[10px] text-st-text-light">(Max: {MAX_STAT_CAPS[stat]})</span>
                </label>
                <input 
                  type="number"
                  min="0"
                  max={MAX_STAT_CAPS[stat]}
                  value={duelStatsB[stat] !== undefined ? duelStatsB[stat] : 0} 
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setDuelStatsB({...duelStatsB, [stat]: e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0)})}
                  onBlur={(e) => {
                    let parsed = parseInt(e.target.value) || 0;
                    if (parsed > MAX_STAT_CAPS[stat]) parsed = MAX_STAT_CAPS[stat];
                    if (parsed < 0) parsed = 0;
                    setDuelStatsB({...duelStatsB, [stat]: parsed});
                  }}
                  className="st-input p-2 text-sm"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {!isDueling ? (
        <button 
          onClick={handleRunDuel}
          className="w-full py-3 bg-st-secondary border border-st-border text-st-text font-bold rounded-lg shadow hover:border-st-orange hover:text-st-orange transition-colors"
        >
          🏁 Run Telemetry Duel (500 Simulations)
        </button>
      ) : (
        <div className="w-full p-4 border border-st-border rounded bg-st-bg">
          <div className="flex justify-between text-sm font-bold mb-2 text-st-orange">
            <span>{duelProgressMsg}</span>
            <span>{Math.floor(duelProgressPct)}%</span>
          </div>
          <div className="w-full bg-[#1e1e1e] rounded-full h-4 overflow-hidden border border-st-border">
            <div 
              className="bg-st-orange h-4 transition-all duration-300"
              style={{ width: `${duelProgressPct}%` }}
            ></div>
          </div>
        </div>
      )}

      {duelResults && (
        <div className="st-container mt-6 animate-fade-in">
          <h4 className="text-xl font-bold mb-4">📊 Telemetry Results (Per Run Average)</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-st-border">
                  <th className="p-3">Metric</th>
                  <th className="p-3 font-bold text-blue-400">Build A</th>
                  <th className="p-3 font-bold text-st-orange">Build B</th>
                  <th className="p-3 text-center">Winner</th>
                  <th className="p-3 text-right">% Diff</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const rows = [ ];
                  rows.push({ k: 'highest_floor', l: 'Avg Max Floor', higherIsBetter: true });
                  
                  if (duelOptGoal === "Max Floor Push") {
                    rows.push({ k: 'abs_max_floor', l: 'Absolute Max Floor Reached', higherIsBetter: true, isRaw: true });
                    rows.push({ k: 'abs_max_chance', l: 'Probability of Max Floor', higherIsBetter: true, isPercent: true });
                  } else if (duelOptGoal === "Max EXP Yield") {
                    rows.push({ k: 'xp_per_min', l: 'EXP Yield per 1k Arch Secs', higherIsBetter: true, isRate: true });
                  } else if (duelOptGoal === "Fragment Farming") {
                    const fragName = FRAG_NAMES[duelTargetFrag] || `Frag ${duelTargetFrag}`;
                    rows.push({ k: `frag_${duelTargetFrag}_per_min`, l: `Yield (${fragName}) per 1k Arch Secs`, higherIsBetter: true, isRate: true });
                    
                    const prefixMap = { 1: 'com', 2: 'rare', 3: 'epic', 4: 'leg', 5: 'myth', 6: 'div' };
                    const pfx = prefixMap[duelTargetFrag];
                    if (pfx) { [ 1, 2, 3, 4 ].forEach(tier => {
                        rows.push({ k: `raw_block_${pfx}${tier}`, l: `Tier ${tier} Kills (${pfx}${tier})`, higherIsBetter: true, isRaw: true });
                        rows.push({ k: `raw_frag_${pfx}${tier}`, l: `${fragName} fragments from ${pfx}${tier} blocks`, higherIsBetter: true, isRaw: true });
                      });
                    }
                  } else if (duelOptGoal === "Block Card Farming") {
                    rows.push({ k: `block_${duelTargetBlock}_per_min`, l: `Kills (${duelTargetBlock}) per 1k Arch Secs`, higherIsBetter: true, isRate: true });
                    rows.push({ k: `raw_block_${duelTargetBlock}`, l: `Avg Kills (${duelTargetBlock}) per Run`, higherIsBetter: true, isRaw: true });
                  }

                  rows.push(
                    { k: 'gross_swings', l: 'Gross Swings (Stamina Spent)', higherIsBetter: true },
                    { k: 'in_game_time', l: 'In-Game Seconds Passed', higherIsBetter: true },
                    { k: 'stamina_refunded_flurry', l: 'Stamina Refunded (Flurry)', higherIsBetter: true },
                    { k: 'stamina_refunded_mods', l: 'Stamina Refunded (Mods)', higherIsBetter: true },
                    { k: 'flurry_casts', l: 'Flurry Casts', higherIsBetter: true },
                    { k: 'enrage_casts', l: 'Enrage Casts', higherIsBetter: true },
                    { k: 'quake_casts', l: 'Quake Casts', higherIsBetter: true },
                    { k: 'melee_damage', l: 'Total Melee Damage', higherIsBetter: true },
                    { k: 'quake_damage', l: 'Total Quake Damage', higherIsBetter: true },
                    { k: 'overkill_damage', l: 'Total Overkill Damage (Wasted)', higherIsBetter: false }
                  );

                  return rows.map((row) => {
                    const rawA = duelResults.A[row.k] || 0;
                    const rawB = duelResults.B[row.k] || 0;
                    
                    const valA = row.isRate ? (rawA / 60.0) * 1000.0 : rawA;
                    const valB = row.isRate ? (rawB / 60.0) * 1000.0 : rawB;

                    const isWinnerA = row.higherIsBetter !== null ? (row.higherIsBetter ? valA > valB : valA < valB) : null;
                    const isWinnerB = row.higherIsBetter !== null ? (row.higherIsBetter ? valB > valA : valB < valA) : null;

                    let formattedA = valA.toLocaleString(undefined, { maximumFractionDigits: 1 });
                    let formattedB = valB.toLocaleString(undefined, { maximumFractionDigits: 1 });
                    
                    if (row.isPercent) {
                      formattedA = (valA * 100).toFixed(1) + '%';
                      formattedB = (valB * 100).toFixed(1) + '%';
                    }

                    let diffStr = '-';
                    if (isWinnerA && valB > 0) {
                      const pct = (((valA - valB) / valB) * 100);
                      diffStr = `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
                    } else if (isWinnerB && valA > 0) {
                      const pct = (((valB - valA) / valA) * 100);
                      diffStr = `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
                    } else if (isWinnerA && valB === 0) {
                      diffStr = 'MAX';
                    } else if (isWinnerB && valA === 0) {
                      diffStr = 'MAX';
                    }

                    return (
                      <tr key={row.k} className="border-b border-st-border/50 hover:bg-black/5">
                        <td className="p-3 font-bold text-sm">{row.l}</td>
                        <td className={`p-3 font-mono ${isWinnerA ? 'text-green-400 font-bold' : 'text-st-text-light'}`}>
                          {formattedA}
                        </td>
                        <td className={`p-3 font-mono ${isWinnerB ? 'text-green-400 font-bold' : 'text-st-text-light'}`}>
                          {formattedB}
                        </td>
                        <td className="p-3 font-bold text-center">
                          {isWinnerA ? 'A' : isWinnerB ? 'B' : '-'}
                        </td>
                        <td className={`p-3 font-mono text-right font-bold ${diffStr !== '-' ? 'text-st-orange' : 'text-st-text-light'}`}>
                          {diffStr}
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}