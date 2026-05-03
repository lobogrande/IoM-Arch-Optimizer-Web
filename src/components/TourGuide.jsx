// src/components/TourGuide.jsx
import React from 'react';
import Joyride, { ACTIONS, EVENTS, STATUS } from 'react-joyride';
import useStore from '../store';

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
      placement: 'auto'
    },
    {
      target: '#setup-tab-stats',
      content: 'Your setup is divided into these tabs. Let\'s start with your Base Stats.',
      placement: 'auto',
      data: { subTab: 'stats' } // Tells the callback to automatically switch to this tab!
    },
    {
      target: '#tour-setup-base-stats',
      content: 'Fill these out to match your in-game values. The maximum caps are calculated and listed for reference.',
      placement: 'auto'
    },
    {
      target: '#setup-tab-upgrades_int',
      content: 'Now, let\'s move over to Internal Upgrades...',
      placement: 'auto',
      data: { subTab: 'upgrades_int' }
    },
    {
      target: '#tour-setup-int-upgrades',
      content: 'Input the level of your active gem and stat upgrades. Click "Hide Maxed Upgrades" at the top if you want to clean up this view.',
      placement: 'auto'
    },
    {
      target: '#setup-tab-upgrades_ext',
      content: 'Next up: External Upgrades.',
      placement: 'auto',
      data: { subTab: 'upgrades_ext' }
    },
    {
      target: '#tour-setup-ext-upgrades',
      content: 'This includes pets, Legacy traits, and idols. They heavily change the math under the hood, so ensure these are accurate!',
      placement: 'auto'
    },
    {
      target: '#setup-tab-cards',
      content: 'Lastly, let\'s look at your Block Cards.',
      placement: 'auto',
      data: { subTab: 'cards' }
    },
    {
      target: '#tour-setup-cards',
      content: 'Configure your blocks here. Be sure to log your total global Infernal Cards at the top, as they drastically boost your multiplier!',
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

    // Handle tour completion or dismissal
    if ([ STATUS.FINISHED, STATUS.SKIPPED ].includes(status) || action === ACTIONS.CLOSE) {
      stopTour();
      return;
    }

    // Advance steps (both Forward and Backward)
    if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
      // If it can't find a target, it skips forward to prevent infinite locks
      const nextIndex = index + (action === ACTIONS.PREV ? -1 : 1);
      const nextStep = TOUR_STEPS[activeTourId]?.[nextIndex];
      
      // Smart Tab Switching:
      // If the NEXT step has a subTab payload, we programmaticly switch the tab in Zustand
      // BEFORE Joyride tries to mount and find the target DOM node.
      if (nextStep && nextStep.data && nextStep.data.subTab) {
        setActiveSubTab(nextStep.data.subTab);
        
        // Let React unmount/remount the DOM under the new tab before Joyride targets it
        setTimeout(() => {
          setTourStepIndex(nextIndex);
        }, 50);
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
      callback={handleJoyrideCallback}
      continuous={true}
      showProgress={true}
      showSkipButton={true}
      disableOverlayClose={false}
      spotlightClicks={true}
      scrollOffset={100}
      styles={{
        options: {
          zIndex: 10000,
          primaryColor: '#ffa229',
          backgroundColor: theme === 'dark' ? '#262730' : '#FFFFFF',
          textColor: theme === 'dark' ? '#FAFAFA' : '#31333F',
          arrowColor: theme === 'dark' ? '#262730' : '#FFFFFF',
          overlayColor: 'rgba(0, 0, 0, 0.7)',
        },
        tooltipContainer: {
          textAlign: 'left',
        },
        buttonNext: {
          backgroundColor: '#ffa229',
          color: '#2b2b2b',
          fontWeight: 'bold'
        },
        buttonBack: {
          color: theme === 'dark' ? '#A3A8B8' : '#7D808D',
        }
      }}
    />
  );
}