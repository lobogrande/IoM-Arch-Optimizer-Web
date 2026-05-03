// src/components/TourGuide.jsx
// -> REPLACE ENTIRE FILE WITH:
import React, { useMemo, useEffect } from 'react';
import * as JoyrideModule from 'react-joyride';
import useStore from '../store';

// 🛡️ Safely unpack the component
const JoyrideComponent = JoyrideModule.default?.default || JoyrideModule.default || JoyrideModule.Joyride;

export default function TourGuide() {
  const { tourActive, activeTourId, stopTour, theme, asc1_unlocked, asc2_unlocked } = useStore();

  // 🧠 DYNAMIC ROUTING ENGINE (Pure Array, natively driven by Joyride)
  const TOUR_STEPS = useMemo(() => {
    if (activeTourId !== 'setup') return [ ];

    const s =[ ];
    const add = (step) => s.push(step);

    add({
      target: 'body',
      content: 'Welcome to Player Setup! This walkthrough is fully interactive. You can click on the app elements while the tour is running. Click Next to begin.',
      placement: 'center',
      disableBeacon: true
    });
    
    add({
      target: '[data-tour="setup-profiles"]',
      content: 'This is the Profile Box. Because this tour is interactive, try clicking the dropdown menu right now!',
      placement: 'auto', 
      disableBeacon: true
    });

    // --- 1. GLOBAL SETTINGS ---
    add({
      target: '[data-tour="setup-asc"]',
      content: 'Let\'s set your Global Settings. Ascension properly filters your available Base Stats, Upgrades, Idols, and Cards. Set this first!',
      placement: 'auto',
      disableBeacon: true
    });
    add({
      target: '[data-tour="setup-arch-level"]',
      content: 'Your Archaeology Level directly impacts how many stat points you have to distribute for your Base Stats. Update this.',
      placement: 'auto',
      disableBeacon: true
    });
    add({
      target: '[data-tour="setup-max-floor"]',
      content: 'Your Max Floor impacts the filters for your Internal Upgrades. Ensure this matches your game.',
      placement: 'auto',
      disableBeacon: true
    });

    // --- 2. BASE STATS ---
    add({
      target: '#setup-tab-stats',
      content: 'Your setup is divided into tabs. We will start with Base Stats. Please CLICK THIS TAB right now, and then click Next.',
      placement: 'auto',
      disableBeacon: true,
      data: { clickTarget: '#setup-tab-stats' } // Fallback hardware clicker
    });

    const baseStats =[ 'Str', 'Agi', 'Per', 'Int', 'Luck' ];
    if (asc1_unlocked) baseStats.push('Div');
    if (asc2_unlocked) baseStats.push('Corr');

    baseStats.forEach(stat => {
      add({
        target: `#setup-stat-${stat}`,
        content: `Enter your ${stat} here. You can click the box and type while this tooltip is open!`,
        placement: 'auto',
        disableBeacon: true
      });
    });

    // --- 3. INTERNAL UPGRADES ---
    add({
      target: '#setup-tab-upgrades_int',
      content: 'Now, please CLICK THIS TAB to open your Internal Upgrades, and then click Next.',
      placement: 'auto',
      disableBeacon: true,
      hideBackButton: true, // Airlock prevents backwards crashing
      data: { clickTarget: '#setup-tab-upgrades_int' }
    });

    add({
      target: '[data-tour="setup-hide-maxed"]',
      content: 'This toggle hides maxed upgrades to reduce screen clutter. Give it a click!',
      placement: 'auto',
      disableBeacon: true
    });

    add({
      target: 'div[id^="setup-upg-"]',
      content: 'This is where you log your Internal Upgrades. Because this is a massive list, let\'s keep the tour moving! You can return to fill these out after the walkthrough is complete. Click Next to continue.',
      placement: 'right', // Will sit on the right on wide monitors, and drop below on laptops/mobile seamlessly
      disableBeacon: true
    });

    // --- 4. EXTERNAL UPGRADES ---
    add({
      target: '#setup-tab-upgrades_ext',
      content: 'Next, please CLICK THIS TAB for External Upgrades, and then click Next.',
      placement: 'auto',
      disableBeacon: true,
      hideBackButton: true,
      data: { clickTarget: '#setup-tab-upgrades_ext' }
    });

    const addExt = (extId, content) => {
      add({
        target: `#setup-ext-${extId}`,
        content,
        placement: 'auto',
        disableBeacon: true
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

    // --- 5. CARDS ---
    add({
      target: '#setup-tab-cards',
      content: 'Almost done! Please CLICK THIS TAB to open Block Cards, and then click Next.',
      placement: 'auto',
      disableBeacon: true,
      hideBackButton: true,
      data: { clickTarget: '#setup-tab-cards' }
    });

    add({
      target: '[data-tour="setup-total-infernal"]',
      content: 'Total Infernal Cards: Enter your total owned across ALL categories (fishing, arch, etc). This number is highly important because it calculates your massive infernal bonus!',
      placement: 'auto',
      disableBeacon: true
    });

    add({
      target: '#setup-card-dirt1',
      content: 'Here is your first Block Card. Set states just like before: 0=Locked, 1=Base, 2=Gilded, 3=Poly, 4=Infernal. If you set a card to Poly or Infernal, notice the potential Infernal buff bonus displayed below it!',
      placement: 'auto',
      disableBeacon: true
    });

    // --- 6. IDOLS ---
    add({
      target: '#setup-tab-idols',
      content: 'Finally, please CLICK THIS TAB to open Arch Idols, and then click Next.',
      placement: 'auto',
      disableBeacon: true,
      hideBackButton: true,
      data: { clickTarget: '#setup-tab-idols' }
    });

    if (!asc1_unlocked) {
      add({
        target: '#setup-idols-locked',
        content: 'As expected, because you have not unlocked Ascension 1, Arch Idols are hidden. You don\'t need to do anything here!',
        placement: 'auto',
        disableBeacon: true
      });
    } else {
      add({
        target: '#setup-ext-hestia',
        content: 'Enter your current Hestia Idol level here.',
        placement: 'auto',
        disableBeacon: true
      });
      add({
        target: '#setup-ext-hades',
        content: 'And enter your Hades Idol level here.',
        placement: 'auto',
        disableBeacon: true
      });
    }

    // --- 7. CONCLUSION ---
    add({
      target: '[data-tour="main-tab-calc_stats"]',
      content: 'You have successfully finished entering your full Player Setup! CLICK THIS MAIN TAB to verify your stats against the in-game UI to ensure perfect accuracy.',
      placement: 'bottom',
      disableBeacon: true,
      data: { clickTarget: '[data-tour="main-tab-calc_stats"]' }
    });

    return s;
  }, [ activeTourId, asc1_unlocked, asc2_unlocked ]);

  // Restart logging
  useEffect(() => {
    if (tourActive) console.warn("🟢 V14 Uncontrolled Tour Activated");
  }, [ tourActive ]);

  const handleCallback = (data) => {
    const { action, index, status, type } = data;

    // 🖱️ NATIVE DOM CLICKER FALLBACK (Forces tabs to open if user forgets to click them)
    if (type === 'step:after' && action === 'next') {
      const currentStep = TOUR_STEPS[ index ];
      if (currentStep && currentStep.data && currentStep.data.clickTarget) {
        const btn = document.querySelector(currentStep.data.clickTarget);
        if (btn) btn.click();
      }
    }

    // FAULTS
    if (type === 'error:target_not_found' || type === 'error') {
      console.error(`❌ [TOUR] Target missing on step ${index}. Stopping tour to prevent lock.`);
      stopTour();
      return;
    }

    // 🛑 BULLETPROOF TERMINATION
    if (type === 'tour:end' || [ 'finished', 'skipped' ].includes(status) || action === 'close') {
      stopTour();
    }
  };

  if (!tourActive || !activeTourId || TOUR_STEPS.length === 0) return null;

  return (
    <JoyrideComponent
      steps={TOUR_STEPS}
      run={tourActive}
      // NO stepIndex! We let the library drive itself natively for ultimate stability.
      callback={handleCallback}
      continuous={true}
      showProgress={true}
      showSkipButton={true}
      spotlightClicks={true}
      spotlightPadding={8}
      disableOverlayClose={true} // Prevents background misclicks from closing the tour
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