// src/components/BlockCompendium.jsx
import { useState, useMemo } from 'react';
import useStore from '../store';
import { UI_BLOCK_TABLE_IMG_WIDTH } from '../ui_config';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';

ModuleRegistry.registerModules([ AllCommunityModule ]);

export default function BlockCompendium() {
  const { current_max_floor, compendium_target_floor, setCompendiumTargetFloor, calculated_stats, theme } = useStore();
  const [showModified, setShowModified] = useState(false);

  const blocks = calculated_stats?.blocks_data ||[];
  const targetFloor = compendium_target_floor || current_max_floor;

  const fmt = (val, decimals = 0) => Number(val).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  const defaultColDef = useMemo(() => ({ sortable: true, filter: true, resizable: true }), [ ]);

  const colDefs = useMemo(() =>[
    {
      field: "id",
      headerName: "Icon",
      pinned: "left",
      minWidth: 80,
      maxWidth: 80,
      sortable: false,
      filter: false,
      cellRenderer: (p) => (
        <div className="flex justify-center items-center h-full">
          <img src={`/assets/cards/cores/${p.value}.png`} alt={p.value} style={{ width: UI_BLOCK_TABLE_IMG_WIDTH, imageRendering: 'pixelated' }} onError={(e) => e.target.style.display = 'none'} />
        </div>
      )
    },
    { field: "name", headerName: "Block", minWidth: 120, pinned: "left" },
    { 
      headerName: "HP", 
      valueGetter: p => showModified ? p.data.mod_hp : p.data.base_hp,
      valueFormatter: p => fmt(p.value, 0)
    },
    { 
      headerName: "Armor", 
      valueGetter: p => showModified ? p.data.mod_eff_armor : p.data.base_armor,
      valueFormatter: p => fmt(p.value, 0),
      cellRenderer: p => {
        if (showModified && p.data.mod_armor !== p.data.mod_eff_armor) {
          return (
            <span title={`Base Armor: ${fmt(p.data.mod_armor)}`} className="cursor-help border-b border-dotted border-gray-400">
              {p.valueFormatted}
            </span>
          );
        }
        return p.valueFormatted;
      }
    },
    { 
      headerName: "XP Yield", 
      valueGetter: p => showModified ? p.data.mod_xp : p.data.base_xp,
      valueFormatter: p => fmt(p.value, 2)
    },
    { 
      headerName: "Frag Yield", 
      valueGetter: p => showModified ? p.data.mod_frag : p.data.base_frag,
      valueFormatter: p => fmt(p.value, 3)
    },
    { field: "frag_name", headerName: "Frag Type", flex: 1, minWidth: 120 }
  ],[ showModified ]);

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">🪨 Block Compendium</h2>
      <p className="text-sm text-st-text-light mb-6">
        📚 <strong>Data Attribution:</strong> The raw baseline stats for these blocks were compiled by the IoM Wiki Team <a href="https://shminer.miraheze.org/wiki/Archaeology#Block_Stats" target="_blank" rel="noreferrer" className="text-st-orange hover:underline">here</a>. <em>(Note: Toggling 'Modified Stats' applies this engine's custom scaling math to that baseline data)</em>.
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

      <div 
        className={`border border-st-border rounded bg-st-bg h-[700px] w-full outline-none ${theme === 'dark' ? 'ag-theme-quartz-dark' : 'ag-theme-quartz'}`}
        tabIndex={-1}
        onMouseEnter={(e) => {
          if (!e.currentTarget.contains(document.activeElement)) {
            e.currentTarget.focus();
          }
        }}
      >
        <style>{`
          /* Force Headers to Center */
          .ag-theme-quartz .ag-header-cell-label,
          .ag-theme-quartz-dark .ag-header-cell-label {
            justify-content: center !important;
            color: ${theme === 'dark' ? '#FAFAFA' : '#31333F'} !important;
          }
          /* Force Cells to Center */
          .ag-theme-quartz .ag-cell,
          .ag-theme-quartz-dark .ag-cell {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            text-align: center !important;
          }
        `}</style>
        {!blocks || blocks.length === 0 ? (
          <div className="flex items-center justify-center h-full text-st-text-light">Loading block data from Engine...</div>
        ) : (
          <AgGridReact
            theme="legacy"
            rowData={blocks}
            defaultColDef={defaultColDef}
            columnDefs={colDefs}
          />
        )}
      </div>

    </div>
  );
}
