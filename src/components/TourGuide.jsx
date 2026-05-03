// src/components/TourGuide.jsx
// -> REPLACE ENTIRE FILE WITH:
import React, { useMemo, useState, useEffect } from 'react';
import * as JoyrideModule from 'react-joyride';
import useStore from '../store';

const JoyrideComponent = JoyrideModule.default?.default || JoyrideModule.default || JoyrideModule.Joyride;

export default function TourGuide() {
  const { tourActive, activeTourId, stopTour, theme, asc1_unlocked, asc2_unlocked, cards } = useStore();
  
  // 🕹️ Isolated State: Allows us to natively intercept "Skips" without relying on React global rendering delays
  const[tourStepIndex, setLocalStepIndex] = useState(0);
  const [seenReactiveCard, setSeenReactiveCard] = useState(false);

  // Monitor for the first card that hits Poly or Infernal
  const reactiveCardId = Object.keys(cards || { }).find(k => cards[ k ] >= 3);

  // 🧠 DYNAMIC ROUTING ENGINE
  const TOUR_STEPS = useMemo(() => {
    if (activeTourId !== 'setup') return [ ];

    const s = [ ];
    const add = (step) => s.push(step);

    add({
      id: 'start',
      target: 'body',
      content: 'Welcome to Player Setup! This walkthrough is fully interactive. You can click on the app elements while the tour is running. Click Next to begin.',
      placement: 'center',
      disableBeacon: true
    });
    
    add({
      id: 'profiles',
      target: '[data-tour="setup-profiles"]',
      content: 'This is the Profile Box. Because this tour is interactive, try clicking the dropdown menu right now!',
      placement: 'right',
      disableBeacon: true
    });

    // --- GLOBAL SETTINGS ---
    add({
      id: 'global-asc',
      target: '[data-tour="setup-asc"]',
      content: 'Let\'s set your Global Settings. Ascension properly filters your available Base Stats, Upgrades, Idols, and Cards. Set this first!',
      placement: 'right',
      disableBeacon: true
    });
    add({
      id: 'global-arch',
      target: '[data-tour="setup-arch-level"]',
      content: 'Your Archaeology Level directly impacts how many stat points you have to distribute. Update this.',
      placement: 'right',
      disableBeacon: true
    });
    add({
      id: 'global-floor',
      target: '[data-tour="setup-max-floor"]',
      content: 'Your Max Floor impacts filters for Internal Upgrades. Ensure this matches your game.',
      placement: 'right',
      disableBeacon: true
    });

    // --- BASE STATS ---
    add({
      id: 'nav-stats',
      target: '#setup-tab-stats',
      content: 'Your setup is divided into tabs. We will start with Base Stats. Please CLICK THIS TAB right now, and then click Next.',
      placement: 'bottom',
      disableBeacon: true,
      data: { clickTarget: '#setup-tab-stats' }
    });

    const baseStats =[ 'Str', 'Agi', 'Per', 'Int', 'Luck' ];
    if (asc1_unlocked) baseStats.push('Div');
    if (asc2_unlocked) baseStats.push('Corr');

    baseStats.forEach(stat => {
      add({
        id: `stat-${stat}`,
        target: `#setup-stat-${stat}`,
        content: `Enter your ${stat} here. You can click the box and type while this tooltip is open!`,
        placement: 'auto',
        disableBeacon: true,
        locale: { skip: 'Skip Base Stats' },
        data: { skipTo: 'nav-upgrades_int' }
      });
    });

    // --- INTERNAL UPGRADES ---
    add({
      id: 'nav-upgrades_int',
      target: '#setup-tab-upgrades_int',
      content: 'Now, please CLICK THIS TAB to open your Internal Upgrades, and then click Next.',
      placement: 'bottom',
      disableBeacon: true,
      hideBackButton: true, // Airlock
      data: { clickTarget: '#setup-tab-upgrades_int' }
    });

    add({
      id: 'upgrades_int_content',
      target: '#tour-setup-int-upgrades',
      content: 'Please proceed to fill out all your current Archaeology upgrade levels. You can freely scroll through them. Click next when finished.',
      placement: 'right',
      disableBeacon: true
    });

    // --- EXTERNAL UPGRADES ---
    add({
      id: 'nav-upgrades_ext',
      target: '#setup-tab-upgrades_ext',
      content: 'Next, please CLICK THIS TAB for External Upgrades, and then click Next.',
      placement: 'bottom',
      disableBeacon: true,
      hideBackButton: true,
      data: { clickTarget: '#setup-tab-upgrades_ext' }
    });

    const addExt = (extId, content) => {
      add({
        id: `ext-${extId}`,
        target: `#setup-ext-${extId}`,
        content,
        placement: 'auto',
        disableBeacon: true,
        locale: { skip: 'Skip Ext Upgrades' },
        data: { skipTo: 'nav-cards' }
      });
    };

    addExt('axolotl', 'Axolotl Pet: A "-1" means you don\'t own it yet. A "0" means you own it but haven\'t ranked it up. Set its rank according to the game.');
    addExt('dino', 'Dino Pet: Same as the Axolotl. "-1" means not owned, "0" means base rank. Enter your rank here.');
    addExt('geoduck', 'Geoduck Tribute: Enter the number of Mythic Chests owned. You can find this in your game\'s Relic menu by looking at the summary window at the top.');
    addExt('avada', 'Avada-Keda Skill: Check this box if you have purchased this skill in the game.');
    addExt('block_bonker', 'Block Bonker Skill: Check this box if you have purchased this skill in the game.');
    addExt('arch_bundle', 'Archaeology Bundle: If you are past OB30 and don\'t see the VP bundle in the game store, you already bought it! Check the box.');
    addExt('ascension_bundle', 'Ascension Bundle: Same as the Arch bundle, but requires defeating OB66.');
    addExt('arch_card', 'Arch Ability Card: 0=Locked, 1=Base, 2=Gilded, 3=Poly, 4=Infernal. If Infernal, remember to fill out the negative bonus buff below it!');

    // --- CARDS ---
    add({
      id: 'nav-cards',
      target: '#setup-tab-cards',
      content: 'Almost done! Please CLICK THIS TAB to open Block Cards, and then click Next.',
      placement: 'bottom',
      disableBeacon: true,
      hideBackButton: true,
      data: { clickTarget: '#setup-tab-cards' }
    });

    add({
      id: 'total-infernal',
      target: '[data-tour="setup-total-infernal"]',
      content: 'Total Infernal Cards: Enter your total owned across ALL categories (fishing, arch, etc). This number is highly important because it calculates your massive infernal bonus!',
      placement: 'bottom',
      disableBeacon: true
    });

    add({
      id: 'first-card',
      target: '#setup-card-dirt1',
      content: 'Here is your first Block Card. Set states just like before: 0=Locked, 1=Base, 2=Gilded, 3=Poly, 4=Infernal. Fill out all your cards now, then click Next!',
      placement: 'right',
      disableBeacon: true
    });

    // ⚡ THE REACTIVE INFO STEP
    add({
      id: 'reactive-card',
      target: reactiveCardId ? `#setup-card-info-${reactiveCardId}` : 'body',
      content: 'Excellent! Because you set a card to Poly or Infernal, notice the potential Infernal buff bonus displayed below the card. This updates automatically!',
      placement: 'top',
      disableBeacon: true
    });

    // --- IDOLS ---
    add({
      id: 'nav-idols',
      target: '#setup-tab-idols',
      content: 'Finally, please CLICK THIS TAB to open Arch Idols, and then click Next.',
      placement: 'bottom',
      disableBeacon: true,
      hideBackButton: true,
      data: { clickTarget: '#setup-tab-idols' }
    });

    if (!asc1_unlocked) {
      add({
        id: 'idols-locked',
        target: '#setup-idols-locked',
        content: 'As expected, because you have not unlocked Ascension 1, Arch Idols are hidden. You don\'t need to do anything here!',
        placement: 'auto',
        disableBeacon: true
      });
    } else {
      add({
        id: 'idols-hestia',
        target: '#setup-ext-hestia',
        content: 'Enter your current Hestia Idol level here.',
        placement: 'auto',
        disableBeacon: true
      });
      add({
        id: 'idols-hades',
        target: '#setup-ext-hades',
        content: 'And enter your Hades Idol level here.',
        placement: 'auto',
        disableBeacon: true
      });
    }

    // --- CONCLUSION ---
    add({
      id: 'conclusion',
      target: '[data-tour="main-tab-calc_stats"]',
      content: 'You have successfully finished entering your full Player Setup! CLICK THIS MAIN TAB to verify your stats against the in-game UI to ensure perfect accuracy.',
      placement: 'bottom',
      disableBeacon: true,
      data: { clickTarget: '[data-tour="main-tab-calc_stats"]' } // Hardware click intercept
    });

    return s;
  },[ activeTourId, asc1_unlocked, asc2_unlocked, reactiveCardId ]);

  // Restart local state engine on tour launch
  useEffect(() => {
    if (tourActive) {
      setLocalStepIndex(0);
      setSeenReactiveCard(false);
    }
  }, [ tourActive ]);

  const handleCallback = (data) => {
    const { action, index, status, type } = data;
    const currentStep = TOUR_STEPS[ index ];

    // 🖱️ NATIVE DOM CLICKER FALLBACK
    if (type === 'step:after' && action === 'next') {
      if (currentStep && currentStep.data && currentStep.data.clickTarget) {
        const btn = document.querySelector(currentStep.data.clickTarget);
        if (btn) btn.click();
      }
    }

    // ⏭️ CUSTOM SECTION SKIPPER
    // If user clicks "Skip Base Stats", we catch it, stop the termination, and programmatically jump
    if (action === 'skip' && currentStep?.data?.skipTo) {
      const targetIdx = TOUR_STEPS.findIndex(s => s.id === currentStep.data.skipTo);
      if (targetIdx !== -1) {
         setLocalStepIndex(targetIdx);
         return; // Intercept success, keep the tour running!
      }
    }

    // ⚡ REACTIVE STEP INTERCEPTOR
    if (type === 'step:before') {
       const upcomingStep = TOUR_STEPS[ index ];
       if (upcomingStep?.id === 'reactive-card') {
           const isBackward = action === 'prev';
           // If they haven't upgraded a card, OR they already saw the popup, auto-skip over it instantly
           if (!reactiveCardId || seenReactiveCard) {
               setLocalStepIndex(index + (isBackward ? -1 : 1));
               return;
           } else {
               setSeenReactiveCard(true); // Mark as seen
           }
       }
    }

    if (type === 'error:target_not_found' || type === 'error') {
      console.error(`❌ [TOUR] Target missing on step ${index}. Stopping tour.`);
      stopTour();
      return;
    }

    if (type === 'tour:end' || [ 'finished', 'skipped' ].includes(status) || action === 'close') {
      stopTour();
      return;
    }

    // 🔄 STANDARD CONTROLLED ADVANCEMENT
    if (type === 'step:after') {
       const nextIndex = index + (action === 'prev' ? -1 : 1);
       setLocalStepIndex(nextIndex);
    }
  };

  if (!tourActive || !activeTourId || TOUR_STEPS.length === 0) return null;

  return (
    <JoyrideComponent
      steps={TOUR_STEPS}
      run={tourActive}
      stepIndex={tourStepIndex} // Driven cleanly by isolated local state
      callback={handleCallback}
      continuous={true}
      showProgress={true}
      showSkipButton={true}
      spotlightClicks={true}
      spotlightPadding={8}
      disableOverlayClose={true}
      styles={{
        options: {
          zIndex: 999999,
          primaryColor: '#ffa229',
          backgroundColor: theme === 'dark' ? '#262730' : '#FFFFFF',
          textColor: theme === 'dark' ? '#FAFAFA' : '#31333F',
          arrowColor: theme === 'dark' ? '#262730' : '#FFFFFF',
          overlayColor: 'rgba(0, 0, 0, 0.85)',
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