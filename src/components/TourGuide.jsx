// src/components/TourGuide.jsx
// -> REPLACE ENTIRE FILE WITH:
import React from 'react';
import * as JoyrideModule from 'react-joyride';
import useStore from '../store';

const Joyride = typeof JoyrideModule.default === 'function' 
  ? JoyrideModule.default 
  : (JoyrideModule.default?.default || Object.values(JoyrideModule).find(v => typeof v === 'function'));
const { ACTIONS, EVENTS, STATUS } = JoyrideModule;

// The text and targets are completely customizable by you later.
// We are using data-tour attributes to guarantee it finds the right elements.
const TOUR_STEPS = {
  setup:[
    {
      target: '[data-tour="setup-profiles"]',
      content: 'Welcome to Player Setup! I use this area to manage your saved loadouts. You can interact with this box right now to see how it works.',
      disableBeacon: true,
      placement: 'right'
    },
    {
      target: '[data-tour="setup-tabs"]',
      content: 'Your setup is divided into these tabs. Let\'s look at Base Stats first.',
      disableBeacon: true,
      placement: 'bottom',
      data: { tab: 'stats' } // Tells our callback to switch to this tab
    },
    {
      target: '[data-tour="setup-stat-Str"]',
      content: 'Enter your Strength here. Because this walkthrough is interactive, you can click the input box and type a number right now!',
      disableBeacon: true,
      placement: 'auto'
    },
    {
      target: '[data-tour="setup-tabs"]',
      content: 'Now let\'s check out the Internal Upgrades.',
      disableBeacon: true,
      placement: 'bottom',
      data: { tab: 'upgrades_int' } // Automatically switches the tab
    },
    {
      target: '[data-tour="setup-hide-maxed"]',
      content: 'This toggle is super handy. It hides upgrades you have already maxed out to reduce screen clutter. Give it a click!',
      disableBeacon: true,
      placement: 'bottom'
    }
  ]
};

export default function TourGuide() {
  const { tourActive, activeTourId, tourStepIndex, stopTour, setTourStepIndex, setActiveSubTab, theme } = useStore();

  const handleCallback = (data) => {
    const { action, index, status, type } = data;

    if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status) || action === ACTIONS.CLOSE) {
      stopTour();
      return;
    }

    // Only advance when the user explicitly clicks Next or Back
    if (type === EVENTS.STEP_AFTER) {
      const nextIndex = index + (action === ACTIONS.PREV ? -1 : 1);
      
      if (nextIndex < 0 || nextIndex >= TOUR_STEPS[activeTourId].length) {
        stopTour();
        return;
      }
      
      const nextStep = TOUR_STEPS[activeTourId][nextIndex];
      
      // If the next step is on a different tab, switch it and wait for React to render
      if (nextStep && nextStep.data && nextStep.data.tab) {
        setActiveSubTab(nextStep.data.tab);
        setTimeout(() => {
          setTourStepIndex(nextIndex);
        }, 200); // 200ms is enough for React to paint the new DOM
      } else {
        setTourStepIndex(nextIndex);
      }
    }
  };

  if (!tourActive || !activeTourId || !TOUR_STEPS[activeTourId]) return null;

  return (
    <Joyride
      steps={TOUR_STEPS[activeTourId]}
      run={tourActive}
      stepIndex={tourStepIndex}
      callback={handleCallback}
      continuous={true}
      showProgress={true}
      showSkipButton={true}
      spotlightClicks={true} // 🔥 THIS ALLOWS THE USER TO CLICK/TYPE IN THE APP DURING THE TOUR
      spotlightPadding={8}
      styles={{
        options: {
          zIndex: 99999,
          primaryColor: '#ffa229',
          backgroundColor: theme === 'dark' ? '#262730' : '#FFFFFF',
          textColor: theme === 'dark' ? '#FAFAFA' : '#31333F',
          arrowColor: theme === 'dark' ? '#262730' : '#FFFFFF',
          overlayColor: 'rgba(0, 0, 0, 0.75)',
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