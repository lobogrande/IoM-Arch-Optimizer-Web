// src/components/TourGuide.jsx
// -> REPLACE ENTIRE FILE WITH:
import React, { useMemo, useState, useEffect } from 'react';
import * as JoyrideModule from 'react-joyride';
import useStore from '../store';

const JoyrideComponent = JoyrideModule.default?.default || JoyrideModule.default || JoyrideModule.Joyride;

const CustomTooltip = ({ index, step, backProps, primaryProps, isLastStep, tooltipProps }) => {
  const stopTour = useStore((state) => state.stopTour);
  const setTourStepIndex = useStore((state) => state.setTourStepIndex);
  
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
    if (activeTourId !== 'setup') return [ ];

    const s =[ ];
    const add = (id, target, text, placement, skipTo = null, skipLabel = null, clickTarget = null) => {
      s.push({ id, target, text, placement, skipTo, skipLabel, clickTarget });
    };

    add('start', 'body', 'Welcome to Player Setup! This tour is completely unlocked. You can freely click tabs, type numbers, and scroll. Click Next to begin.', 'center');
    add('profiles', '[data-tour="setup-profiles"]', 'This is the Profile Box. Because the screen is unlocked, try clicking the dropdown menu right now to see your profiles!', 'auto');

    // --- 1. GLOBAL SETTINGS ---
    add('global-asc', '[data-tour="setup-asc"]', 'Set your Global Settings. Ascension properly filters available Base Stats, Upgrades, Idols, and Cards. Set this first!', 'auto', 'nav-stats', 'Skip Globals');
    add('global-arch', '[data-tour="setup-arch-level"]', 'Your Archaeology Level directly impacts how many stat points you have to distribute. Update this.', 'auto', 'nav-stats', 'Skip Globals');
    add('global-floor', '[data-tour="setup-max-floor"]', 'Your Max Floor impacts filters for Internal Upgrades. Ensure this matches your game.', 'auto', 'nav-stats', 'Skip Globals');

    // --- 2. BASE STATS ---
    add('nav-stats', '#setup-tab-stats', 'My setup is divided into tabs. Start with Base Stats. Please CLICK THIS TAB right now, and then click Next.', 'bottom', null, null, '#setup-tab-stats');

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
    add('nav-upgrades_ext', '#setup-tab-upgrades_ext', 'Take your time to finish filling out your Internal Upgrades! When you are ready, please CLICK THIS TAB for External Upgrades, and then click Next.', 'bottom', null, null, '#setup-tab-upgrades_ext');

    const addExt = (extId, content) => {
      add(`ext-${extId}`, `#setup-ext-${extId}`, content, 'auto', 'nav-cards', 'Skip Ext Upgrades');
    };

    addExt('axolotl', 'Axolotl Pet: A "-1" means you don\'t own it yet. A "0" means you own it but haven\'t ranked it up. Set its rank according to the game.');
    addExt('dino', 'Dino Pet: Same as the Axolotl. "-1" means not owned, "0" means base rank. Enter your rank here.');
    addExt('geoduck', 'Geoduck Tribute: Enter the number of Mythic Chests owned. You can find this in your game\'s Relic menu by looking at the summary window at the top.');
    addExt('avada', 'Avada-Keda Skill: Check this box if you have purchased this skill in the game.');
    addExt('block_bonker', 'Block Bonker Skill: Check this box if you have purchased this skill in the game.');
    addExt('arch_bundle', 'Archaeology Bundle: If you are past OB30 and don\'t see the VP bundle in the game store, you already bought it! Check the box.');
    addExt('ascension_bundle', 'Ascension Bundle: Same as the Arch bundle, but requires defeating OB66.');
    addExt('arch_card', 'Arch Ability Card: 0=Locked, 1=Base, 2=Gilded, 3=Poly, 4=Infernal. If Infernal, remember to fill out the negative bonus buff below it!');

    // --- 5. CARDS ---
    add('nav-cards', '#setup-tab-cards', 'Almost done! Time for Block Cards. Please CLICK THIS TAB, and then click Next.', 'bottom', null, null, '#setup-tab-cards');
    add('total-infernal', '[data-tour="setup-total-infernal"]', 'Total Infernal Cards: Enter your total owned across ALL categories (fishing, arch, etc). This number is highly important because it calculates your massive infernal bonus!', 'auto', 'nav-idols', 'Skip Cards');
    add('first-card', '#setup-card-dirt1', 'Here is your first Block Card. Set states just like before. Click Next to dismiss this popup so it stops obscuring the screen, then finish filling out the rest of the cards.', 'right', 'nav-idols', 'Skip Cards');
    
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
    add('conclusion', '[data-tour="main-tab-calc_stats"]', 'You have successfully finished entering your full Player Setup! CLICK THIS MAIN TAB to verify your stats against the in-game UI to ensure perfect accuracy.', 'bottom', null, null, '[data-tour="main-tab-calc_stats"]');

    return s;
  },[ activeTourId, asc1_unlocked, asc2_unlocked, reactiveCardId ]);

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