import '@testing-library/jest-dom';

// jsdom n'implémente pas ResizeObserver — mock minimal pour les composants
// qui mesurent leur conteneur (ex: IncidentMetricsBar).
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
