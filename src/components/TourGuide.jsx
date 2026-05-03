// src/components/TourGuide.jsx
// -> REPLACE ENTIRE FILE WITH:
import React, { useEffect } from 'react';
import * as JoyrideModule from 'react-joyride';
import useStore from '../store';

// 🟢 THIS PROVES THE BROWSER DOWNLOADED THE NEW CODE
console.warn("🟢 TOURGUIDE V5 LOADED. Raw Module:", JoyrideModule);

// 🛡️ SAFELY UNPACK THE COMPONENT (Bypass Vite double-wrapping)
let JoyrideComponent = JoyrideModule.default;
if (JoyrideComponent && typeof JoyrideComponent === 'object' && JoyrideComponent.default) {
  JoyrideComponent = JoyrideComponent.default;
}
if (!JoyrideComponent && typeof JoyrideModule.Joyride === 'function') {
  JoyrideComponent = JoyrideModule.Joyride;
}

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
      data: { tab: 'stats' }
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
      data: { tab: 'upgrades_int' }
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

  // Log every time Zustand successfully changes the state
  useEffect(() => {
    console.warn(`🔄 Tour State Updated -> Active: ${tourActive}, Step: ${tourStepIndex}`);
  }, [ tourActive, tourStepIndex ]);

  const handleCallback = (data) => {
    const { action, index, status, type } = data;
    
    if (type === 'error:target_not_found' || type === 'error') {
      console.warn(`[TOUR] Missing target on step ${index}. Stopping tour.`);
      stopTour();
      return;
    }

    if ([ 'finished', 'skipped' ].includes(status) || action === 'close') {
      stopTour();
      return;
    }

    if (type === 'step:after') {
      const nextIndex = index + (action === 'prev' ? -1 : 1);
      
      if (nextIndex < 0 || nextIndex >= TOUR_STEPS[ activeTourId ].length) {
        stopTour();
        return;
      }
      
      const nextStep = TOUR_STEPS[ activeTourId ][ nextIndex ];
      
      if (nextStep && nextStep.data && nextStep.data.tab) {
        setActiveSubTab(nextStep.data.tab);
        setTimeout(() => setTourStepIndex(nextIndex), 200);
      } else {
        setTourStepIndex(nextIndex);
      }
    }
  };

  const currentSteps = (activeTourId && TOUR_STEPS[ activeTourId ]) ? TOUR_STEPS[ activeTourId ] : [ ];

  if (!tourActive || !activeTourId || currentSteps.length === 0) return null;

  // Validate that Vite didn't destroy the component object
  const isComponentValid = typeof JoyrideComponent === 'function' || (JoyrideComponent && typeof JoyrideComponent === 'object' && JoyrideComponent.$$typeof);

  return (
    <>
      {/* FAILSAFE DIAGNOSTIC OVERLAY */}
      {!isComponentValid && (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/80 p-4">
          <div className="bg-red-900 border-2 border-red-500 text-white p-6 rounded shadow-2xl">
            <h2 className="text-2xl font-bold mb-2">🚨 React Joyride Extraction Failed</h2>
            <p>Vite mangled the CJS import. Please send the console logs to the AI.</p>
            <button onClick={stopTour} className="mt-4 px-4 py-2 bg-white text-red-900 font-bold rounded">Force Close</button>
          </div>
        </div>
      )}

      {/* THE ACTUAL TOUR */}
      {isComponentValid && (
        <JoyrideComponent
          steps={currentSteps}
          run={tourActive}
          stepIndex={tourStepIndex}
          callback={handleCallback}
          continuous={true}
          showProgress={true}
          showSkipButton={true}
          spotlightClicks={true}
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
      )}
    </>
  );
}