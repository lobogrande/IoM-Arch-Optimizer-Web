// src/components/TourGuide.jsx
// -> REPLACE ENTIRE FILE WITH:
import React, { useMemo, useState, useEffect } from 'react';
import * as JoyrideModule from 'react-joyride';
import useStore from '../store';

const JoyrideComponent = JoyrideModule.default?.default || JoyrideModule.default || JoyrideModule.Joyride;

const CustomTooltip = ({ index, step, backProps, primaryProps, isLastStep, tooltipProps }) => {
  const stopTour = useStore((state) => state.stopTour);
  const setTourStepIndex = useStore((state) => state.setTourStepIndex);

  // 📜 PERFECT SCROLLING ENGINE: Flawlessly center targets without breaking overflow containers
  useEffect(() => {
    if (step.target && step.target !== 'body') {
      setTimeout(() => {
        const el = document.querySelector(step.target);
        if (el) {
          const y = el.getBoundingClientRect().top + window.scrollY - (window.innerHeight / 2) + (el.offsetHeight / 2);
          window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
        }
      }, 50);
    }
  }, [index, step.target]);
  
  // 🛡️ SMART PRE-VERIFIER: Prevents Joyride from crashing by skipping missing DOM nodes
  const handleNext = (e) => {
    e.preventDefault();
    if (isLastStep) {
      stopTour();
      return;
    }

    const advance = (startIdx) => {
      let nextIdx = startIdx;
      while (nextIdx < step.data.allTargets.length) {
        if (step.data.allClickTargets[nextIdx]) break; // Reached a tab switch, stop checking
        if (document.querySelector(step.data.allTargets[nextIdx])) break; // Found a valid DOM node!
        console.warn(`⚠️[TOUR] Skipping missing target to prevent crash: ${step.data.allTargets[nextIdx]}`);
        nextIdx++;
      }
      setTourStepIndex(nextIdx);
    };

    if (step.data?.clickTarget) {
      const btn = document.querySelector(step.data.clickTarget);
      if (btn) btn.click();
      setTimeout(() => advance(index + 1), 250); // Give React 18 time to mount the new tab
    } else {
      advance(index + 1);
    }
  };

  const handleBack = (e) => {
    e.preventDefault();
    let prevIdx = index - 1;
    while (prevIdx > 0) {
      if (step.data.allClickTargets[prevIdx]) break;
      if (document.querySelector(step.data.allTargets[prevIdx])) break;
      prevIdx--;
    }
    setTourStepIndex(prevIdx);
  };

  return (
    <div {...tooltipProps} id="iom-custom-tooltip" className="bg-st-bg border border-st-border shadow-2xl rounded-lg p-4 max-w-sm w-full flex flex-col gap-3 z-[999999]" style={{ ...tooltipProps.style, pointerEvents: 'auto' }}>
      <div className="flex justify-between items-start gap-4">
        <div className="text-sm text-st-text leading-snug font-medium whitespace-pre-wrap">{step.content}</div>
        <button 
          type="button" 
          onClick={(e) => { e.preventDefault(); stopTour(); }} 
          className="text-st-text-light hover:text-red-500 font-bold text-xl leading-none px-1 cursor-pointer transition-colors" 
          title="Close Tour"
        >
          &times;
        </button>
      </div>
      
      <div className="flex items-center justify-between mt-2 pt-3 border-t border-st-border/50">
        <div className="flex items-center gap-2">
          {step.data?.skipToIndex !== null && step.data?.skipToIndex !== undefined && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setTourStepIndex(step.data.skipToIndex);
              }}
              className="text-xs bg-[#2b2b2b] text-st-orange px-2 py-1.5 rounded border border-st-orange hover:bg-st-orange hover:text-[#2b2b2b] font-bold transition-colors shadow-sm cursor-pointer"
            >
              ⏭️ {step.data.skipLabel}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {index > 0 && (
            <button 
              type="button" 
              onClick={handleBack}
              className="text-xs font-bold text-st-text-light hover:text-st-text px-2 py-1.5 transition-colors cursor-pointer"
            >
              Back
            </button>
          )}
          <button 
            type="button" 
            onClick={handleNext}
            className="text-xs bg-st-orange text-[#2b2b2b] px-3 py-1.5 rounded font-bold hover:bg-[#ffa229] transition-colors shadow-sm cursor-pointer"
          >
            {isLastStep ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default function TourGuide() {
  // 🛡️ STRICT SELECTORS: Prevents the Tour component from re-rendering when you type in the UI!
  const tourActive = useStore(state => state.tourActive);
  const activeTourId = useStore(state => state.activeTourId);
  const tourStepIndex = useStore(state => state.tourStepIndex);
  const setTourStepIndex = useStore(state => state.setTourStepIndex);
  const stopTour = useStore(state => state.stopTour);
  const asc1_unlocked = useStore(state => state.asc1_unlocked);
  const asc2_unlocked = useStore(state => state.asc2_unlocked);
  
  // Optimizer Dependencies for Dynamic Branching
  const optGoal = useStore(state => state.optGoal);
  const allowUnspent = useStore(state => state.allowUnspent);
  const opt_results = useStore(state => state.opt_results);
  const runMetric = opt_results?.run_target_metric || 'highest_floor';
  const isFloorTarget = runMetric === 'highest_floor';
  const hasLoot = !!opt_results?.show_loot;

  const reactiveCardId = useStore(state => {
    if (!state.cards) return null;
    return Object.keys(state.cards).find(k => state.cards[k] >= 3) || null;
  });
  
  const[seenReactiveCard, setSeenReactiveCard] = useState(false);

  useEffect(() => {
    if (tourActive) setSeenReactiveCard(false);
  }, [ tourActive ]);

  // 🧠 DYNAMIC ROUTING ENGINE (Granular Walkthroughs Restored)
  const rawSteps = useMemo(() => {
    const s =[ ];
    const add = (id, target, text, placement, skipTo = null, skipLabel = null, clickTarget = null) => {
      s.push({ id, target, text, placement, skipTo, skipLabel, clickTarget });
    };

    if (activeTourId === 'setup') {
      add('start', 'body', 'Welcome to Player Setup! This tour is completely unlocked. You can freely click tabs, type numbers, and scroll. Click Next to begin.', 'center');
      add('profiles', '[data-tour="setup-profiles"]', 'This is the Profile Box. Clicking the dropdown menu right now to see your saved profiles!', 'auto');

      // --- 1. GLOBAL SETTINGS ---
      add('global-asc', '[data-tour="setup-asc"]', 'Set your Global Settings. Ascension filters available Base Stats, Upgrades, Idols, and Cards. Set this first!', 'auto', 'nav-stats', 'Skip Globals');
      add('global-arch', '[data-tour="setup-arch-level"]', 'Your Archaeology Level directly impacts how many stat points you have to distribute. Update this.', 'auto', 'nav-stats', 'Skip Globals');
      add('global-floor', '[data-tour="setup-max-floor"]', 'Your Max Floor impacts filters for Internal Upgrades. Ensure this matches your max floor reached.', 'auto', 'nav-stats', 'Skip Globals');

      // --- 2. BASE STATS ---
      add('nav-stats', '#setup-tab-stats', 'The Player Setup is divided into tabs. Start with Base Stats. Please CLICK THIS TAB now, and then click Next.', 'bottom', null, null, '#setup-tab-stats');

      const baseStats =[ 'Str', 'Agi', 'Per', 'Int', 'Luck' ];
      if (asc1_unlocked) baseStats.push('Div');
      if (asc2_unlocked) baseStats.push('Corr');

      baseStats.forEach(stat => {
        add(`stat-${stat}`, `#setup-stat-${stat}`, `Enter your ${stat} here. You can click the box and type while this tooltip is open!`, 'auto', 'nav-upgrades_int', 'Skip Base Stats');
      });

      // --- 3. INTERNAL UPGRADES ---
      add('nav-upgrades_int', '#setup-tab-upgrades_int', 'Now let\'s check out the Internal Upgrades. Please CLICK THIS TAB to open it, and then click Next.', 'bottom', null, null, '#setup-tab-upgrades_int');
      add('hide-maxed', '[data-tour="setup-hide-maxed"]', 'This toggle hides maxed upgrades to reduce screen clutter. Give it a click!', 'auto', 'nav-upgrades_ext', 'Skip Int Upgrades');
      add('upgrades_int_content', 'div[id^="setup-upg-"]', 'Here is your first Internal Upgrade box. Click Next to dismiss this popup so it stops obscuring the screen, then finish filling out the rest of your upgrades.', 'right', 'nav-upgrades_ext', 'Skip Int Upgrades');

      // --- 4. EXTERNAL UPGRADES ---
      add('nav-upgrades_ext', '#setup-tab-upgrades_ext', 'Please finish filling out your Internal Upgrades. When you are ready, please CLICK THIS TAB for External Upgrades, and then click Next.', 'bottom', null, null, '#setup-tab-upgrades_ext');

      const addExt = (extId, content) => {
        add(`ext-${extId}`, `#setup-ext-${extId}`, content, 'auto', 'nav-cards', 'Skip Ext Upgrades');
      };

      addExt('axolotl', 'Axolotl Pet: A "-1" means you don\'t own it yet. A "0" means you own it but haven\'t ranked it up. Set the value according to your quest rank in the game.');
      addExt('dino', 'Dino Pet: Same as the Axolotl. "-1" means not owned, "0" means base rank. Enter your quest rank here.');
      addExt('geoduck', 'Geoduck Tribute: Enter the number of Mythic Chests owned. You can find this in your game\'s Relic menu by looking at the summary window at the top.');
      addExt('avada', 'Avada-Keda Skill: Check this box if you have purchased this skill in the game.');
      addExt('block', 'Block Bonker Skill: Check this box if you have purchased this skill in the game.');
      addExt('arch_bundle', 'Archaeology Bundle: If you are past OB30 and don\'t see the VP bundle in the game store, you already bought it! Check the box.');
      addExt('asc_bundle', 'Ascension Bundle: Same as the Arch bundle, but requires defeating OB66.');
      addExt('arch_card', 'Arch Ability Card: 0=Not Owned, 1=Base, 2=Gilded, 3=Poly, 4=Infernal. If Infernal, remember to fill out the negative bonus buff below it!');

      // --- 5. CARDS ---
      add('nav-cards', '#setup-tab-cards', 'Almost done! Time for Block Cards. Please CLICK THIS TAB, and then click Next.', 'bottom', null, null, '#setup-tab-cards');
      add('total-infernal', '[data-tour="setup-total-infernal"]', 'Total Infernal Cards: Enter your total owned across ALL categories (fishing, arch, etc). This number is important because it is used to calculate your infernal bonus!', 'auto', 'nav-idols', 'Skip Cards');
      add('first-card', '#setup-card-dirt1', 'Here is your first Block Card: 0=Not Owned, 1=Base, 2=Gilded, 3=Poly, 4=Infernal. Click Next to dismiss this popup so it stops obscuring the screen, then finish filling out the rest of the cards.', 'right', 'nav-idols', 'Skip Cards');
      
      if (reactiveCardId) {
         add('reactive-card', `#setup-card-info-${reactiveCardId}`, 'Excellent! Because you set a card to Poly or Infernal, notice the potential Infernal buff bonus displayed below the card. This updates automatically!', 'auto', 'nav-idols', 'Skip Cards');
      }

      // --- 6. IDOLS ---
      add('nav-idols', '#setup-tab-idols', 'Take your time to finish filling out your cards. When you are done, please CLICK THIS TAB to open Arch Idols, and then click Next.', 'bottom', null, null, '#setup-tab-idols');

      if (!asc1_unlocked) {
        add('idols-locked', '#setup-idols-locked', 'As expected, because you have not unlocked Ascension 1, Arch Idols are hidden. You don\'t need to do anything here!', 'auto', 'conclusion', 'Skip Idols');
      } else {
        add('idols-hestia', '#setup-ext-hestia', 'Enter your current Hestia Idol level here.', 'auto', 'conclusion', 'Skip Idols');
        add('idols-hades', '#setup-ext-hades', 'And enter your Hades Idol level here.', 'auto', 'conclusion', 'Skip Idols');
      }

      // --- 7. CONCLUSION ---
      add('nav-calc_stats', '[data-tour="main-tab-calc_stats"]', 'You have successfully completed your Player Setup! CLICK THIS TAB to see your calculated stats, and then click Next.', 'bottom', null, null, '[data-tour="main-tab-calc_stats"]');
      add('troubleshooter', '[data-tour="calc-troubleshooter"]', 'If any of your calculated stats do not perfectly match the in-game Arch Stats UI, open this Stat Troubleshooter! It will help you diagnose missing upgrades, cards, and common data entry mistakes.', 'auto');

    } else if (activeTourId === 'calc_stats') {
      add('calc-start', 'body', 'Welcome to the Calculated Stats page! This tab accurately mirrors your in-game Archaeology stats based on the profile you set up.', 'center');
      add('calc-compendium', '[data-tour="calc-compendium"]', 'Set your Compendium Target Floor here. This determines the exact monster HP scaling applied to your damage calculations.', 'bottom');
      add('calc-grid', '[data-tour="calc-grid"]', 'Here is the breakdown of your exact stats. I strongly recommend double-checking these numbers against the game UI to verify your setup!', 'auto');
      add('calc-optimizer-link', '[data-tour="main-tab-optimizer"]', 'Once your stats look correct, the real fun begins. CLICK THIS TAB to proceed to the Optimizer!', 'bottom', null, null, '[data-tour="main-tab-optimizer"]');
      
    } else if (activeTourId === 'optimizer') {
      add('opt-start', 'body', 'Welcome to the Optimizer! My simulator runs the exact GameMaker math in a background Pyodide Web Worker to find the ultimate stat distributions.', 'center');
      add('opt-goal', '[data-tour="opt-goal"]', 'First, choose your optimization Goal (e.g., Max Floor Push or Target Block Farm).', 'auto');

      // 🔀 DYNAMIC DECISION TREE
      if (optGoal === "Fragment Farming") {
        add('opt-target-frag', '[data-tour="opt-target-frag"]', 'Select the specific fragment tier you want to farm.', 'auto');
      } else if (optGoal === "Block Card Farming") {
        add('opt-target-block', '[data-tour="opt-target-block"]', 'Select the specific block card you want to target.', 'auto');
      }

      if (optGoal !== "Max Floor Push") {
        add('opt-allow-unspent', '[data-tour="opt-allow-unspent"]', 'Check this if you want to intentionally leave stat points unspent to create a crippled build.', 'auto');
      }

      add('opt-locks-intro', '[data-tour="opt-locks"]', 'Now, check out the Stat Constraints expander. You use this section to lock stats.', 'auto');
      add('opt-lock-cb', '[data-tour="opt-lock-cb-Str"]', 'Here is the toggle to lock a specific stat. Check it to lock Strength, for example.', 'top');
      add('opt-lock-type', '[data-tour="opt-lock-type-Str"]', 'Choose your locking constraint type (Exact, Min, Max, Range).', 'right');
      add('opt-lock-val', '[data-tour="opt-lock-val-Str"]', 'Enter the target numeric value here.', 'bottom');

      if (allowUnspent && optGoal !== "Max Floor Push") {
        add('opt-lock-unspent', '[data-tour="opt-lock-box-Unassigned"]', 'Because you allowed unspent points, you can lock the amount of points intentionally left unspent here to force your crippled build.', 'auto');
      }

      add('opt-locks-finish', '[data-tour="opt-locks"]', 'Finish locking your required stats based on your goal, then click Next.', 'auto');

      add('opt-time-slider', '[data-tour="opt-time-slider"]', 'Now set your time limit. Move the slider until the Precision Gauge below turns yellow to prepare for a fast Scout Run.', 'auto');
      add('opt-run-scout', '[data-tour="opt-run-wrapper"]', 'Click here to run the Scout Run. This helps you identify which stats drop to 0 or hit max cap so you know what you should lock for the real runs!', 'top');

      add('opt-precision', '[data-tour="opt-precision-gauge"]', 'After reviewing your scout run and locking the obvious stats, adjust the time limit again until this gauge turns Green for High Precision.', 'auto');
      add('opt-run-real', '[data-tour="opt-run-wrapper"]', 'With a Green precision gauge, run the optimizer 2 to 5 times to gather a solid set of runs. The tooltip will wait here. Click Next when you are finished running your batch!', 'top');

      add('opt-synth-link', '[data-tour="main-tab-synth"]', 'Once you have your refined runs, it\'s time to synthesize them! CLICK THIS TAB to proceed to Synthesis.', 'bottom', null, null, '[data-tour="main-tab-synth"]');

      // --- SYNTHESIS TAB ---
      add('synth-filter', '[data-tour="synth-filter"]', 'Welcome to Synthesis! The target from your most recent Optimization is auto-selected here, filtering the history below to only show relevant runs.', 'bottom');
      add('synth-table', '[data-tour="synth-table"]', 'This is your History Table. Select 2 to 5 of your recent highly-optimized runs using the checkboxes to combine them.', 'top');
      add('synth-run', '[data-tour="synth-run-wrapper"]', 'Click here to Synthesize your Ultimate Meta-Build! The tooltip will wait here. Click Next when the synthesis is complete.', 'top');

      // --- RESULTS DASHBOARD ---
      add('res-tab-build', '[data-tour="res-tab-build"]', 'Here is your newly synthesized Ultimate Meta-Build! The AI has run a deep 500-simulation marathon to eliminate RNG variance.', 'top');
      add('res-apply', '[data-tour="res-apply"]', 'You can instantly apply this meta-build back to your global profile here.', 'bottom');

      add('res-tab-data-link', '[data-tour="res-tab-data"]', 'Now let\'s look at the analytics. CLICK THIS TAB to open the Simulation Data view, then click Next.', 'bottom', null, null, '[data-tour="res-tab-data"]');

      if (isFloorTarget) {
        add('res-data-push', '[data-tour="res-data-push"]', 'Because pushing floors is highly RNG-dependent, this table shows the cumulative probability and required Arch Seconds to reach specific milestones safely.', 'top');
        add('res-inner-wall-link', '[data-tour="res-inner-wall"]', 'CLICK THIS TAB to view the Progression Wall, then click Next.', 'bottom', null, null, '[data-tour="res-inner-wall"]');
        add('res-data-wall', '[data-tour="res-data-wall"]', 'This histogram and stamina trace show you exactly where and why your build runs out of stamina.', 'top');
      } else {
        add('res-data-banked', '[data-tour="res-data-banked"]', 'Here are your Banked Yields. This is the true, mathematically stable average of what this build produces per 1k Arch Seconds.', 'top');
        add('res-inner-cards-link', '[data-tour="res-inner-cards"]', 'CLICK THIS TAB to view Card Drop estimates, then click Next.', 'bottom', null, null, '[data-tour="res-inner-cards"]');
        add('res-data-cards', '[data-tour="res-data-cards"]', 'Select a block card here to see exactly how long it will take to farm Base, Poly, or Infernal copies!', 'top');
        if (hasLoot) {
          add('res-inner-loot-link', '[data-tour="res-inner-loot"]', 'CLICK THIS TAB to view Collateral Loot, then click Next.', 'bottom', null, null, '[data-tour="res-inner-loot"]');
          add('res-data-loot', '[data-tour="res-data-loot"]', 'This breakdown shows all the extra fragments you will passively farm while targeting your primary goal.', 'top');
        }
      }

      add('res-tab-roi-link', '[data-tour="res-tab-roi"]', 'Finally, CLICK THIS TAB to open the Upgrade Guide (ROI Analyzer), then click Next.', 'bottom', null, null, '[data-tour="res-tab-roi"]');

      if (isFloorTarget) {
        add('res-roi-disabled', '[data-tour="res-roi-disabled"]', 'The ROI Analyzer is disabled for Floor Pushing. Floor progression relies on large, discrete math breakpoints rather than +1 stat gains.', 'top');
      } else {
        add('res-roi-analyzer', '[data-tour="res-roi-analyzer"]', 'The ROI Analyzer runs isolated micro-simulations, adding +1 to every stat, card, and upgrade to rank their immediate raw output gain!', 'top');
      }

      add('opt-end', 'body', 'You have completed the Optimizer tour! Your next steps are to use the Sandbox for precise breakpoint tweaking, or the Duel tab to compare two builds side-by-side.', 'center');

    } else if (activeTourId === 'sandbox') {
      add('sand-start', 'body', 'Welcome to the Sandbox! This is my testing ground for experimenting with hypothetical stat distributions outside of the main profile.', 'center');
      add('sand-stats', '[data-tour="sand-stats"]', 'Modify any stat here. These inputs are isolated and will not overwrite your actual saved profile.', 'auto');
      add('sand-floor', '[data-tour="sand-floor"]', 'Set the target floor. The math engine will calculate your exact hits-to-kill against this floor.', 'auto');
      add('sand-hits', '[data-tour="sand-hits"]', 'Use the Minimum Hits filter to quickly find break-points. Blocks requiring more hits than this will automatically be hidden.', 'auto');
      add('sand-results', '[data-tour="sand-results"]', 'Your dynamic results appear here in real-time as you type. Go ahead and try changing a stat right now!', 'auto');
    }

    return s;
  },[ activeTourId, asc1_unlocked, asc2_unlocked, reactiveCardId, optGoal, allowUnspent, runMetric, hasLoot, isFloorTarget ]);

  const TOUR_STEPS = useMemo(() => {
    const allTargets = rawSteps.map(s => s.target);
    const allClickTargets = rawSteps.map(s => s.clickTarget);

    return rawSteps.map((step, idx, arr) => {
      const skipToIndex = arr.findIndex(s => s.id === step.skipTo);
      return {
        id: step.id,
        target: step.target,
        placement: step.placement,
        disableBeacon: true,
        disableOverlay: true, 
        disableScroll: true,
        content: step.text,
        data: {
          clickTarget: step.clickTarget,
          skipLabel: step.skipLabel,
          skipToIndex: skipToIndex !== -1 ? skipToIndex : null,
          allTargets,        // Injected for the Smart Pre-Verifier loop
          allClickTargets    // Injected for the Smart Pre-Verifier loop
        }
      };
    });
  },[ rawSteps ]);

  const handleCallback = (data) => {
    const { index, status, type, action } = data;

    // 🛡️ The Immortality Shield: Do nothing on outside clicks or escapes
    if (action === 'close' || status === 'skipped') {
      return;
    }

    if (status === 'finished') {
      stopTour();
      return;
    }

    // ⚡ Reactive Step Silent Skip
    if (type === 'step:before') {
       const upcomingStep = TOUR_STEPS[ index ];
       if (upcomingStep?.id === 'reactive-card') {
           if (!reactiveCardId || seenReactiveCard) {
               setTourStepIndex(index + 1);
           } else {
               setSeenReactiveCard(true);
           }
       }
       return;
    }

    // 🛡️ Missing Target Auto-Skip: Throttled to prevent rapid cascades
    if (type === 'error:target_not_found') {
      console.warn(`⚠️ [TOUR] Target missing on step ${index}. Auto-skipping to prevent freeze.`);
      setTimeout(() => setTourStepIndex(index + 1), 50);
    }
  };

  if (!tourActive || !activeTourId || TOUR_STEPS.length === 0) return null;

  return (
    <>
      {/* 💀 THE NUCLEAR UNLOCK: Global CSS injection guarantees Joyride's overlay cannot physically render or block clicks */}
      <style>{`
        .react-joyride__overlay {
          display: none !important;
          pointer-events: none !important;
        }
      `}</style>

      <JoyrideComponent
        steps={TOUR_STEPS}
        run={tourActive}
        stepIndex={tourStepIndex} // Strict Controlled Mode
        callback={handleCallback}
        continuous={true}
        showProgress={false}
        showSkipButton={false}
        disableOverlayClose={true}
        disableCloseOnEsc={true}
        disableFocusTrap={true} // 💀 Kills react-focus-lock so you can type and click everywhere!
        tooltipComponent={CustomTooltip}
        styles={{
          options: {
            zIndex: 999999,
          },
          overlay: {
            display: 'none', // Secondary failsafe to hide the SVG mask
          },
          spotlight: {
            display: 'none', // Secondary failsafe to hide the SVG mask
          }
        }}
      />
    </>
  );
}