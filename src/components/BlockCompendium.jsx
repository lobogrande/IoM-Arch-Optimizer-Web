// src/components/BlockCompendium.jsx
import { useState } from 'react';
import useStore from '../store';
import { UI_BLOCK_TABLE_IMG_WIDTH } from '../ui_config';

export default function BlockCompendium() {
  const { current_max_floor, compendium_target_floor, setCompendiumTargetFloor, calculated_stats } = useStore();
  const [showModified, setShowModified] = useState(false);

  const blocks = calculated_stats?.blocks_data ||[];
  const targetFloor = compendium_target_floor || current_max_floor;

  const fmt = (val, decimals = 0) => Number(val).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">🪨 Block Compendium</h2>
      <p className="text-sm text-st-text-light mb-6">
        📚 <strong>Data Attribution:</strong> The raw baseline stats for these blocks were meticulously compiled by the <a href="https://shminer.miraheze.org/wiki/Archaeology#Block_Stats" target="_blank" rel="noreferrer" className="text-st-orange hover:underline">IoM Wiki Team</a>. <em>(Note: Toggling 'Modified Stats' applies this engine's custom scaling math to that baseline data)</em>.
      </p>

      <div className="flex flex-col md:flex-row gap-6 mb-6">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowModified(!showModified)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none ${showModified ? 'bg-st-orange' : 'bg-gray-300'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 shadow-sm ${showModified ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
          <span className="text-sm font-medium cursor-pointer select-none" onClick={() => setShowModified(!showModified)}>
            Show Modified Stats (Applies player multipliers, cards, and floor scaling)
          </span>
        </div>

        {showModified && (
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold">Calculate scaling for Floor Level:</span>
            <input 
              type="number" 
              className="st-input w-32" 
              value={targetFloor} 
              onChange={(e) => setCompendiumTargetFloor(e.target.value)} 
              min="1"
            />
          </div>
        )}
      </div>

      <div className="overflow-x-auto st-container p-0">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-st-secondary text-sm border-b border-st-border">
              <th className="p-3 font-bold">Icon</th>
              <th className="p-3 font-bold">Block</th>
              <th className="p-3 font-bold">HP</th>
              <th className="p-3 font-bold">Armor</th>
              <th className="p-3 font-bold">XP Yield</th>
              <th className="p-3 font-bold">Frag Yield</th>
              <th className="p-3 font-bold">Frag Type</th>
            </tr>
          </thead>
          <tbody>
            {blocks.map((b, idx) => (
              <tr key={b.id} className={`border-b border-st-border hover:bg-gray-50/50 ${idx % 2 === 0 ? '' : 'bg-st-secondary/20'}`}>
                <td className="p-3">
                  <img src={`/assets/cards/cores/${b.id}.png`} alt={b.id} style={{ width: UI_BLOCK_TABLE_IMG_WIDTH, imageRendering: 'pixelated' }} onError={(e) => e.target.style.display = 'none'} />
                </td>
                <td className="p-3 font-bold">{b.name}</td>
                <td className="p-3 font-mono text-sm">{showModified ? fmt(b.mod_hp) : fmt(b.base_hp)}</td>
                <td className="p-3 font-mono text-sm">
                  {showModified ? (
                    <span title={`Base Armor: ${fmt(b.mod_armor)}`} className="cursor-help border-b border-dotted border-gray-400">
                      {fmt(b.mod_eff_armor)}
                    </span>
                  ) : fmt(b.base_armor)}
                </td>
                <td className="p-3 font-mono text-sm">{showModified ? fmt(b.mod_xp, 2) : fmt(b.base_xp, 2)}</td>
                <td className="p-3 font-mono text-sm">{showModified ? fmt(b.mod_frag, 3) : fmt(b.base_frag, 3)}</td>
                <td className="p-3 text-sm">{b.frag_name}</td>
              </tr>
            ))}
            {blocks.length === 0 && (
              <tr><td colSpan="7" className="p-6 text-center text-st-text-light">Loading block data from Engine...</td></tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}
