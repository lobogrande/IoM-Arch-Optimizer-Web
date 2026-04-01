# ⛏️ Idle Obelisk Miner (IoM) Arch Optimizer

![React](https://img.shields.io/badge/Frontend-React_18-61DAFB.svg?logo=react)
![Vite](https://img.shields.io/badge/Bundler-Vite-646CFF.svg?logo=vite)
![Pyodide](https://img.shields.io/badge/Engine-Pyodide_(Wasm)-3776AB.svg?logo=python)
![Tailwind](https://img.shields.io/badge/UI-Tailwind_CSS-38B2AC.svg?logo=tailwind-css)
![Status](https://img.shields.io/badge/Status-Live-4CAF50.svg)

A high-performance, 100% client-side **Monte Carlo Simulator and AI Build Optimizer** for the Archaeology mini-game in *Idle Obelisk Miner*. 

This tool evaluates your player stats, upgrades, and block card collections to compute the absolute perfect stat distribution for your account. Whether you are pushing for a new Max Floor, farming late-game Block Cards, or maximizing EXP yields, this engine mathematically eliminates the guesswork—all running locally in your browser at near-native speeds.

---

## 🧠 The Math Problem: Why You Can't "Guess" a Build

Idle Obelisk Miner has a deceptively complex combat engine. Finding the perfect stat distribution manually is nearly impossible due to three mathematical realities encoded into the game:

1. **The Stat Plateau (Truncation):** The game runs in Unity (C#) and casts floats to integers via strict truncation (`math.floor`), not standard rounding. Because blocks only take whole hits, having 50 Strength and 54 Strength might both result in a "3-hit kill". Any stat points spent that do not push you past the next *Breakpoint* are mathematically wasted.
2. **Multiplicative Menus:** In-game stats combine percentage bonuses from different menus multiplicatively, not additively. 
3. **The "Suicide Farming Paradox":** Because the game has zero death-delay, buying survival stats (Agility/Stamina) when farming early-game blocks (e.g., Dirt Cards) pushes the player to deeper floors where block HP is exponentially higher. This causes your kills-per-minute to mathematically *plummet*. 

**The Solution:** This engine emulates the C# source code exactly, executing hundreds of thousands of micro-tick combat simulations to find the optimal breakpoints for your specific target.

---

## 🏗️ Architecture & Stack (The WebAssembly Rewrite)

Originally built as a heavy, server-bound Streamlit application, this project has been fully re-architected into a **Serverless Web Application**. It uses WebAssembly to execute the original Python math engine directly on the user's local device, resulting in zero server costs and infinite scalability.

* **Frontend UI (`src/components`):** Built with React, Vite, and Tailwind CSS for a highly polished, responsive interface.
* **State Management (`src/store.js`):** Powered by Zustand, featuring `localStorage` persistence so users never lose their imported builds or simulation history.
* **The Bridge (`public/engine_worker.js`):** Pyodide (Python via WebAssembly) runs inside dedicated browser Web Workers. It bypasses heavy JSON serialization overhead by maintaining a persistent Python memory state and only transferring lightweight mutation dictionaries.
* **The Math Engine (`public/core`):** The exact 1:1 C# to Python translations (`player.py`, `block.py`, `combat_loop.py`) are preserved and executed natively in the browser.
* **The Orchestrator (`src/utils/optimizer.js`):** A Javascript-native Web Worker Pool that automatically scales to the user's `navigator.hardwareConcurrency` to max out their CPU cores during Monte Carlo grid searches.

---

## 🚀 Key Features

* **Hardware-Aware Auto-Scaling:** The Javascript orchestrator dynamically benchmarks your device's CPU speed and adjusts the "Step Size" leaps the AI takes via a **3-Phase Successive Halving Algorithm** to ensure deep mathematical precision without freezing your browser.
* **Deep Tie-Breaker Tournaments:** If two stat builds tie for 1st place, the AI throws them into a 500-iteration Monte Carlo race to see which build performs better against extreme RNG variations.
* **Marginal ROI Analyzer:** Evaluates your current character and tests adding `+1` to every possible stat and un-maxed upgrade, ranking them by their raw output gain to tell you exactly what to buy next.
* **Meta-Build Synthesizer:** Merge your historical runs into the ultimate Meta-Build by allowing the engine to calculate the statistical center of your favorite builds and generate nearby hybrid permutations.
* **Interactive Sandbox:** A fully featured AG Grid table that allows you to manually tweak stats and instantly view exact Hit/HP Breakpoints and Expected Damage Per Swing (EDPS) for every block in the game.

---

## 💻 Local Installation & Setup

To run the application locally for development:

**1. Clone the repository**
```bash
git clone https://github.com/lobogrande/IoM-Arch-Optimizer-Web.git
cd IoM-Arch-Optimizer-Web
```

**2. Install Dependencies**
```bash
npm install
```

**3. Set up your secrets(Optional, for the Feedback Webhook)**
Create a .env file in the root directory and add your Discord Webhook URL so the "About & Feedback" form can successfully transmit bug reports:
```env
VITE_DISCORD_WEBHOOK="https://discord.com/api/webhooks/your_webhook_url_here"
```
*(If left blank, the app safely falls back to generating a GitHub Issue for the user).*

**4. Launch the local development server**
```bash
npm run dev
```
*(Note: Because Pyodide requires WebAssembly, you must access the app via the local server URL provided by Vite (e.g., http://localhost:5173) to ensure strict browser MIME type execution).*

## 🤝 Acknowledgments & Beta Testers
A massive thank you to the dedicated Discord community members who helped stress-test the original Python math engine, uncover edge cases, and shape the UI into what it is today.

⭐ Sans
⭐ Eugloopy☆Dilemma
⭐ Saronitian
⭐ Doctorcool
⭐ Koksuone
⭐ Dustin
⭐ Dave

*(If you contributed to the beta testing and your name is missing, please submit a note via the Feedback tab in the app!)*

## 📜 License
This project is licensed under the MIT License. See the LICENSE file for details.