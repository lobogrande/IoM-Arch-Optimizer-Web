import React, { useState } from 'react';

export default function About() {
  const[fbType, setFbType] = useState('Bug Report');
  const[fbText, setFbText] = useState('');
  const[fbContact, setFbContact] = useState('');

  const handleFeedback = (e) => {
    e.preventDefault();
    if (!fbText.trim()) {
      alert("⚠️ Feedback details cannot be empty!");
      return;
    }
    // Pure Client-Side fallback for feedback logging
    const issueBody = `**Type:** ${fbType}%0A**Contact:** ${fbContact || 'Anonymous'}%0A%0A**Details:**%0A${encodeURIComponent(fbText)}`;
    const githubUrl = `https://github.com/lobogrande/IoM-Arch-Image_DataMiner/issues/new?body=${issueBody}`;
    window.open(githubUrl, '_blank');
    setFbText('');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <h2 className="text-3xl font-bold mb-6">📚 About & Feedback</h2>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Left Column (Wider for the diagram) */}
        <div className="md:col-span-7 space-y-6">
          
          {/* Architecture Container */}
          <div className="border border-st-border bg-gray-800/50 p-6 rounded-lg">
            <h4 className="text-xl font-bold mb-2 text-white">⚙️ How the Engine Works</h4>
            <p className="text-gray-300 mb-6 text-sm">
              This app runs a <strong>Python WebAssembly Engine (Pyodide)</strong> to emulate the exact C# source code math of the live game. It uses <strong>Monte Carlo Simulations</strong> combined with a <strong>3-Phase Successive Halving</strong> algorithm to narrow down the perfect stat distribution.
            </p>

            {/* CSS-Grid Recreation of the Graphviz Diagram */}
            <div className="bg-[#2b2b2b] border border-st-orange/50 rounded-lg p-6 font-mono text-sm text-center flex flex-col items-center gap-3">
              <div className="bg-gray-700 border border-st-orange text-white px-6 py-2 rounded shadow-lg w-48">UI (Layer 5)</div>
              <div className="text-st-orange font-bold text-lg">↓</div>
              <div className="bg-gray-700 border border-st-orange text-white px-6 py-2 rounded-full shadow-lg w-56">Auto-Scaling Worker Pool</div>
              <div className="text-st-orange font-bold text-lg">↓</div>
              <div className="border-2 border-green-500 rounded-lg p-4 border-dashed bg-green-900/10 w-full max-w-sm">
                <span className="text-green-400 font-bold block mb-3 text-xs uppercase tracking-wider">3-Phase Successive Halving</span>
                <div className="flex justify-between items-center gap-2">
                  <div className="bg-gray-700 text-white p-2 rounded text-xs flex-1 border border-green-500/50">Phase 1<br/><span className="text-gray-400 text-[10px]">(Coarse)</span></div>
                  <div className="text-green-500">→</div>
                  <div className="bg-gray-700 text-white p-2 rounded text-xs flex-1 border border-green-500/50">Phase 2<br/><span className="text-gray-400 text-[10px]">(Fine)</span></div>
                  <div className="text-green-500">→</div>
                  <div className="bg-gray-700 text-white p-2 rounded text-xs flex-1 border border-green-500/50">Phase 3<br/><span className="text-gray-400 text-[10px]">(Exact)</span></div>
                </div>
              </div>
              <div className="flex gap-4 items-center">
                <div className="text-st-orange font-bold text-lg relative top-2">↓</div>
                <div className="text-green-500 font-bold text-sm relative top-1 ml-10 hidden sm:block">↺ 500-Run Tie-Breakers</div>
              </div>
              <div className="bg-gray-700 border border-st-orange text-white px-6 py-2 rounded shadow-lg w-64">Micro-Tick Combat Engine<br/><span className="text-gray-400 text-xs">(1:1 C# Math)</span></div>
              <div className="text-st-orange font-bold text-lg">↓</div>
              <div className="bg-green-600 text-white px-6 py-2 rounded shadow-lg border border-green-400 w-48">Dashboard Output</div>
            </div>
          </div>

          {/* Source Code */}
          <div className="border border-st-border bg-gray-800/50 p-6 rounded-lg">
            <h4 className="text-xl font-bold mb-2 text-white">📂 Source Code & Documentation</h4>
            <p className="text-gray-300 text-sm mb-4">
              This engine is completely open-source. You can view the raw mathematical architecture, the C# logic translations, and the complete Readme on GitHub.
            </p>
            <a 
              href="https://github.com/lobogrande/IoM-Arch-Image_DataMiner" 
              target="_blank" 
              rel="noopener noreferrer"
              className="block w-full text-center bg-gray-700 hover:bg-gray-600 border border-gray-500 text-white py-2 rounded font-medium transition"
            >
              🔗 View GitHub Repository
            </a>
          </div>

          {/* Wall of Fame */}
          <div className="border border-st-border bg-gray-800/50 p-6 rounded-lg">
            <h4 className="text-xl font-bold mb-2 text-white">🏆 Beta Testers Wall of Fame</h4>
            <p className="text-gray-300 text-sm mb-4">
              A massive thank you to the dedicated Discord community members who helped stress-test the math engine, uncover edge cases, and shape the UI into what it is today.
            </p>
            <hr className="border-st-border mb-4" />
            <div className="grid grid-cols-2 gap-2 text-st-orange font-medium">
              <div>⭐ Sans</div>
              <div>⭐ Doctorcool</div>
              <div>⭐ Eugloopy☆Dilemma</div>
              <div>⭐ Saronitian</div>
              <div>⭐ Dustin</div>
              <div>⭐ Dave</div>
              <div>⭐ Koksuone</div>
            </div>
          </div>
        </div>

        {/* Right Column (Feedback Form) */}
        <div className="md:col-span-5">
          <form onSubmit={handleFeedback} className="border border-st-border bg-gray-800/50 p-6 rounded-lg sticky top-6">
            <h4 className="text-xl font-bold mb-2 text-white">🐛 Submit Feedback</h4>
            <p className="text-gray-300 text-sm mb-6">
              Found a bug? Have a feature request? Submit an issue directly to the GitHub repository!
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Type</label>
                <select 
                  className="w-full bg-gray-900 border border-st-border rounded p-2 text-white focus:border-st-orange focus:outline-none"
                  value={fbType}
                  onChange={(e) => setFbType(e.target.value)}
                >
                  <option>Bug Report</option>
                  <option>Feature Request</option>
                  <option>UI/UX Suggestion</option>
                  <option>General Feedback</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Details</label>
                <textarea 
                  className="w-full bg-gray-900 border border-st-border rounded p-2 text-white focus:border-st-orange focus:outline-none h-32 resize-none"
                  placeholder="Describe the issue or feature in detail..."
                  value={fbText}
                  onChange={(e) => setFbText(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Discord/Contact (Optional)</label>
                <input 
                  type="text"
                  className="w-full bg-gray-900 border border-st-border rounded p-2 text-white focus:border-st-orange focus:outline-none"
                  placeholder="So I can follow up if needed"
                  value={fbContact}
                  onChange={(e) => setFbContact(e.target.value)}
                />
              </div>

              <div className="pt-2">
                <button 
                  type="submit"
                  className="w-full bg-st-orange hover:bg-orange-500 text-gray-900 font-bold py-2 px-4 rounded transition"
                >
                  📤 Generate GitHub Issue
                </button>
                <p className="text-xs text-gray-500 text-center mt-3">
                  (Webhooks are disabled in the browser for security. This will draft an issue on GitHub for you.)
                </p>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
