import React, { useState } from 'react';

export default function About() {
  const[ fbType, setFbType ] = useState('Bug Report');
  const [ fbText, setFbText ] = useState('');
  const [ fbContact, setFbContact ] = useState('');
  const [ files, setFiles ] = useState([ ]);
  const [ isSubmitting, setIsSubmitting ] = useState(false);
  const[ submitStatus, setSubmitStatus ] = useState(null);

  const handleFeedback = async (e) => {
    e.preventDefault();
    if (!fbText.trim()) {
      alert("⚠️ Feedback details cannot be empty!");
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus(null);
    
    let webhookUrl = "";
    if (fbType === 'Bug Report') webhookUrl = import.meta.env.VITE_DISCORD_WEBHOOK_BUG;
    else if (fbType === 'Feature Request') webhookUrl = import.meta.env.VITE_DISCORD_WEBHOOK_FEATURE;
    else if (fbType === 'UI/UX Suggestion') webhookUrl = import.meta.env.VITE_DISCORD_WEBHOOK_UI;
    else webhookUrl = import.meta.env.VITE_DISCORD_WEBHOOK_GENERAL;

    if (webhookUrl) {
      try {
        const formData = new FormData();
        const payload = {
          embeds:[ {
            title: `🚨 New ${fbType}`,
            color: fbType.includes("Bug") ? 16753920 : 5025616,
            fields:[
              { name: "User", value: fbContact || "Anonymous", inline: true },
              { name: "Details", value: fbText, inline: false }
            ],
            footer: { text: "IoM Arch Optimizer Engine" }
          } ]
        };

        formData.append("payload_json", JSON.stringify(payload));

        // Append files dynamically
        Array.from(files).forEach((file, i) => {
          formData.append(`file[${i}]`, file);
        });

        const res = await fetch(webhookUrl, {
          method: 'POST',
          body: formData
        });

        if (res.ok) {
          setSubmitStatus({ type: 'success', msg: "✅ Feedback successfully sent! Thank you." });
          setFbText('');
          setFbContact('');
          setFiles([ ]);
        } else {
          setSubmitStatus({ type: 'error', msg: `❌ Failed to send feedback (HTTP ${res.status}).` });
        }
      } catch (err) {
        setSubmitStatus({ type: 'error', msg: `❌ Network error: ${err.message}` });
      }
    } else {
      // Fallback for missing webhook (Dev mode)
      setSubmitStatus({ type: 'info', msg: "ℹ️ Developer Note: Webhook URL is not configured in .env for this report type. Falling back to GitHub Issue." });
      const issueBody = `**Type:** ${fbType}%0A**Contact:** ${fbContact || 'Anonymous'}%0A%0A**Details:**%0A${encodeURIComponent(fbText)}%0A%0A*(Note: If you attached files, please drag and drop them here manually!)*`;
      const githubUrl = `https://github.com/lobogrande/IoM-Arch-Image_DataMiner/issues/new?body=${issueBody}`;
      window.open(githubUrl, '_blank');
    }
    
    setIsSubmitting(false);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <h2 className="text-3xl font-bold mb-6">📚 About & Feedback</h2>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        
        {/* Left Column (Wider for the diagram) */}
        <div className="md:col-span-7 space-y-6">
          
          {/* Architecture Container */}
          <div className="st-container">
            <h4 className="text-xl font-bold mb-2">⚙️ How the Engine Works</h4>
            <p className="text-st-text-light mb-6 text-sm">
              This app runs a <strong>Python WebAssembly Engine (Pyodide)</strong> to emulate the exact C# source code math of the live game. It uses <strong>Monte Carlo Simulations</strong> combined with a <strong>3-Phase Successive Halving</strong> algorithm to narrow down the perfect stat distribution.
            </p>

            {/* CSS-Grid Recreation of the Graphviz Diagram (Light Theme Friendly) */}
            <div className="bg-st-secondary border border-st-border rounded-lg p-6 font-mono text-sm text-center flex flex-col items-center gap-3">
              <div className="bg-st-bg border border-st-orange text-st-text px-6 py-2 rounded shadow-sm w-48">UI (Layer 5)</div>
              <div className="text-st-orange font-bold text-lg leading-none">↓</div>
              <div className="bg-st-bg border border-st-orange text-st-text px-6 py-2 rounded-full shadow-sm w-56">Auto-Scaling Worker Pool</div>
              <div className="text-st-orange font-bold text-lg leading-none">↓</div>
              
              <div className="border-2 border-green-500 rounded-lg p-4 border-dashed bg-green-50 w-full max-w-sm">
                <span className="text-green-700 font-bold block mb-3 text-xs uppercase tracking-wider">3-Phase Successive Halving</span>
                <div className="flex justify-between items-center gap-2">
                  <div className="bg-st-bg text-st-text p-2 rounded text-xs flex-1 border border-green-500/50 shadow-sm">Phase 1<br/><span className="text-st-text-light text-[10px]">(Coarse)</span></div>
                  <div className="text-green-600 font-bold">→</div>
                  <div className="bg-st-bg text-st-text p-2 rounded text-xs flex-1 border border-green-500/50 shadow-sm">Phase 2<br/><span className="text-st-text-light text-[10px]">(Fine)</span></div>
                  <div className="text-green-600 font-bold">→</div>
                  <div className="bg-st-bg text-st-text p-2 rounded text-xs flex-1 border border-green-500/50 shadow-sm">Phase 3<br/><span className="text-st-text-light text-[10px]">(Exact)</span></div>
                </div>
              </div>

              <div className="flex gap-4 items-center">
                <div className="text-st-orange font-bold text-lg relative top-2">↓</div>
                <div className="text-green-600 font-bold text-sm relative top-1 ml-10 hidden sm:block">↺ 500-Run Tie-Breakers</div>
              </div>
              
              <div className="bg-st-bg border border-st-orange text-st-text px-6 py-2 rounded shadow-sm w-64">Micro-Tick Combat Engine<br/><span className="text-st-text-light text-xs">(1:1 C# Math)</span></div>
              <div className="text-st-orange font-bold text-lg leading-none">↓</div>
              <div className="bg-green-600 text-white px-6 py-2 rounded shadow-sm border border-green-700 w-48 font-bold tracking-wide">Dashboard Output</div>
            </div>
          </div>

          {/* Source Code */}
          <div className="st-container">
            <h4 className="text-xl font-bold mb-2">📂 Source Code & Documentation</h4>
            <p className="text-st-text-light text-sm mb-4">
              This engine is completely open-source. You can view the raw mathematical architecture, the C# logic translations, and the complete Readme on GitHub.
            </p>
            <a 
              href="https://github.com/lobogrande/IoM-Arch-Image_DataMiner" 
              target="_blank" 
              rel="noopener noreferrer"
              className="block w-full text-center bg-st-secondary border border-st-border hover:border-st-orange text-st-text py-2 rounded font-medium transition-colors shadow-sm"
            >
              🔗 View GitHub Repository
            </a>
          </div>

          {/* Wall of Fame */}
          <div className="st-container">
            <h4 className="text-xl font-bold mb-2">🏆 Beta Testers Wall of Fame</h4>
            <p className="text-st-text-light text-sm mb-4">
              A massive thank you to the dedicated Discord community members who helped stress-test the math engine, uncover edge cases, and shape the UI into what it is today.
            </p>
            <hr />
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
          <form onSubmit={handleFeedback} className="st-container sticky top-6">
            <h4 className="text-xl font-bold mb-2">🐛 Submit Feedback</h4>
            <p className="text-st-text-light text-sm mb-6">
              Found a bug? Have a feature request? Submit an issue directly to the GitHub repository!
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-st-text mb-1">Type</label>
                <select 
                  className="w-full bg-st-secondary border border-transparent rounded-lg p-2 text-st-text focus:border-st-orange focus:outline-none transition-colors"
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
                <label className="block text-sm font-bold text-st-text mb-1">Details</label>
                <textarea 
                  className="w-full bg-st-secondary border border-transparent rounded-lg p-2 text-st-text focus:border-st-orange focus:outline-none transition-colors h-32 resize-none"
                  placeholder="Describe the issue or feature in detail..."
                  value={fbText}
                  onChange={(e) => setFbText(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-st-text mb-1">Discord/Contact (Optional)</label>
                <input 
                  type="text"
                  className="w-full bg-st-secondary border border-transparent rounded-lg p-2 text-st-text focus:border-st-orange focus:outline-none transition-colors"
                  placeholder="So I can follow up if needed"
                  value={fbContact}
                  onChange={(e) => setFbContact(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-st-text mb-1">Attachments (Optional)</label>
                <div className="text-xs text-st-text-light mb-2">Attach a screenshot or your player_state.json file to help me reproduce the issue!</div>
                <input 
                  type="file" 
                  multiple 
                  accept=".png,.jpg,.jpeg,.json"
                  className="block w-full text-sm text-st-text-light file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-st-secondary file:text-st-text hover:file:bg-gray-200 cursor-pointer transition-colors"
                  onChange={(e) => setFiles(e.target.files)}
                />
                {files.length > 0 && (
                  <ul className="mt-2 text-xs text-st-text-light list-disc pl-5">
                    {Array.from(files).map((f, i) => <li key={i}>{f.name}</li>)}
                  </ul>
                )}
              </div>

              {submitStatus && (
                <div className={`p-3 rounded text-sm ${submitStatus.type === 'error' ? 'bg-red-50 text-red-800 border border-red-200' : submitStatus.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-blue-50 text-blue-800 border border-blue-200'}`}>
                  {submitStatus.msg}
                </div>
              )}

              <div className="pt-2">
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-st-orange hover:opacity-80 text-white font-bold py-2 px-4 rounded transition-opacity shadow-sm disabled:opacity-50"
                >
                  {isSubmitting ? '📤 Sending...' : '📤 Send Feedback'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}