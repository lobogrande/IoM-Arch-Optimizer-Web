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

// 🎯 STRUCTURAL TARGETS: We no longer rely on injected IDs. 
// These CSS selectors target the exact layout of your original PlayerSetup.jsx.
const TOUR_STEPS = {
  setup:[
    {
      target: '.md\\:w-1\\/4 > .st-container:nth-of-type(1)', // Player Profiles Box
      content: 'Welcome to Player Setup! I use this area to manage your saved loadouts and character states so you can easily swap between different builds.',
      disableBeacon: true,
      placement: 'right'
    },
    {
      target: '.md\\:w-1\\/4 > .st-container:nth-of-type(3)', // Import Data Box
      content: 'If you have a previously exported JSON from my app, drop it here to load everything instantly.',
      disableBeacon: true,
      placement: 'right'
    },
    {
      target: '.md\\:w-3\\/4 .flex.flex-wrap.border-b button:nth-of-type(1)', // Base Stats Tab Button
      content: 'Your setup is divided into these tabs. Base Stats is where you input your in-game attributes. The maximum caps are calculated for you.',
      disableBeacon: true,
      placement: 'bottom'
    },
    {
      target: '.md\\:w-3\\/4 .flex.flex-wrap.border-b button:nth-of-type(2)', // Int Upgrades Tab Button
      content: 'The Internal Upgrades tab is for your active gems and stat upgrades.',
      disableBeacon: true,
      placement: 'bottom'
    },
    {
      target: '.md\\:w-3\\/4 .flex.flex-wrap.border-b button:nth-of-type(3)', // Ext Upgrades Tab Button
      content: 'External Upgrades includes pets, Legacy traits, and idols. They heavily change the math under the hood, so ensure these are accurate!',
      disableBeacon: true,
      placement: 'bottom'
    },
    {
      target: '.md\\:w-3\\/4 .flex.flex-wrap.border-b button:nth-of-type(4)', // Block Cards Tab Button
      content: 'Lastly, Block Cards. Configure your blocks here, and be sure to log your total global Infernal Cards to boost your multiplier!',
      disableBeacon: true,
      placement: 'bottom'
    }
  ]
};

export default function TourGuide() {
  const { tourActive, activeTourId, stopTour, theme } = useStore();

  const handleCallback = (data) => {
    const { action, status } = data;
    if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status) || action === ACTIONS.CLOSE) {
      stopTour();
    }
  };

  if (!tourActive || !activeTourId || !TOUR_STEPS[activeTourId]) return null;

  return (
    <>
      {/* 💥 BRUTE FORCE CSS: Kill the beacon natively so it can never pulse again */}
      <style>{`
        button[aria-label="Open the dialog"] { display: none !important; }
        .react-joyride__beacon { display: none !important; }
      `}</style>
      
      <Joyride
        steps={TOUR_STEPS[activeTourId]}
        run={tourActive}
        // Removed stepIndex to let Joyride 100% control itself (No React async lag)
        callback={handleCallback}
        continuous={true}
        showProgress={true}
        showSkipButton={true}
        spotlightPadding={4}
        styles={{
          options: {
            zIndex: 99999,
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
          buttonBack: {
            color: theme === 'dark' ? '#A3A8B8' : '#7D808D',
            marginRight: '8px'
          }
        }}
      />
    </>
  );
}