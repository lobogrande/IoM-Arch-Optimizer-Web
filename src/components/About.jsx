import React, { useState } from 'react';
import { APP_VERSION } from '../ui_config';

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
      
      <div className="flex items-baseline gap-4 mb-6">
        <h2 className="text-3xl font-bold">📚 About & Feedback</h2>
        <span className="bg-st-secondary border border-st-border text-st-text-light text-sm font-bold px-3 py-1 rounded-full shadow-sm">
          Version {APP_VERSION}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        
        {/* Left Column (Wider for the diagram) */}
        <div className="md:col-span-7 space-y-6">
          
          {/* Architecture Container */}
          <div className="st-container">
            <h4 className="text-xl font-bold mb-2">⚙️ Architecture & Telemetry</h4>
            <p className="text-st-text-light mb-4 text-sm">
              This app runs a <strong>Python WebAssembly Engine (Pyodide)</strong> to emulate the exact GameMaker (GML) source code math of the live game. It uses <strong>Monte Carlo Simulations</strong> combined with a <strong>3-Phase Successive Halving</strong> algorithm to narrow down the perfect stat distribution.
            </p>
            <p className="text-st-text-light mb-6 text-sm">
              Recently upgraded to a <strong>True-Time Architecture</strong>, the engine now measures combat loops in absolute real-world seconds (TTK) rather than just stamina usage. It also features built-in <strong>Build Duel Telemetry</strong>, allowing you to pit two stat distributions head-to-head in a zero-variance vacuum to see mathematically why one beats the other.
            </p>

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
              
              <div className="bg-st-bg border border-st-orange text-st-text px-6 py-2 rounded shadow-sm w-64">True-Time Micro-Tick Engine<br/><span className="text-st-text-light text-xs">(1:1 GML Math)</span></div>
              <div className="text-st-orange font-bold text-lg leading-none">↓</div>
              <div className="bg-green-600 text-white px-6 py-2 rounded shadow-sm border border-green-700 w-48 font-bold tracking-wide">Dashboard Output</div>
            </div>
          </div>

          {/* FAQ & Mechanics */}
          <div className="st-container space-y-4">
            <h4 className="text-xl font-bold mb-2">🎓 Mechanics Deep Dive & FAQ</h4>
            
            <details className="group border border-st-border rounded p-3 cursor-pointer hover:border-st-orange transition-colors">
              <summary className="font-bold outline-none list-none flex justify-between">
                <span>What is a "Stat Plateau"?</span>
                <span className="text-st-orange transition-transform group-open:rotate-180">▼</span>
              </summary>
              <p className="mt-3 text-sm text-st-text-light border-t border-st-border pt-3">
                Because blocks in the game only take "whole hits," having enough damage to bring a block to 1 HP requires the exact same number of hits as doing no extra damage at all. The optimizer actively looks for these <strong>Stat Plateaus</strong> and stops recommending stats the instant you hit a "hits-to-kill" breakpoint, saving your stat points for other upgrades.
              </p>
            </details>

            <details className="group border border-st-border rounded p-3 cursor-pointer hover:border-st-orange transition-colors">
              <summary className="font-bold outline-none list-none flex justify-between">
                <span>Why does the game yield less than the simulator? (Engine Slippage)</span>
                <span className="text-st-orange transition-transform group-open:rotate-180">▼</span>
              </summary>
              <p className="mt-3 text-sm text-st-text-light border-t border-st-border pt-3">
                The Python engine is a <em>0.000-delay perfect mathematical simulation</em>. In the live game, particularly in "Rabbit Mode," the GameMaker engine is forced to fast-forward. This causes dropped frames and slight delays in the physics of step-event, block attack, etc. This <strong>Game Engine Slippage</strong> may account for a consistent efficiency loss in the live game compared to the raw mathematical maximum.
              </p>
            </details>
            
            <details className="group border border-st-border rounded p-3 cursor-pointer hover:border-st-orange transition-colors">
              <summary className="font-bold outline-none list-none flex justify-between">
                <span>How do I use Build Duels & Telemetry?</span>
                <span className="text-st-orange transition-transform group-open:rotate-180">▼</span>
              </summary>
              <p className="mt-3 text-sm text-st-text-light border-t border-st-border pt-3">
                Head to the <strong>Simulations ➔ Build Duel</strong> tab. You can load two completely different Base Stat distributions and run them through a 100,000 second Arch Burn side-by-side. The Telemetry output will show you exactly who won and exactly how many crits, mods, and enrage casts it took to get there.
              </p>
            </details>
          </div>

          {/* --- TIP JAR --- */}
          <div className="st-container border-l-4 border-l-[#FF5E5B]">
            <h4 className="text-xl font-bold mb-2 flex items-center gap-2">
              <span className="text-2xl">🥤</span> Support the Developer
            </h4>
            <p className="text-st-text-light text-sm mb-4">
              This optimizer is a passion project built for the community—it's completely free, open-source, and has zero ads. While server hosting is free, the development journey did rack up some real-world costs for the AI tools used to build the engine. If this app has helped you break through a progression wall, any support to help offset those initial expenses is incredibly appreciated!
            </p>
            <a 
              href="https://ko-fi.com/lobogrande" 
              target="_blank" 
              rel="noopener noreferrer"
              className="block w-full text-center bg-[#FF5E5B] text-white py-2 rounded font-bold hover:bg-[#E05350] transition-colors shadow-sm"
            >
              Buy me a Smoothie on Ko-fi
            </a>
          </div>

          {/* Source Code & Releases */}
          <div className="st-container">
            <h4 className="text-xl font-bold mb-2">📂 Source Code & Patch Notes</h4>
            <p className="text-st-text-light text-sm mb-4">
              This engine is completely open-source. You can view the raw mathematical architecture, read the full update history (Patch Notes), and view the complete Readme on GitHub.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <a 
                href="https://github.com/lobogrande/IoM-Arch-Optimizer-Web" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex-1 text-center bg-st-secondary border border-st-border hover:border-st-orange text-st-text py-2 rounded font-medium transition-colors shadow-sm"
              >
                🔗 GitHub Repository
              </a>
              <a 
                href="https://github.com/lobogrande/IoM-Arch-Optimizer-Web/releases" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex-1 text-center bg-st-secondary border border-st-border hover:border-blue-500 text-st-text py-2 rounded font-medium transition-colors shadow-sm"
              >
                📜 Read Patch Notes
              </a>
            </div>
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
        <div className="md:col-span-5 space-y-6 sticky top-6 h-fit">
          
          {/* Discord Community */}
          <div className="st-container border-st-orange/30">
            <h4 className="text-xl font-bold mb-2 text-st-orange">💬 Join the Community</h4>
            <p className="text-st-text-light text-sm mb-4">
              Want to discuss strategies, read the latest patch notes, or help shape the next update? Join the official Discord server!
            </p>
            <a 
              href="https://discord.gg/kNSt2CvMy5" 
              target="_blank" 
              rel="noopener noreferrer"
              className="block w-full text-center bg-[#5865F2] hover:opacity-90 text-white py-2 rounded font-bold transition-opacity shadow-sm"
            >
              Join the Discord
            </a>
          </div>

          <form onSubmit={handleFeedback} className="st-container">
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
                  className="block w-full text-sm text-st-text-light file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-st-secondary file:text-st-text hover:file:bg-black/10 dark:hover:file:bg-white/10 cursor-pointer transition-colors"
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