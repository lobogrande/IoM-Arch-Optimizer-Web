// src/components/TourGuide.jsx
// -> REPLACE ENTIRE FILE WITH:
import React, { useMemo, useRef, useState, useEffect } from 'react';
import * as JoyrideModule from 'react-joyride';
import useStore from '../store';

const JoyrideComponent = JoyrideModule.default?.default || JoyrideModule.default || JoyrideModule.Joyride;

export default function TourGuide() {
  const { tourActive, activeTourId, stopTour, theme, asc1_unlocked, asc2_unlocked, cards } = useStore();
  
  // 🕹️ Internal API Hook for Custom Jumps
  const joyrideHelpers = useRef(null);
  const [seenReactiveCard, setSeenReactiveCard] = useState(false);

  // Monitor for the first card that hits Poly (3) or Infernal (4)
  const reactiveCardId = Object.keys(cards || { }).find(k => cards[ k ] >= 3);

  // Reset local state when a new tour launches
  useEffect(() => {
    if (tourActive) setSeenReactiveCard(false);
  }, [ tourActive ]);

  // 🚀 CUSTOM SKIP JUMP ENGINE
  const handleCustomSkip = (skipToId) => {
    // We look up the exact index of the Navigation Step we want to jump to.
    const targetIdx = rawSteps.findIndex(s => s.id === skipToId);
    if (targetIdx !== -1) {
       // We tell Joyride to jump there. Because navigation steps target the 
       // ALWAYS-VISIBLE tab buttons, this jump is 100% mathematically crash-proof!
       joyrideHelpers.current?.go(targetIdx);
    }
  };

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
    add('global-asc', '[data-tour="setup-asc"]', 'Let\'s set your Global Settings. Ascension properly filters your available Base Stats, Upgrades, Idols, and Cards. Set this first!', 'auto', 'nav-stats', 'Skip Globals');
    add('global-arch', '[data-tour="setup-arch-level"]', 'Your Archaeology Level directly impacts how many stat points you have to distribute. Update this.', 'auto', 'nav-stats', 'Skip Globals');
    add('global-floor', '[data-tour="setup-max-floor"]', 'Your Max Floor impacts filters for Internal Upgrades. Ensure this matches your game.', 'auto', 'nav-stats', 'Skip Globals');

    // --- 2. BASE STATS ---
    add('nav-stats', '#setup-tab-stats', 'Your setup is divided into tabs. We will start with Base Stats. Please CLICK THIS TAB right now, and then click Next.', 'bottom', null, null, '#setup-tab-stats');

    const baseStats =[ 'Str', 'Agi', 'Per', 'Int', 'Luck' ];
    if (asc1_unlocked) baseStats.push('Div');
    if (asc2_unlocked) baseStats.push('Corr');

    baseStats.forEach(stat => {
      add(`stat-${stat}`, `#setup-stat-${stat}`, `Enter your ${stat} here. You can click the box and type while this tooltip is open!`, 'auto', 'nav-upgrades_int', 'Skip Base Stats');
    });

    // --- 3. INTERNAL UPGRADES ---
    add('nav-upgrades_int', '#setup-tab-upgrades_int', 'Now let\'s check out the Internal Upgrades. Please CLICK THIS TAB to open it, and then click Next.', 'bottom', null, null, '#setup-tab-upgrades_int');
    add('hide-maxed', '[data-tour="setup-hide-maxed"]', 'This toggle hides maxed upgrades to reduce screen clutter. Give it a click!', 'auto', 'nav-upgrades_ext', 'Skip Int Upgrades');
    add('upgrades_int_content', 'div[id^="setup-upg-"]', 'Please proceed to fill out your Archaeology upgrade levels. Because the screen is unlocked, you can freely scroll through the list! Click next when finished.', 'right', 'nav-upgrades_ext', 'Skip Int Upgrades');

    // --- 4. EXTERNAL UPGRADES ---
    add('nav-upgrades_ext', '#setup-tab-upgrades_ext', 'Next up: External Upgrades. Please CLICK THIS TAB, and then click Next.', 'bottom', null, null, '#setup-tab-upgrades_ext');

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
    add('first-card', '#setup-card-dirt1', 'Here is your first Block Card. Set states just like before: 0=Locked, 1=Base, 2=Gilded, 3=Poly, 4=Infernal. Take your time to scroll down and fill them all out.', 'right', 'nav-idols', 'Skip Cards');
    add('reactive-card', reactiveCardId ? `#setup-card-info-${reactiveCardId}` : 'body', 'Excellent! Because you set a card to Poly or Infernal, notice the potential Infernal buff bonus displayed below the card. This updates automatically!', 'auto', 'nav-idols', 'Skip Cards');

    // --- 6. IDOLS ---
    add('nav-idols', '#setup-tab-idols', 'Finally, let\'s look at Arch Idols. Please CLICK THIS TAB, and then click Next.', 'bottom', null, null, '#setup-tab-idols');

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

  // Compile final Joyride steps with injected custom skip buttons
  const TOUR_STEPS = rawSteps.map(step => ({
    id: step.id,
    target: step.target,
    placement: step.placement,
    disableBeacon: true,
    disableOverlay: true, // 🔥 UX MAGIC: Permanently removes the dark mask
    data: step.clickTarget ? { clickTarget: step.clickTarget } : { },
    content: (
      <div className="flex flex-col gap-3">
        <span className="text-sm leading-snug">{step.text}</span>
        {step.skipTo && (
          <button
            onClick={() => handleCustomSkip(step.skipTo)}
            className="self-start text-xs bg-[#2b2b2b] text-[#ffa229] px-3 py-1.5 rounded border border-[#ffa229] hover:bg-[#ffa229] hover:text-[#2b2b2b] font-bold transition-colors cursor-pointer shadow-sm"
          >
            ⏭️ {step.skipLabel}
          </button>
        )}
      </div>
    )
  }));

  const handleCallback = (data) => {
    const { action, index, status, type } = data;

    // ⚡ REACTIVE STEP INTERCEPTOR
    // If we reach the reactive card step, but they haven't upgraded a card yet, skip it automatically.
    if (type === 'step:before') {
       const upcomingStep = TOUR_STEPS[ index ];
       if (upcomingStep?.id === 'reactive-card') {
           const isBackward = action === 'prev';
           if (!reactiveCardId || seenReactiveCard) {
               // Jump over the step smoothly
               setTimeout(() => joyrideHelpers.current?.go(index + (isBackward ? -1 : 1)), 0);
               return;
           } else {
               setSeenReactiveCard(true); // Mark as seen so it doesn't nag them again
           }
       }
    }

    // 🖱️ NATIVE DOM CLICKER FALLBACK
    // If the user forgot to click the tab, this clicks it for them before moving forward!
    if (type === 'step:after' && action === 'next') {
      const currentStep = TOUR_STEPS[ index ];
      if (currentStep && currentStep.data && currentStep.data.clickTarget) {
        const btn = document.querySelector(currentStep.data.clickTarget);
        if (btn) btn.click();
      }
    }

    if (type === 'error:target_not_found' || type === 'error') {
      console.error(`❌ [TOUR] Target missing on step ${index}. Stopping tour.`);
      stopTour();
      return;
    }

    // TERMINATE ON COMPLETION OR CLOSE
    if (type === 'tour:end' || [ 'finished', 'skipped' ].includes(status) || action === 'close') {
      stopTour();
    }
  };

  if (!tourActive || !activeTourId || TOUR_STEPS.length === 0) return null;

  return (
    <JoyrideComponent
      steps={TOUR_STEPS}
      run={tourActive}
      getHelpers={(helpers) => { joyrideHelpers.current = helpers; }} // Extracts the internal API
      callback={handleCallback} // Strictly UNCONTROLLED Mode!
      continuous={true}
      showProgress={true}
      showSkipButton={false} // Hidden default self-destruct skip button
      disableOverlayClose={true} // Prevents invisible overlay misclicks
      styles={{
        options: {
          zIndex: 999999,
          primaryColor: '#ffa229',
          backgroundColor: theme === 'dark' ? '#262730' : '#FFFFFF',
          textColor: theme === 'dark' ? '#FAFAFA' : '#31333F',
          arrowColor: theme === 'dark' ? '#262730' : '#FFFFFF',
        },
        tooltipContainer: { textAlign: 'left' },
        tooltip: {
          border: theme === 'dark' ? '1px solid rgba(255, 162, 41, 0.5)' : '1px solid #ddd',
          boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
        },
        buttonNext: {
          backgroundColor: '#ffa229',
          color: '#2b2b2b',
          fontWeight: 'bold',
          padding: '8px 16px',
          borderRadius: '4px'
        },
        buttonBack: { color: theme === 'dark' ? '#A3A8B8' : '#7D808D', marginRight: '8px' }
      }}
    />
  );
}