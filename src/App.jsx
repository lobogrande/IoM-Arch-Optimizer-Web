import { useState } from 'react';
import PlayerSetup from './components/PlayerSetup';

const TABS =[
  { id: 'welcome', label: '🏠 Welcome' },
  { id: 'setup', label: '⚙️ Player Setup' },
  { id: 'calc_stats', label: '📋 Calculated Stats' },
  { id: 'block_stats', label: '🪨 Block Compendium' },
  { id: 'simulations', label: '🧪 Simulations' },
  { id: 'about', label: '📚 About & Feedback' }
];

function App() {
  const[activeTab, setActiveTab] = useState('setup'); 

  return (
    <div className="min-h-screen bg-st-bg text-st-text p-4 md:p-8">
      
      <h1 className="text-3xl md:text-4xl font-bold mb-6">
        ⛏️ AI Arch Mining Optimizer
      </h1>

      {/* Streamlit Exact Tab Styling */}
      <div className="flex overflow-x-auto border-b border-st-border mb-6 no-scrollbar">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 font-medium whitespace-nowrap transition-colors duration-200 border-b-2 ${
                isActive 
                  ? 'border-st-orange text-st-text' 
                  : 'border-transparent text-st-text hover:text-st-orange hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="w-full">
        {activeTab === 'setup' && <PlayerSetup />}
        {activeTab !== 'setup' && (
          <div className="st-container text-center text-st-text-light py-20">
            🚧 Content for {activeTab} coming soon!
          </div>
        )}
      </div>

    </div>
  );
}

export default App;