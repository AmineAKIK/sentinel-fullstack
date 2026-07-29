import { describe, expect, it } from 'vitest';

const SOURCE_FILES = import.meta.glob<string>('../../**/*.{ts,tsx}', {
  eager: true,
  import: 'default',
  query: '?raw',
});
const REDIRECT_PARAMETER_NAMES = [
  'next',
  'redirect',
  'redirectTo',
  'returnTo',
  'return_to',
  'returnUrl',
  'callbackUrl',
  'continue',
  'url',
  'destination',
] as const;

function isTestFile(path: string): boolean {
  return path.includes('/__tests__/') || /\.test\.[jt]sx?$/.test(path);
}

describe('inventaire des destinations React Router', () => {
  const files = Object.entries(SOURCE_FILES);
  const routerConsumers = files.filter(([, source]) =>
    /from ['"]react-router(?:-dom)?['"]/.test(source)
  );
  const productionConsumers = routerConsumers.filter(([path]) => !isTestFile(path));

  it('conserve l’inventaire explicite des consommateurs sans migration de mode', () => {
    // 52 importeurs au HEAD de départ, plus le test d'interaction permanent R1.
    expect(routerConsumers).toHaveLength(53);
    expect(productionConsumers).toHaveLength(32);
  });

  it('ne conserve aucun future flag propre à React Router v6', () => {
    const offenders = files
      .filter(([, source]) => /v7_startTransition|v7_relativeSplatPath/.test(source))
      .map(([path]) => path);

    expect(offenders).toEqual([]);
  });

  it('interdit qu’un paramètre de redirection entrant alimente un futur consommateur', () => {
    const aliases = REDIRECT_PARAMETER_NAMES.join('|');
    const queryRead = new RegExp(`\\.get\\(\\s*(['"])(?:${aliases})\\1\\s*\\)`);
    const offenders = files
      .filter(([path, source]) => !isTestFile(path) && queryRead.test(source))
      .map(([path]) => path);

    expect(offenders).toEqual([]);
  });
});
