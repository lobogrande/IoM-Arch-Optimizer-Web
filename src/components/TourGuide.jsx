// src/components/TourGuide.jsx
// -> REPLACE ENTIRE FILE WITH:
import React from 'react';
import * as JoyrideModule from 'react-joyride';
import useStore from '../store';

// Safely extract the component to support Vite ESM/CJS interop
const Joyride = JoyrideModule.default || JoyrideModule.Joyride || JoyrideModule;
const { ACTIONS, EVENTS, STATUS } = JoyrideModule;

// EXPLICITLY DEFINE EVERY STEP. No dynamic mapping, to ensure zero beacon bugs.
const TOUR_STEPS = {
  setup:[
    {
      target: '#tour-setup-profiles',
      content: 'Welcome to Player Setup! I use this area to manage your saved loadouts and character states so you can easily swap between different builds.',
      disableBeacon: true,
      placement: 'auto'
    },
    {
      target: '#tour-setup-import',
      content: 'If you have a previously exported JSON from my app, drop it here to load everything instantly.',
      disableBeacon: true,
      placement: 'auto'
    },
    {
      target: '#setup-tab-stats',
      content: 'Your setup is divided into these tabs. Let\'s start with your Base Stats.',
      disableBeacon: true,
      placement: 'auto',
      data: { subTab: 'stats' } // Tells callback to auto-switch tab
    },
    {
      target: '#tour-setup-base-stats',
      content: 'Fill these out to match your in-game values. The maximum caps are calculated and listed for reference.',
      disableBeacon: true,
      placement: 'auto'
    },
    {
      target: '#setup-tab-upgrades_int',
      content: 'Now, let\'s move over to Internal Upgrades...',
      disableBeacon: true,
      placement: 'auto',
      data: { subTab: 'upgrades_int' }
    },
    {
      target: '#tour-setup-int-upgrades',
      content: 'Input the level of your active gem and stat upgrades. Click "Hide Maxed Upgrades" at the top if you want to clean up this view.',
      disableBeacon: true,
      placement: 'auto'
    },
    {
      target: '#setup-tab-upgrades_ext',
      content: 'Next up: External Upgrades.',
      disableBeacon: true,
      placement: 'auto',
      data: { subTab: 'upgrades_ext' }
    },
    {
      target: '#tour-setup-ext-upgrades',
      content: 'This includes pets, Legacy traits, and idols. They heavily change the math under the hood, so ensure these are accurate!',
      disableBeacon: true,
      placement: 'auto'
    },
    {
      target: '#setup-tab-cards',
      content: 'Lastly, let\'s look at your Block Cards.',
      disableBeacon: true,
      placement: 'auto',
      data: { subTab: 'cards' }
    },
    {
      target: '#tour-setup-cards',
      content: 'Configure your blocks here. Be sure to log your total global Infernal Cards at the top, as they drastically boost your multiplier!',
      disableBeacon: true,
      placement: 'auto'
    }
  ]
};

export default function TourGuide() {
  const { 
    tourActive, activeTourId, tourStepIndex, 
    startTour, stopTour, setTourStepIndex, 
    setActiveSubTab, theme 
  } = useStore();

  const handleJoyrideCallback = (data) => {
    const { action, index, status, type } = data;

    // Handle tour completion or user clicking the 'X' or 'Skip'
    if ([ STATUS.FINISHED, STATUS.SKIPPED ].includes(status) || action === ACTIONS.CLOSE) {
      stopTour();
      return;
    }

    // Only advance when the user explicitly clicks Next or Back. 
    // We also watch TARGET_NOT_FOUND to force a skip if an element is hidden, preventing the gray screen trap.
    if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
      const nextIndex = index + (action === ACTIONS.PREV ? -1 : 1);
      
      // Safety check to ensure we don't crash at the end of the array
      if (nextIndex < 0 || nextIndex >= TOUR_STEPS[activeTourId].length) {
        stopTour();
        return;
      }

      const nextStep = TOUR_STEPS[activeTourId][nextIndex];
      
      // Smart Tab Switching:
      if (nextStep && nextStep.data && nextStep.data.subTab) {
        setActiveSubTab(nextStep.data.subTab);
      }
      
      // React 18 automatically batches state updates. By firing these synchronously,
      // the DOM updates the tab and Joyride's target in the exact same render frame,
      // entirely eliminating the "gray screen" async bug.
      setTourStepIndex(nextIndex);
    }
  };

  if (!tourActive || !activeTourId || !TOUR_STEPS[activeTourId]) return null;

  return (
    <Joyride
      steps={TOUR_STEPS[activeTourId]}
      run={tourActive}
      stepIndex={tourStepIndex}
      callback={handleJoyrideCallback}
      continuous={true}
      showProgress={true}
      showSkipButton={true}
      spotlightPadding={8}
      styles={{
        options: {
          zIndex: 99999, // Maxed out to ensure it overrides AG Grid and standard UI
          primaryColor: '#ffa229',
          backgroundColor: theme === 'dark' ? '#262730' : '#FFFFFF',
          textColor: theme === 'dark' ? '#FAFAFA' : '#31333F',
          arrowColor: theme === 'dark' ? '#262730' : '#FFFFFF',
          overlayColor: 'rgba(0, 0, 0, 0.85)', // Darker overlay for better spotlight contrast
        },
        tooltipContainer: {
          textAlign: 'left',
        },
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
        buttonBack: {
          color: theme === 'dark' ? '#A3A8B8' : '#7D808D',
          marginRight: '8px'
        }
      }}
    />
  );
}