// src/components/TourGuide.jsx
// FIND THIS EXACT BLOCK:
// -> REPLACE ENTIRE FILE WITH:
import React from 'react';
import * as JoyrideModule from 'react-joyride';
import useStore from '../store';

// Safely extract the root component
const JoyrideComponent = JoyrideModule.default?.default || JoyrideModule.default || JoyrideModule.Joyride;

// 🎯 THE GOLDEN PATH
// Step 1 stabilizes the tour on the 'body'. The rest interactively guide the user.
const TOUR_STEPS = {
  setup:[
    {
      target: 'body',
      content: 'Welcome to Player Setup! This interactive walkthrough will guide you through configuring your stats. Click Next to begin.',
      placement: 'center',
      disableBeacon: true
    },
    {
      target: '[data-tour="setup-profiles"]',
      content: 'This is the Profile Box. Because this tour is interactive, you can actually click the dropdown and view your profiles right now!',
      placement: 'right',
      disableBeacon: true
    },
    {
      target: '[data-tour="setup-tabs"]',
      content: 'Your setup is divided into tabs. We will start with Base Stats.',
      placement: 'bottom',
      disableBeacon: true,
      data: { tab: 'stats' } // Triggers our automatic tab switch
    },
    {
      target: '[data-tour="setup-stat-Str"]',
      content: 'Enter your Strength here. You can click the box, type a number, or use the +/- buttons while this tooltip is open!',
      placement: 'auto',
      disableBeacon: true
    },
    {
      target: '[data-tour="setup-tabs"]',
      content: 'Now let\'s check out the Internal Upgrades.',
      placement: 'bottom',
      disableBeacon: true,
      data: { tab: 'upgrades_int' } // Automatically switches to the upgrades tab
    },
    {
      target: '[data-tour="setup-hide-maxed"]',
      content: 'This toggle hides maxed upgrades to reduce screen clutter. Give it a click!',
      placement: 'bottom',
      disableBeacon: true
    }
  ]
};

export default function TourGuide() {
  const { tourActive, activeTourId, tourStepIndex, stopTour, setTourStepIndex, setActiveSubTab, theme } = useStore();

  const handleCallback = (data) => {
    const { action, index, status, type } = data;

    if ([ 'finished', 'skipped' ].includes(status) || action === 'close') {
      stopTour();
      return;
    }

    // 🕹️ CONTROLLED MODE ADVANCEMENT
    if (type === 'step:after') {
      const nextIndex = index + (action === 'prev' ? -1 : 1);

      if (nextIndex < 0 || nextIndex >= TOUR_STEPS[ activeTourId ].length) {
        stopTour();
        return;
      }

      const nextStep = TOUR_STEPS[ activeTourId ][ nextIndex ];

      // If the next step has a tab attached, switch the UI first!
      if (nextStep && nextStep.data && nextStep.data.tab) {
        setActiveSubTab(nextStep.data.tab);
        // Wait 300ms to guarantee React mounts the new tab DOM before moving the spotlight
        setTimeout(() => setTourStepIndex(nextIndex), 300);
      } else {
        setTourStepIndex(nextIndex);
      }
    }
  };

  const currentSteps = (activeTourId && TOUR_STEPS[ activeTourId ]) ? TOUR_STEPS[ activeTourId ] : [ ];

  if (!tourActive || !activeTourId || currentSteps.length === 0) return null;

  return (
    <JoyrideComponent
      steps={currentSteps}
      run={tourActive}
      stepIndex={tourStepIndex} // We are back in full control!
      callback={handleCallback}
      continuous={true}
      showProgress={true}
      showSkipButton={true}
      spotlightClicks={true}
      spotlightPadding={8}
      disableOverlayClose={true} // Prevents accidental clicks outside the spotlight from closing the tour
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