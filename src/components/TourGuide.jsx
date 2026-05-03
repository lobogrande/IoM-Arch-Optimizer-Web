// src/components/TourGuide.jsx
// -> REPLACE ENTIRE FILE WITH:
import React from 'react';
import * as JoyrideModule from 'react-joyride';
import useStore from '../store';

// Safely unpack the component for Vite
const Joyride = typeof JoyrideModule.default === 'function' 
  ? JoyrideModule.default 
  : (JoyrideModule.default?.default || Object.values(JoyrideModule).find(v => typeof v === 'function'));
const { ACTIONS, EVENTS, STATUS } = JoyrideModule;

// Target the ALWAYS-VISIBLE elements to eliminate DOM-missing crashes
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
      content: 'Your setup is divided into these tabs. Base Stats is where you input your in-game attributes. The maximum caps are calculated for you.',
      disableBeacon: true,
      placement: 'auto'
    },
    {
      target: '#setup-tab-upgrades_int',
      content: 'The Internal Upgrades tab is for your active gems and stat upgrades.',
      disableBeacon: true,
      placement: 'auto'
    },
    {
      target: '#setup-tab-upgrades_ext',
      content: 'External Upgrades includes pets, Legacy traits, and idols. They heavily change the math under the hood, so ensure these are accurate!',
      disableBeacon: true,
      placement: 'auto'
    },
    {
      target: '#setup-tab-cards',
      content: 'Lastly, Block Cards. Configure your blocks here, and be sure to log your total global Infernal Cards to boost your multiplier!',
      disableBeacon: true,
      placement: 'auto'
    }
  ]
};

export default function TourGuide() {
  const { tourActive, activeTourId, tourStepIndex, stopTour, setTourStepIndex, theme } = useStore();

  const handleCallback = (data) => {
    const { action, index, status, type } = data;

    // Handle tour completion, skipping, or the 'X' button
    if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status) || action === ACTIONS.CLOSE) {
      stopTour();
      return;
    }

    // Advance steps safely without manipulating other UI elements
    if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
      const nextIndex = index + (action === ACTIONS.PREV ? -1 : 1);
      
      // Safety bounds check
      if (nextIndex < 0 || nextIndex >= TOUR_STEPS[activeTourId].length) {
        stopTour();
        return;
      }
      
      setTourStepIndex(nextIndex);
    }
  };

  if (!tourActive || !activeTourId || !TOUR_STEPS[activeTourId]) return null;

  return (
    <Joyride
      steps={TOUR_STEPS[activeTourId]}
      run={tourActive}
      stepIndex={tourStepIndex} // Back in Controlled Mode!
      callback={handleCallback}
      continuous={true}
      showProgress={true}
      showSkipButton={true}
      spotlightPadding={8}
      styles={{
        options: {
          zIndex: 99999,
          primaryColor: '#ffa229',
          backgroundColor: theme === 'dark' ? '#262730' : '#FFFFFF',
          textColor: theme === 'dark' ? '#FAFAFA' : '#31333F',
          arrowColor: theme === 'dark' ? '#262730' : '#FFFFFF',
          overlayColor: 'rgba(0, 0, 0, 0.85)', // Very dark background for focus
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