// src/components/TourGuide.jsx
// -> REPLACE ENTIRE FILE WITH:
import React, { useEffect } from 'react';
import * as JoyrideModule from 'react-joyride';
import useStore from '../store';

// 🕵️‍♂️ VITE CJS/ESM SAFE UNPACKING
// This strictly targets the component. If Vite double-wraps it, we unwrap it safely.
let Joyride = JoyrideModule.default;
if (Joyride && typeof Joyride !== 'function' && typeof Joyride.default === 'function') {
  Joyride = Joyride.default;
}
const { ACTIONS, EVENTS, STATUS } = JoyrideModule;

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

  // Failsafe logger to ensure we actually grabbed the Component
  useEffect(() => {
    if (tourActive && typeof Joyride !== 'function') {
      console.error("🚨 CRITICAL: react-joyride failed to unpack. Joyride is:", typeof Joyride, Joyride);
    }
  }, [tourActive]);

  const handleCallback = (data) => {
    const { action, index, status, type } = data;

    // Safety fallback: if an element goes missing, kill the tour so the app doesn't lock up
    if (type === EVENTS.TARGET_NOT_FOUND || type === EVENTS.ERROR) {
      console.warn(`[TOUR] Missing target on step ${index}. Stopping tour to prevent UI lock.`);
      stopTour();
      return;
    }

    // Stop if user finishes or clicks the 'X' / 'Skip' button
    if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status) || action === ACTIONS.CLOSE) {
      stopTour();
      return;
    }

    // Advance steps
    if (type === EVENTS.STEP_AFTER) {
      const nextIndex = index + (action === ACTIONS.PREV ? -1 : 1);
      
      if (nextIndex < 0 || nextIndex >= TOUR_STEPS[activeTourId].length) {
        stopTour();
        return;
      }
      
      const nextStep = TOUR_STEPS[activeTourId][nextIndex];
      
      // Handle automatic tab switching
      if (nextStep && nextStep.data && nextStep.data.tab) {
        setActiveSubTab(nextStep.data.tab);
        setTimeout(() => setTourStepIndex(nextIndex), 200);
      } else {
        setTourStepIndex(nextIndex);
      }
    }
  };

  // We keep Joyride mounted and just pass an empty array if no tour is active. 
  // This prevents React lifecycle bugs when dynamically injecting portals.
  const currentSteps = (activeTourId && TOUR_STEPS[activeTourId]) ? TOUR_STEPS[activeTourId] :