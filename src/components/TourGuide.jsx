// src/components/TourGuide.jsx
import React, { useMemo, useRef, useState, useEffect } from 'react';
import * as JoyrideModule from 'react-joyride';
import useStore from '../store';

const JoyrideComponent = JoyrideModule.default?.default || JoyrideModule.default || JoyrideModule.Joyride;

const CustomTooltip = ({ index, step, backProps, primaryProps, isLastStep, tooltipProps }) => {
  const { stopTour } = useStore();
  
  return (
    <div {...tooltipProps} className="bg-st-bg border border-st-border shadow-2xl rounded-lg p-4 max-w-sm w-full flex flex-col gap-3 z-[999999]" style={{ ...tooltipProps.style, pointerEvents: 'auto' }}>
      <div className="flex justify-between items-start gap-4">
        <div className="text-sm text-st-text leading-snug font-medium whitespace-pre-wrap">{step.content}</div>
        <button 
          type="button" 
          onClick={stopTour} 
          className="text-st-text-light hover:text-red-500 font-bold text-xl leading-none px-1 cursor-pointer transition-colors" 
          title="Close Tour"
        >
          &times;
        </button>
      </div>
      
      <div className="flex items-center justify-between mt-2 pt-3 border-t border-st-border/50">
        <div className="flex items-center gap-2">
          {step.data?.skipTo && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                // Direct CustomEvent bus to guarantee isolation from Joyride's prop stripping
                window.dispatchEvent(new CustomEvent('tour-skip-direct', { detail: step.data.skipTo }));
              }}
              className="text-xs bg-[#2b2b2b] text-st-orange px-2 py-1.5 rounded border border-st-orange hover:bg-st-orange hover:text-[#2b2b2b] font-bold transition-colors shadow-sm cursor-pointer"
            >
              ⏭️ {step.data.skipLabel}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {index > 0 && (
            <button {...backProps} type="button" className="text-xs font-bold text-st-text-light hover:text-st-text px-2 py-1.5 transition-colors cursor-pointer">
              Back
            </button>
          )}
          <button {...primaryProps} type="button" className="text-xs bg-st-orange text-[#2b2b2b] px-3 py-1.5 rounded font-bold hover:bg-[#ffa229] transition-colors shadow-sm cursor-pointer">
            {isLastStep ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default function TourGuide() {
  // 🛡️ Bulletproof Controlled Mode
  const { tourActive, activeTourId, stopTour, tourStepIndex, setTourStepIndex, asc1_unlocked, asc2_unlocked, cards } = useStore();
  
  const[seenReactiveCard, setSeenReactiveCard] = useState(false);
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

    const baseStats =[ 'Str', 'Agi', 'Per', 'Int', 'Luck' ];
    if (asc1_unlocked) baseStats.push('Div');
    if (asc2_unlocked) baseStats.push('Corr');

    baseStats.forEach(stat => {
      add(`stat-${stat}`, `#setup-stat-${stat}`, `Enter your ${stat} here. You can click the box and type while this tooltip is open!`, 'auto', 'nav-upgrades_int', 'Skip Base Stats');
    });

    // --- 3. INTERNAL UPGRADES ---
    add('nav-upgrades_int', '#setup-tab-upgrades_int', 'Now look at the Internal Upgrades. Please CLICK THIS TAB to open it, and then click Next.', 'bottom', null, null, '#setup-tab-upgrades_int');
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
    add('first-card', '#setup-card-dirt1', 'Here is your first Block Card. Set stats just like before. Click Next to dismiss this popup so it stops obscuring the screen, then finish filling out the rest of the cards.', 'right', 'nav-idols', 'Skip Cards');
    add('reactive-card', reactiveCardId ? `#setup-card-info-${reactiveCardId}` : 'body', 'Excellent! Because you set a card to Poly or Infernal, notice the potential Infernal buff bonus displayed below the card. This updates automatically!', 'auto', 'nav-idols', 'Skip Cards');

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

  // 🚀 INJECT CUSTOM BUTTONS INTO RAW STEPS
  const TOUR_STEPS = useMemo(() => {
    return rawSteps.map(step => ({
      id: step.id,
      target: step.target,
      placement: step.placement,
      disableBeacon: true,
      disableOverlay: false, 
      spotlightClicks: true,
      content: step.text,
      data: {
        clickTarget: step.clickTarget,
        skipTo: step.skipTo,
        skipLabel: step.skipLabel,
      }
    }));
  }, [ rawSteps ]);

  // 🎧 EVENT BUS LISTENER: Intercepts custom jump events from the isolated Tooltip
  useEffect(() => {
    const handleDirectSkip = (e) => {
      const targetId = e.detail;
      const targetIdx = TOUR_STEPS.findIndex(s => s.id === targetId);
      if (targetIdx !== -1) {
        setTourStepIndex(targetIdx);
      }
    };
    window.addEventListener('tour-skip-direct', handleDirectSkip);
    return () => window.removeEventListener('tour-skip-direct', handleDirectSkip);
  }, [ TOUR_STEPS, setTourStepIndex ]);

  const handleCallback = (data) => {
    const { action, index, status, type } = data;

    if ([ 'finished', 'skipped' ].includes(status)) {
      stopTour();
      return;
    }

    // 🛡️ IMMUNITY SHIELD: Completely ignore Joyride's outside click closure attempts
    if (action === 'close') {
      return;
    }

    // ⚡ REACTIVE STEP SILENT SKIP
    if (type === 'step:before') {
       const upcomingStep = TOUR_STEPS[ index ];
       if (upcomingStep?.id === 'reactive-card') {
           const isBackward = action === 'prev';
           if (!reactiveCardId || seenReactiveCard) {
               setTourStepIndex(index + (isBackward ? -1 : 1));
           } else {
               setSeenReactiveCard(true);
           }
       }
       return;
    }

    // 🖱️ CONTROLLED MODE NAVIGATION
    if (type === 'step:after') {
      if (action === 'next' || action === 'prev') {
        const nextIdx = action === 'next' ? index + 1 : index - 1;
        const currentStep = TOUR_STEPS[ index ];
        
        if (action === 'next' && currentStep?.data?.clickTarget) {
          const btn = document.querySelector(currentStep.data.clickTarget);
          if (btn) btn.click();
          
          // 🛡️ THE 100MS BRIDGE: Prevents the React 18 Gray Screen Crash
          setTimeout(() => setTourStepIndex(nextIdx), 100);
          return;
        }
        setTourStepIndex(nextIdx);
      }
    }

    // 🛡️ CRASH RECOVERY: If a target isn't found, safely auto-skip to prevent Gray Screen hangs
    if (type === 'error:target_not_found') {
      console.warn(`⚠️ [TOUR] Target missing on step ${index}. Auto-skipping to prevent crash.`);
      setTourStepIndex(index + 1);
      return;
    }
  };

  if (!tourActive || !activeTourId || TOUR_STEPS.length === 0) return null;

  return (
    <JoyrideComponent
      steps={TOUR_STEPS}
      run={tourActive}
      stepIndex={tourStepIndex} // Back in safe Controlled Mode
      callback={handleCallback}
      continuous={true}
      showProgress={false}
      showSkipButton={false}
      disableOverlayClose={true}
      disableCloseOnEsc={true}
      tooltipComponent={CustomTooltip}
      styles={{
        options: {
          zIndex: 999999,
          overlayColor: 'transparent',
        },
        overlay: {
          pointerEvents: 'none',
        },
        // Prevents React 18 warnings by avoiding HTML styles on Joyride's SVG spotlight
        spotlight: {
          fill: 'transparent',
          stroke: 'transparent',
        }
      }}
    />
  );
}