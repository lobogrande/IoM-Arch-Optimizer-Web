// src/components/TourGuide.jsx
// -> REPLACE ENTIRE FILE WITH:
import React, { useMemo, useState, useEffect } from 'react';
import * as JoyrideModule from 'react-joyride';
import useStore from '../store';

const JoyrideComponent = JoyrideModule.default?.default || JoyrideModule.default || JoyrideModule.Joyride;

const CustomTooltip = ({ index, step, backProps, primaryProps, isLastStep, tooltipProps }) => {
  const stopTour = useStore((state) => state.stopTour);
  const setTourStepIndex = useStore((state) => state.setTourStepIndex);
  
  const handleNext = (e) => {
    e.preventDefault();
    if (isLastStep) {
      stopTour();
      return;
    }

    if (step.data?.clickTarget) {
      const btn = document.querySelector(step.data.clickTarget);
      if (btn) btn.click();
      setTimeout(() => setTourStepIndex(index + 1), 100);
    } else {
      setTourStepIndex(index + 1);
    }
  };

  return (
    <div {...tooltipProps} className="bg-st-bg border border-st-border shadow-2xl rounded-lg p-4 max-w-sm w-full flex flex-col gap-3 z-[999999]" style={{ ...tooltipProps.style, pointerEvents: 'auto' }}>
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
              onClick={(e) => { e.preventDefault(); setTourStepIndex(index - 1); }}
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
  const { tourActive, activeTourId, tourStepIndex, setTourStepIndex, asc1_unlocked, asc2_unlocked, cards } = useStore();
  
  const [seenReactiveCard, setSeenReactiveCard] = useState(false);
  const reactiveCardId = Object.keys(cards || { }).find(k => cards[ k ] >= 3);

  useEffect(() => {
    if (tourActive) setSeenReactiveCard(false);
  }, [ tourActive ]);

  // 🧠 DYNAMIC ROUTING ENGINE
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
    
    // 🛡️ Master Fix: Stable container targeting instead of volatile inputs!
    add('base-stats-content', '#tour-setup-base-stats', 'Here are your Base Stats. Take your time to enter them according to your game. You can freely interact with the inputs and scroll around while this guide stays out of the way! Click Next when done.', 'top-start', 'nav-upgrades_int', 'Skip Base Stats');

    // --- 3. INTERNAL UPGRADES ---
    add('nav-upgrades_int', '#setup-tab-upgrades_int', 'Now let\'s do Internal Upgrades. Please CLICK THIS TAB to open it, and then click Next.', 'bottom', null, null, '#setup-tab-upgrades_int');
    add('hide-maxed', '[data-tour="setup-hide-maxed"]', 'This toggle hides maxed upgrades to reduce screen clutter. Give it a click!', 'auto', 'nav-upgrades_ext', 'Skip Int Upgrades');
    add('upgrades_int_content', '#tour-setup-int-upgrades', 'Here is the Internal Upgrades list. Take your time filling these out. The screen is fully unlocked so you can scroll freely without dismissing this popup! Click Next when ready.', 'top-start', 'nav-upgrades_ext', 'Skip Int Upgrades');

    // --- 4. EXTERNAL UPGRADES ---
    add('nav-upgrades_ext', '#setup-tab-upgrades_ext', 'When you are ready, please CLICK THIS TAB for External Upgrades, and then click Next.', 'bottom', null, null, '#setup-tab-upgrades_ext');
    add('ext_content', '#tour-setup-ext-upgrades', 'External Upgrades include Pets, Skills, and Bundles. The Geoduck and Pets use special ranks instead of levels, so read the labels carefully! Scroll and fill these out.', 'top-start', 'nav-cards', 'Skip Ext Upgrades');

    // --- 5. CARDS ---
    add('nav-cards', '#setup-tab-cards', 'Almost done! Time for Block Cards. Please CLICK THIS TAB, and then click Next.', 'bottom', null, null, '#setup-tab-cards');
    add('total-infernal', '[data-tour="setup-total-infernal"]', 'Total Infernal Cards: Enter your total owned across ALL categories (fishing, arch, etc). This calculates your massive infernal bonus!', 'auto', 'nav-idols', 'Skip Cards');
    add('cards_content', '#tour-setup-cards', 'Here is your Block Card collection. Set their tiers just like in the game. Scroll down as needed.', 'top-start', 'nav-idols', 'Skip Cards');

    if (reactiveCardId) {
       add('reactive-card', `#setup-card-info-${reactiveCardId}`, 'Excellent! Because you set a card to Poly or Infernal, notice the Infernal buff bonus displayed below the card. This updates automatically!', 'auto', 'nav-idols', 'Skip Cards');
    }

    // --- 6. IDOLS ---
    add('nav-idols', '#setup-tab-idols', 'Finally, please CLICK THIS TAB to open Arch Idols, and then click Next.', 'bottom', null, null, '#setup-tab-idols');

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
    return rawSteps.map((step, idx, arr) => {
      const skipToIndex = arr.findIndex(s => s.id === step.skipTo);
      return {
        id: step.id,
        target: step.target,
        placement: step.placement,
        disableBeacon: true,
        disableOverlay: true, // Permanent UI Unlock
        disableScroll: true, // 🛡️ Prevents Joyride from aggressively stealing the scrollbar!
        spotlightClicks: true,
        content: step.text,
        data: {
          clickTarget: step.clickTarget,
          skipLabel: step.skipLabel,
          skipToIndex: skipToIndex !== -1 ? skipToIndex : null
        }
      };
    });
  },[ rawSteps ]);

  const handleCallback = (data) => {
    const { index, status, type, action } = data;
    const { stopTour } = useStore.getState();

    // 🛡️ THE IMMORTALITY SHIELD: We explicitly intercept Joyride's outside-click closure attempts
    if (action === 'close' || status === 'skipped') {
      return;
    }

    if (status === 'finished') {
      stopTour();
      return;
    }

    // ⚡ REACTIVE STEP SILENT SKIP
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
  };

  if (!tourActive || !activeTourId || TOUR_STEPS.length === 0) return null;

  return (
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
      tooltipComponent={CustomTooltip}
      styles={{
        options: { zIndex: 999999 }
      }}
    />
  );
}