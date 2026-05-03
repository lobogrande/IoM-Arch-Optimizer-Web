// src/components/TourGuide.jsx
// -> REPLACE ENTIRE FILE WITH:
import React from 'react';
import * as JoyrideModule from 'react-joyride';
import useStore from '../store';

// Safely unpack the component. Vite often double-wraps CJS modules in a nested default object.
const Joyride = typeof JoyrideModule.default === 'function' 
  ? JoyrideModule.default 
  : (JoyrideModule.default?.default || Object.values(JoyrideModule).find(v => typeof v === 'function'));

// We are targeting elements that are 100% guaranteed to exist on the screen
const DEBUG_STEPS =[
  {
    target: '#tour-setup-profiles',
    content: 'DEBUG STEP 1: Profiles Box',
    disableBeacon: true,
  },
  {
    target: 'h1', // The main title of your app, guaranteed to exist
    content: 'DEBUG STEP 2: The Main Header!',
    disableBeacon: true,
  }
];

export default function TourGuide() {
  const { tourActive, stopTour } = useStore();

  const handleCallback = (data) => {
    // USING console.warn TO BYPASS BROWSER FILTERS!
    console.warn("🚨[TOUR DEBUG] Event Fired:", data.type, data);

    const { status, action } = data;
    
    // Stop the tour if closed, finished, or skipped
    if (status === 'finished' || status === 'skipped' || action === 'close') {
      console.warn("🚨 [TOUR DEBUG] Tour Finished/Closed. Shutting down.");
      stopTour();
    }
  };

  // Log exactly when the component mounts using a warning
  React.useEffect(() => {
    console.warn("🚨 [TOUR DEBUG] Component Mounted. Active:", tourActive);
  }, [tourActive]);

  if (!tourActive) return null;

  return (
    <Joyride
      steps={DEBUG_STEPS}
      run={tourActive}
      continuous={true}
      showProgress={true}
      showSkipButton={true}
      callback={handleCallback}
      // CRITICAL: We removed stepIndex={...}. Joyride is now entirely driving itself natively.
      styles={{
        options: { zIndex: 10000, primaryColor: '#ffa229' }
      }}
    />
  );
}