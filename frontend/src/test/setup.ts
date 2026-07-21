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

// jsdom fournit un window.scrollTo qui logue "Not implemented" plutôt que de
// rester absent — Modal l'appelle pour restaurer le scroll verrouillé à la
// fermeture, ce qui pollue chaque test. On le remplace inconditionnellement.
window.scrollTo = () => {};
