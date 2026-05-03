// src/components/TourGuide.jsx
// -> REPLACE ENTIRE FILE WITH:
import React, { Suspense, useEffect } from 'react';
import useStore from '../store';

// 🚀 THE VITE BYPASS: Asynchronously import the default module to avoid CJS mangling
const Joyride = React.lazy(() => import('react-joyride'));

const TOUR_STEPS = {
  setup: [
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

  useEffect(() => {
    if (tourActive) console.warn(`🚨 [TOUR] Mounting Tour: ${activeTourId} at step ${tourStepIndex}`);
  }, [ tourActive, activeTourId, tourStepIndex ]);

  const handleCallback = (data) => {
    const { action, index, status, type } = data;
    
    // Using string literals to bypass the need for named imports
    if (type === 'error:target_not_found' || type === 'error') {
      console.error(`❌ [TOUR] Target missing on step ${index}. Stopping tour.`);
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

  return (
    <Suspense fallback={null}>
      <Joyride
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
    </Suspense>
  );
}