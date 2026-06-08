// Test setup file
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock IndexedDB (idb-keyval)
global.indexedDB = {
  open: () => ({
    result: {
      transaction: () => ({
        objectStore: () => ({
          get: () => ({ onsuccess: null }),
          put: () => ({ onsuccess: null }),
        }),
      }),
    },
  }),
};

// Mock Web Workers
global.Worker = class Worker {
  constructor(stringUrl) {
    this.url = stringUrl;
    this.onmessage = null;
  }
  postMessage() {}
  terminate() {}
};

// Suppress console warnings in tests
global.console = {
  ...console,
  warn: vi.fn(),
  error: vi.fn(),
};
