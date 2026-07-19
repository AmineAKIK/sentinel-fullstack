import { hasStructuralLineChanges } from '../lines.policy';

describe('hasStructuralLineChanges', () => {
  it.each([
    ['renommage', { lineNumber: 'L02' }],
    ['configuration machine', { machines: [{ machineId: 'M02' }] }],
    ['désactivation', { isActive: false }],
  ])('identifie une mutation structurelle : %s', (_label, updates) => {
    expect(hasStructuralLineChanges(updates)).toBe(true);
  });

  it.each([{}, { isActive: true }])(
    'ne bloque pas une mutation sans impact structurel (%j)',
    (updates) => {
      expect(hasStructuralLineChanges(updates)).toBe(false);
    }
  );
});
