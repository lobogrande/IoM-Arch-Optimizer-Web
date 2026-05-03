// src/components/TourGuide.jsx
// -> REPLACE ENTIRE FILE WITH:
import React, { useEffect } from 'react';
import * as JoyrideModule from 'react-joyride';
import useStore from '../store';

const Joyride = JoyrideModule.default || JoyrideModule.Joyride || JoyrideModule;
const { ACTIONS, EVENTS, STATUS } = JoyrideModule;

// Bare-minimum, foolproof steps.
const DEBUG_STEPS =[
  {
    target: '#tour-setup-profiles',
    content: 'DEBUG STEP 1: Profiles Box',
    disableBeacon: true,
  },
  {
    target: '#tour-setup-import',
    content: 'DEBUG STEP 2: Import Box',
    disableBeacon: true,
  }
];

export default function TourGuide() {
  const { tourActive, activeTourId, tourStepIndex, stopTour, setTourStepIndex } = useStore();

  // Log exactly when the component mounts and what Zustand is telling it to do
  useEffect(() => {
    console.log("🚨 [TOUR DEBUG] TourGuide Mount/Update:", { tourActive, activeTourId, tourStepIndex });
  }, [tourActive, activeTourId, tourStepIndex]);

  const handleCallback = (data) => {
    console.log("🚨 [TOUR DEBUG] Joyride Event Fired:", data);
    const { action, index, status, type } = data;

    if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status) || action === ACTIONS.CLOSE) {
      console.log("🚨 [TOUR DEBUG] Tour Stopped/Closed");
      stopTour();
      return;
    }

    if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
      const nextIndex = index + (action === ACTIONS.PREV ? -1 : 1);
      console.log(`🚨 [TOUR DEBUG] Advancing from step ${index} -> to step ${nextIndex}`);
      setTourStepIndex(nextIndex);
    }
  };

  if (!tourActive) return null;

  return (
    <Joyride
      steps={DEBUG_STEPS}
      run={tourActive}
      stepIndex={tourStepIndex}
      callback={handleCallback}
      continuous={true}
      showProgress={true}
      showSkipButton={true}
    />
  );
}