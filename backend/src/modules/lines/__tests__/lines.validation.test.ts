import { createLineSchema, updateLineSchema } from '../lines.validation';

const machine = {
  machineId: 'M-01',
  brand: 'Fanuc',
  hasDoubleRobot: false as const,
  robotNumber: 'R-01',
  robotHeads: 4,
};

describe('line validation', () => {
  it('accepte une ligne valide', () => {
    const result = createLineSchema.safeParse({ lineNumber: '00120', machines: [machine] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.lineNumber).toBe('00120');
  });

  it.each(['L120', '12-0', '１２０'])(
    'refuse le numéro de ligne non numérique %p',
    (lineNumber) => {
      expect(createLineSchema.safeParse({ lineNumber, machines: [machine] }).success).toBe(false);
      expect(updateLineSchema.safeParse({ lineNumber }).success).toBe(false);
    }
  );

  it('refuse deux IDs machine identiques sans tenir compte de la casse', () => {
    const result = createLineSchema.safeParse({
      lineNumber: '120',
      machines: [machine, { ...machine, machineId: 'm-01' }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ['machines', 1, 'machineId'],
            message: 'Chaque identifiant machine doit être unique dans la ligne.',
          }),
        ])
      );
    }
  });

  it('applique aussi cette unicité aux remplacements de plan machine', () => {
    expect(
      updateLineSchema.safeParse({
        machines: [machine, { ...machine, machineId: 'M-01' }],
      }).success
    ).toBe(false);
  });
});
