// src/components/TourGuide.jsx
// -> REPLACE ENTIRE FILE WITH:
import React, { useMemo, useState, useEffect } from 'react';
import { flushSync } from 'react-dom'; // ⚡ The React 18 Sync Engine
import * as JoyrideModule from 'react-joyride';
import useStore from '../store';

const JoyrideComponent = JoyrideModule.default?.default || JoyrideModule.default || JoyrideModule.Joyride;

export default function TourGuide() {
  const { tourActive, activeTourId, stopTour, theme, asc1_unlocked, asc2_unlocked, setActiveSubTab } = useStore();
  
  // 🕹️ Controlled Mode State
  const [tourStepIndex, setLocalStepIndex] = useState(0);

  // Initialize a clean state when the tour launches
  useEffect(() => {
    if (tourActive) {
      setLocalStepIndex(0);
      setActiveSubTab('stats'); // Instantly reset UI to the start
    }
  },[ tourActive, setActiveSubTab ]);

  // 🧠 DYNAMIC ROUTING ENGINE
  const TOUR_STEPS = useMemo(() => {
    if (activeTourId !== 'setup') return [ ];

    const s =[ ];
    
    // Helper to ensure EVERY step globally unlocks the screen
    const add = (step) => s.push({
      ...step,
      disableBeacon: true,
      disableOverlay: true, // 🔥 UX MAGIC: The screen is NEVER locked. The user can click anywhere!
    });

    add({
      id: 'start',
      target: 'body',
      content: 'Welcome to Player Setup! This walkthrough is fully unlocked. You can freely click on tabs, type in boxes, and scroll around while the tour is running. Click Next to begin.',
      placement: 'center'
    });
    
    add({
      id: 'profiles',
      target: '[data-tour="setup-profiles"]',
      content: 'This is the Profile Box. Because the screen is unlocked, try clicking the dropdown menu right now!',
      placement: 'auto'
    });

    // --- 1. GLOBAL SETTINGS ---
    add({
      id: 'global-asc',
      target: '[data-tour="setup-asc"]',
      content: 'Let\'s set your Global Settings. Ascension properly filters your available Base Stats, Upgrades, Idols, and Cards. Set this first!',
      placement: 'auto',
      locale: { skip: 'Skip Globals' },
      data: { skipTo: 'nav-stats' } // Jump to the next section
    });
    add({
      id: 'global-arch',
      target: '[data-tour="setup-arch-level"]',
      content: 'Your Archaeology Level directly impacts how many stat points you have to distribute. Update this.',
      placement: 'auto',
      locale: { skip: 'Skip Globals' },
      data: { skipTo: 'nav-stats' }
    });
    add({
      id: 'global-floor',
      target: '[data-tour="setup-max-floor"]',
      content: 'Your Max Floor impacts filters for Internal Upgrades. Ensure this matches your game.',
      placement: 'auto',
      locale: { skip: 'Skip Globals' },
      data: { skipTo: 'nav-stats' }
    });

    // --- 2. BASE STATS ---
    add({
      id: 'nav-stats',
      target: '#setup-tab-stats',
      content: 'Your setup is divided into tabs. We will start with Base Stats.',
      placement: 'bottom',
      data: { tab: 'stats' }
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
        locale: { skip: 'Skip Base Stats' },
        data: { skipTo: 'nav-upgrades_int' } // Jump to next section
      });
    });

    // --- 3. INTERNAL UPGRADES ---
    add({
      id: 'nav-upgrades_int',
      target: '#setup-tab-upgrades_int',
      content: 'Now let\'s check out the Internal Upgrades.',
      placement: 'bottom',
      data: { tab: 'upgrades_int' } // Pre-loads the tab natively while highlighting the nav button
    });

    add({
      id: 'hide-maxed',
      target: '[data-tour="setup-hide-maxed"]',
      content: 'This toggle hides maxed upgrades to reduce screen clutter. Give it a click!',
      placement: 'auto',
      locale: { skip: 'Skip Int Upgrades' },
      data: { skipTo: 'nav-upgrades_ext' }
    });

    add({
      id: 'upgrades_int_content',
      target: 'div[id^="setup-upg-"]',
      content: 'Please proceed to fill out your Archaeology upgrade levels. Because the screen is unlocked, you can freely scroll through the list! Click next when finished.',
      placement: 'right', // Forces to sit alongside the column so it doesn't obscure it
      locale: { skip: 'Skip Int Upgrades' },
      data: { skipTo: 'nav-upgrades_ext' }
    });

    // --- 4. EXTERNAL UPGRADES ---
    add({
      id: 'nav-upgrades_ext',
      target: '#setup-tab-upgrades_ext',
      content: 'Next up: External Upgrades.',
      placement: 'bottom',
      data: { tab: 'upgrades_ext' }
    });

    const addExt = (extId, content) => {
      add({
        id: `ext-${extId}`,
        target: `#setup-ext-${extId}`,
        content,
        placement: 'auto',
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

    // --- 5. CARDS ---
    add({
      id: 'nav-cards',
      target: '#setup-tab-cards',
      content: 'Almost done! Time for Block Cards.',
      placement: 'bottom',
      data: { tab: 'cards' }
    });

    add({
      id: 'total-infernal',
      target: '[data-tour="setup-total-infernal"]',
      content: 'Total Infernal Cards: Enter your total owned across ALL categories (fishing, arch, etc). This number is highly important because it calculates your massive infernal bonus!',
      placement: 'auto',
      locale: { skip: 'Skip Cards' },
      data: { skipTo: 'nav-idols' }
    });

    add({
      id: 'first-card',
      target: '#setup-card-dirt1',
      content: 'Here is your first Block Card. Set states just like before: 0=Locked, 1=Base, 2=Gilded, 3=Poly, 4=Infernal. Take your time to scroll down and fill them all out.',
      placement: 'right',
      locale: { skip: 'Skip Cards' },
      data: { skipTo: 'nav-idols' }
    });

    // --- 6. IDOLS ---
    add({
      id: 'nav-idols',
      target: '#setup-tab-idols',
      content: 'Finally, let\'s look at Arch Idols.',
      placement: 'bottom',
      data: { tab: 'idols' }
    });

    if (!asc1_unlocked) {
      add({
        id: 'idols-locked',
        target: '#setup-idols-locked',
        content: 'As expected, because you have not unlocked Ascension 1, Arch Idols are hidden. You don\'t need to do anything here!',
        placement: 'auto',
        locale: { skip: 'Skip Idols' },
        data: { skipTo: 'conclusion' }
      });
    } else {
      add({
        id: 'idols-hestia',
        target: '#setup-ext-hestia',
        content: 'Enter your current Hestia Idol level here.',
        placement: 'auto',
        locale: { skip: 'Skip Idols' },
        data: { skipTo: 'conclusion' }
      });
      add({
        id: 'idols-hades',
        target: '#setup-ext-hades',
        content: 'And enter your Hades Idol level here.',
        placement: 'auto',
        locale: { skip: 'Skip Idols' },
        data: { skipTo: 'conclusion' }
      });
    }

    // --- 7. CONCLUSION ---
    add({
      id: 'conclusion',
      target: '[data-tour="main-tab-calc_stats"]',
      content: 'You have successfully finished entering your full Player Setup! CLICK THIS MAIN TAB to verify your stats against the in-game UI to ensure perfect accuracy.',
      placement: 'bottom'
    });

    return s;
  }, [ activeTourId, asc1_unlocked, asc2_unlocked ]);

  const handleCallback = (data) => {
    const { action, index, status, type } = data;

    // 1. HARD TERMINATION
    if (action === 'close' || [ 'finished', 'skipped' ].includes(status)) {
      stopTour();
      return;
    }

    // 2. ⏭️ CUSTOM SECTION SKIPPER INTERCEPTOR
    if (action === 'skip' && type === 'step:after') {
      const currentStep = TOUR_STEPS[ index ];
      if (currentStep?.data?.skipTo) {
        const targetIdx = TOUR_STEPS.findIndex(s => s.id === currentStep.data.skipTo);
        if (targetIdx !== -1) {
           const targetStep = TOUR_STEPS[ targetIdx ];
           
           // If the place we are skipping to requires a tab switch, instantly render it using flushSync
           if (targetStep?.data?.tab) {
             flushSync(() => {
               setActiveSubTab(targetStep.data.tab);
             });
           }
           setLocalStepIndex(targetIdx); // Jump to the new step
           return;
        }
      }
      // If there's no skipTo destination, kill the tour
      stopTour();
      return;
    }

    // 3. 🔄 STANDARD NEXT / PREV ADVANCEMENT
    if (type === 'step:after') {
       const nextIndex = index + (action === 'prev' ? -1 : 1);
       const nextStep = TOUR_STEPS[ nextIndex ];

       // React 18 Magic: Force the tab to render synchronously before Joyride highlights the element
       if (nextStep?.data?.tab) {
         flushSync(() => {
           setActiveSubTab(nextStep.data.tab);
         });
       }
       setLocalStepIndex(nextIndex);
    }
  };

  if (!tourActive || !activeTourId || TOUR_STEPS.length === 0) return null;

  return (
    <JoyrideComponent
      steps={TOUR_STEPS}
      run={tourActive}
      stepIndex={tourStepIndex} // Controlled by our stable local engine
      callback={handleCallback}
      continuous={true}
      showProgress={true}
      showSkipButton={true} // Now acts as our custom "Skip Section" button
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