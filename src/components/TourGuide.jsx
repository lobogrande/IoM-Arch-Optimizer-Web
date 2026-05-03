// src/components/TourGuide.jsx
// -> REPLACE ENTIRE FILE WITH:
import React from 'react';
import * as RawJoyrideModule from 'react-joyride';
import useStore from '../store';

// 🕵️‍♂️ VITE CJS/ESM INTELLIGENT DECODER
// Vite sometimes double-wraps CJS modules. We look for known constants to find the true root.
const Mod = (RawJoyrideModule && RawJoyrideModule.default && typeof RawJoyrideModule.default === 'object' && RawJoyrideModule.default.ACTIONS) 
  ? RawJoyrideModule.default 
  : RawJoyrideModule;

// Extract the component and constants safely
const JoyrideComponent = typeof Mod === 'function' ? Mod : (Mod.default || Mod.Joyride || Mod.ReactJoyride);
const ACTIONS = Mod.ACTIONS || {};
const EVENTS = Mod.EVENTS || {};
const STATUS = Mod.STATUS || {};

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

  const handleCallback = (data) => {
    const { action, index, status, type } = data;

    // Safety fallback: if an element goes missing, kill the tour so the app doesn't lock up
    if (type === EVENTS.TARGET_NOT_FOUND || type === EVENTS.ERROR) {
      console.warn(`[TOUR] Missing target on step ${index}. Stopping tour.`);
      stopTour();
      return;
    }

    // Stop if user finishes or clicks the 'X' / 'Skip' button
    if ([ STATUS.FINISHED, STATUS.SKIPPED ].includes(status) || action === ACTIONS.CLOSE) {
      stopTour();
      return;
    }

    // Advance steps
    if (type === EVENTS.STEP_AFTER) {
      const nextIndex = index + (action === ACTIONS.PREV ? -1 : 1);
      
      if (nextIndex < 0 || nextIndex >= TOUR_STEPS[ activeTourId ].length) {
        stopTour();
        return;
      }
      
      const nextStep = TOUR_STEPS[ activeTourId ][ nextIndex ];
      
      // Handle automatic tab switching
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

  // 🚨 THE VISUAL DIAGNOSTIC FAILSAFE
  // If Vite mangled the import so badly we couldn't find the React Component, show this red box.
  if (!JoyrideComponent || (typeof JoyrideComponent !== 'function' && typeof JoyrideComponent.render !== 'function')) {
    return (
      <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/80 p-4">
        <div className="bg-red-900 border-2 border-red-500 text-white p-6 rounded shadow-2xl max-w-2xl w-full">
          <h2 className="text-2xl font-bold mb-2">🚨 Vite Dependency Error</h2>
          <p className="mb-4">react-joyride failed to export the UI component. Please send this data to the AI:</p>
          <pre className="bg-black/60 p-4 rounded overflow-auto text-xs font-mono text-red-200">
            {JSON.stringify({
              RawModuleKeys: Object.keys(RawJoyrideModule),
              HasDefault: !!RawJoyrideModule.default,
              DefaultKeys: RawJoyrideModule.default ? Object.keys(RawJoyrideModule.default) : null,
            }, null, 2)}
          </pre>
          <button onClick={stopTour} className="mt-4 px-4 py-2 bg-white text-red-900 font-bold rounded shadow hover:bg-gray-200 transition-colors">
            Force Close Tour
          </button>
        </div>
      </div>
    );
  }

  return (
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
  );
}