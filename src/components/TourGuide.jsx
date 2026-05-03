// src/components/TourGuide.jsx
// -> REPLACE ENTIRE FILE WITH:
import React, { useEffect } from 'react';
import * as JoyrideModule from 'react-joyride';
import useStore from '../store';

console.warn("🟢 TOURGUIDE V6 LOADED.");

// Safely extract the root component
const JoyrideComponent = JoyrideModule.default?.default || JoyrideModule.default || JoyrideModule.Joyride;

// 🎯 V6 CHANGE: The first step now targets 'body' and centers itself. 
// It requires zero DOM searching, which guarantees it will pop up instantly.
const TOUR_STEPS = {
  setup:[
    {
      target: 'body',
      content: 'Welcome to Player Setup! I use this area to manage your saved loadouts. Click Next to see how it works.',
      placement: 'center', // Centers it like a traditional modal
      disableBeacon: true
    },
    {
      target: '[data-tour="setup-profiles"]',
      content: 'Here is your profile box. Because this walkthrough is interactive, you can click the dropdown right now!',
      placement: 'right',
      disableBeacon: true
    },
    {
      target: '[data-tour="setup-tabs"]',
      content: 'Your setup is divided into these tabs. Let\'s look at Base Stats first.',
      placement: 'bottom',
      disableBeacon: true
    }
  ]
};

export default function TourGuide() {
  const { tourActive, activeTourId, stopTour, theme } = useStore();

  useEffect(() => {
    console.warn(`🔄 V6 Tour State -> Active: ${tourActive}, ID: ${activeTourId}`);
  }, [ tourActive, activeTourId ]);

  const handleCallback = (data) => {
    // 🔥 Log EVERY SINGLE internal thought Joyride has
    console.warn(`🔔 [JOYRIDE EVENT] Type: ${data.type} | Action: ${data.action} | Status: ${data.status}`);

    const { action, status, type } = data;
    
    // Safety fallback
    if (type === 'error:target_not_found' || type === 'error') {
      console.error(`❌ [TOUR] Target missing. Stopping tour to prevent lock.`);
      stopTour();
      return;
    }

    // Stop if user finishes or clicks the 'X' / 'Skip' button
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
      // CRITICAL: We removed stepIndex={...} so it drives itself natively without React 18 interference
      callback={handleCallback}
      continuous={true}
      showProgress={true}
      showSkipButton={true}
      spotlightClicks={true}
      spotlightPadding={8}
      styles={{
        options: {
          zIndex: 999999, // Maxed out
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