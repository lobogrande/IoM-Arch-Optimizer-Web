// src/components/TourGuide.jsx
// -> REPLACE ENTIRE FILE WITH:
import React from 'react';
import { flushSync } from 'react-dom'; // ⚡ The React 18 Magic Bullet
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
      target: '#setup-tab-stats',
      content: 'Your setup is divided into tabs. We will start with Base Stats.',
      placement: 'bottom',
      disableBeacon: true,
      data: { requiredTab: 'stats' } // Pre-loads the tab
    },
    {
      target: '[data-tour="setup-stat-Str"]',
      content: 'Enter your Strength here. You can click the box, type a number, or use the +/- buttons while this tooltip is open!',
      placement: 'auto',
      disableBeacon: true,
      data: { requiredTab: 'stats' }
    },
    {
      target: '#setup-tab-upgrades_int',
      content: 'Now let\'s check out the Internal Upgrades.',
      placement: 'bottom',
      disableBeacon: true,
      data: { requiredTab: 'upgrades_int' } // Pre-loads the tab so the next step doesn't crash!
    },
    {
      target: '[data-tour="setup-hide-maxed"]',
      content: 'This toggle hides maxed upgrades to reduce screen clutter. Give it a click!',
      placement: 'auto',
      disableBeacon: true,
      data: { requiredTab: 'upgrades_int' }
    }
  ]
};

export default function TourGuide() {
  const { tourActive, activeTourId, stopTour, setActiveSubTab, theme } = useStore();

  const handleCallback = (data) => {
    const { action, index, status, type } = data;

    // ⚡ REACT 18 SYNCHRONOUS DOM OVERRIDE
    // step:before fires a millisecond before Joyride searches the screen for the target.
    if (type === 'step:before') {
      const upcomingStep = TOUR_STEPS[ activeTourId ]?.[ index ];
      
      if (upcomingStep && upcomingStep.data && upcomingStep.data.requiredTab) {
        // flushSync forces React to instantly paint the new tab to the screen right now,
        // guaranteeing that Joyride's scanner finds it without crashing!
        flushSync(() => {
          setActiveSubTab(upcomingStep.data.requiredTab);
        });
      }
    }

    if (type === 'error:target_not_found' || type === 'error') {
      console.error(`❌ [TOUR] Target missing on step ${index}. Stopping tour.`);
      stopTour();
      return;
    }

    if ([ 'finished', 'skipped' ].includes(status) || action === 'close') {
      stopTour();
    }
  };

  const currentSteps = (activeTourId && TOUR_STEPS[ activeTourId ]) ? TOUR_STEPS[ activeTourId ] : [ ];

  if (!tourActive || !activeTourId || currentSteps.length === 0) return null;

  return (
    <JoyrideComponent
      steps={currentSteps}
      run={tourActive}
      callback={handleCallback} // Uncontrolled Mode (lets Joyride drive natively)
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