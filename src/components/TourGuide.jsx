// src/components/TourGuide.jsx
// -> REPLACE ENTIRE FILE WITH:
import React from 'react';
import * as JoyrideModule from 'react-joyride';
import useStore from '../store';

const JoyrideComponent = JoyrideModule.default?.default || JoyrideModule.default || JoyrideModule.Joyride;

const TOUR_STEPS = {
  setup:[
    {
      target: 'body',
      content: 'Welcome to Player Setup! This walkthrough is fully interactive. You can click on the app elements while the tour is running. Click Next to begin.',
      placement: 'center',
      disableBeacon: true
    },
    {
      target: '[data-tour="setup-profiles"]',
      content: 'This is the Profile Box. Because this tour is interactive, try clicking the dropdown menu right now!',
      placement: 'right',
      disableBeacon: true
    },
    {
      target: '#setup-tab-stats',
      content: 'We will start with Base Stats. Please CLICK THIS TAB right now, and then click Next.',
      placement: 'bottom',
      disableBeacon: true,
      data: { clickTarget: '#setup-tab-stats' } // Fallback if they forget to click it
    },
    {
      target: '[data-tour="setup-stat-Str"]',
      content: 'Enter your Strength here. You can click the box, type a number, or use the +/- buttons while this tooltip is open!',
      placement: 'auto',
      disableBeacon: true
    },
    {
      target: '#setup-tab-upgrades_int',
      content: 'Now, please CLICK THIS TAB to open your Internal Upgrades, and then click Next.',
      placement: 'bottom',
      disableBeacon: true,
      hideBackButton: true, // Creates a safe "airlock" so they can't crash the tour by going backward
      data: { clickTarget: '#setup-tab-upgrades_int' } // Fallback
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
  const { tourActive, activeTourId, stopTour, theme } = useStore();

  const handleCallback = (data) => {
    const { action, index, status, type } = data;

    // 🖱️ NATIVE DOM CLICKER FALLBACK
    // If the user clicks Next without clicking the tab, we simulate a hardware click
    // on the tab button before Joyride moves to the next step.
    if (type === 'step:after' && action === 'next') {
      const currentStep = TOUR_STEPS[ activeTourId ]?.[ index ];
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

    // 🛑 BULLETPROOF TERMINATION: Catch all possible end-of-tour events
    if (type === 'tour:end' || [ 'finished', 'skipped' ].includes(status) || action === 'close') {
      stopTour();
      return;
    }
  };

  const currentSteps = (activeTourId && TOUR_STEPS[ activeTourId ]) ? TOUR_STEPS[ activeTourId ] : [ ];

  if (!tourActive || !activeTourId || currentSteps.length === 0) return null;

  return (
    <JoyrideComponent
      steps={currentSteps}
      run={tourActive}
      callback={handleCallback} // Uncontrolled mode for ultimate stability
      continuous={true}
      showProgress={true}
      showSkipButton={true}
      spotlightClicks={true}
      spotlightPadding={8}
      disableOverlayClose={true} // Prevents accidental background clicks from breaking the tour
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