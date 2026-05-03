// src/components/TourGuide.jsx
// -> REPLACE ENTIRE FILE WITH:
import React, { useEffect } from 'react';
import * as JoyrideModule from 'react-joyride';
import useStore from '../store';

const JoyrideComponent = JoyrideModule.default?.default || JoyrideModule.default || JoyrideModule.Joyride;

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
      content: 'This is the Profile Box. Because this tour is interactive, you can click the dropdown and view your profiles right now!',
      placement: 'right',
      disableBeacon: true
    },
    {
      target: '#setup-tab-stats', // EXACT ID TARGET
      content: 'Your setup is divided into tabs. We will start with Base Stats.',
      placement: 'bottom',
      disableBeacon: true,
      data: { tab: 'stats' } // Pre-loads the tab while the user reads this
    },
    {
      target: '[data-tour="setup-stat-Str"]', 
      content: 'Enter your Strength here. You can click the box, type a number, or use the +/- buttons while this tooltip is open!',
      placement: 'auto',
      disableBeacon: true
    },
    {
      target: '#setup-tab-upgrades_int', // EXACT ID TARGET
      content: 'Now let\'s check out the Internal Upgrades.',
      placement: 'bottom',
      disableBeacon: true,
      hideBackButton: true, // Prevents a backwards-navigation React race condition
      data: { tab: 'upgrades_int' } // Pre-loads the tab while the user reads this
    },
    {
      target: '[data-tour="setup-hide-maxed"]', 
      content: 'This toggle hides maxed upgrades to reduce screen clutter. Give it a click!',
      placement: 'auto',
      disableBeacon: true
    }
  ]
};

export default function TourGuide() {
  const { tourActive, activeTourId, stopTour, setActiveSubTab, theme } = useStore();

  const handleCallback = (data) => {
    const { action, index, status, type } = data;
    
    // Failsafe: if Joyride completely loses the DOM, kill the tour safely
    if (type === 'error:target_not_found' || type === 'error') {
      console.error(`❌ [TOUR] Target missing on step ${index}. Stopping tour.`);
      stopTour();
      return;
    }

    if ([ 'finished', 'skipped' ].includes(status) || action === 'close') {
      stopTour();
      return;
    }

    // 🕹️ PRE-LOAD DOM INTERCEPTOR
    // This looks at where the user is going. If the NEXT step requires a tab,
    // we switch it immediately so the DOM is fully rendered by the time they get there.
    if (type === 'step:after') {
      const nextIndex = index + (action === 'prev' ? -1 : 1);
      const nextStep = TOUR_STEPS[ activeTourId ]?.[ nextIndex ];

      if (nextStep && nextStep.data && nextStep.data.tab) {
        setActiveSubTab(nextStep.data.tab);
      }
    }
  };

  const currentSteps = (activeTourId && TOUR_STEPS[ activeTourId ]) ? TOUR_STEPS[ activeTourId ] : [ ];

  if (!tourActive || !activeTourId || currentSteps.length === 0) return null;

  return (
    <JoyrideComponent
      steps={currentSteps}
      run={tourActive}
      callback={handleCallback} // We are natively driving the tour (Uncontrolled Mode)
      continuous={true}
      showProgress={true}
      showSkipButton={true}
      spotlightClicks={true}
      spotlightPadding={8}
      disableOverlayClose={true} // Prevents accidental background clicks from canceling the tour
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