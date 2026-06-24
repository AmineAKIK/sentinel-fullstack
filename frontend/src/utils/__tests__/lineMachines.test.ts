import { describe, it, expect } from 'vitest';
import {
  emptyMachine,
  switchMachineRobotMode,
  normalizeLineMachine,
  validateMachine,
  validateLineForm,
  validateMachineAgainstLine,
  machineRobotSummary,
  lineMachineEquals,
  lineMachinesEqual,
} from '../../utils/lineMachines';
import type { LineMachine } from '../../types';

// ─── helpers ──────────────────────────────────────────────────────────────────

function singleMachine(overrides: Partial<Extract<LineMachine, { hasDoubleRobot: false }>> = {}): LineMachine {
  return {
    machineId: 'M01',
    brand: 'Fanuc',
    hasDoubleRobot: false,
    robotNumber: 'R01',
    robotHeads: 2,
    ...overrides,
  };
}

function doubleMachine(overrides: Partial<Extract<LineMachine, { hasDoubleRobot: true }>> = {}): LineMachine {
  return {
    machineId: 'M02',
    brand: 'KUKA',
    hasDoubleRobot: true,
    leftRobotNumber: 'L1',
    leftRobotHeads: 3,
    rightRobotNumber: 'R1',
    rightRobotHeads: 3,
    ...overrides,
  };
}

// ─── emptyMachine ─────────────────────────────────────────────────────────────

describe('emptyMachine', () => {
  it('returns a single-robot machine with empty fields', () => {
    const m = emptyMachine();
    expect(m.hasDoubleRobot).toBe(false);
    expect(m.machineId).toBe('');
    expect(m.brand).toBe('');
  });
});

// ─── switchMachineRobotMode ───────────────────────────────────────────────────

describe('switchMachineRobotMode', () => {
  it('converts a single machine to double keeping machineId and brand', () => {
    const m = singleMachine({ machineId: 'M01', brand: 'Fanuc' });
    const result = switchMachineRobotMode(m, true);
    expect(result.hasDoubleRobot).toBe(true);
    expect(result.machineId).toBe('M01');
    expect(result.brand).toBe('Fanuc');
  });

  it('converts a double machine back to single keeping machineId and brand', () => {
    const m = doubleMachine({ machineId: 'M02', brand: 'KUKA' });
    const result = switchMachineRobotMode(m, false);
    expect(result.hasDoubleRobot).toBe(false);
    expect(result.machineId).toBe('M02');
    expect(result.brand).toBe('KUKA');
  });
});

// ─── normalizeLineMachine ─────────────────────────────────────────────────────

describe('normalizeLineMachine', () => {
  it('trims whitespace from single-robot fields', () => {
    const m = singleMachine({ machineId: '  M01  ', brand: '  Fanuc  ', robotNumber: '  R01  ' });
    const result = normalizeLineMachine(m);
    expect(result.machineId).toBe('M01');
    expect(result.brand).toBe('Fanuc');
    if (!result.hasDoubleRobot) expect(result.robotNumber).toBe('R01');
  });

  it('trims whitespace from double-robot fields', () => {
    const m = doubleMachine({ machineId: ' M02 ', brand: ' KUKA ', leftRobotNumber: ' L1 ', rightRobotNumber: ' R1 ' });
    const result = normalizeLineMachine(m);
    expect(result.machineId).toBe('M02');
    if (result.hasDoubleRobot) {
      expect(result.leftRobotNumber).toBe('L1');
      expect(result.rightRobotNumber).toBe('R1');
    }
  });
});

// ─── validateMachine ──────────────────────────────────────────────────────────

describe('validateMachine – single robot', () => {
  it('returns no issues for a valid machine', () => {
    expect(validateMachine(singleMachine())).toHaveLength(0);
  });

  it('reports error when machineId is empty', () => {
    const errors = validateMachine(singleMachine({ machineId: '' }));
    expect(errors.some((e) => e.includes('ID machine'))).toBe(true);
  });

  it('reports error when brand is empty', () => {
    const errors = validateMachine(singleMachine({ brand: '' }));
    expect(errors.some((e) => e.includes('marque'))).toBe(true);
  });

  it('reports error when robotNumber is empty', () => {
    const errors = validateMachine(singleMachine({ robotNumber: '' }));
    expect(errors.some((e) => e.includes('robot'))).toBe(true);
  });

  it('reports error when robotHeads < 1', () => {
    const errors = validateMachine(singleMachine({ robotHeads: 0 }));
    expect(errors.some((e) => e.includes('têtes'))).toBe(true);
  });
});

describe('validateMachine – double robot', () => {
  it('returns no issues for a valid double-robot machine', () => {
    expect(validateMachine(doubleMachine())).toHaveLength(0);
  });

  it('reports error when leftRobotNumber is empty', () => {
    const errors = validateMachine(doubleMachine({ leftRobotNumber: '' }));
    expect(errors.some((e) => e.includes('gauche'))).toBe(true);
  });

  it('reports error when rightRobotNumber is empty', () => {
    const errors = validateMachine(doubleMachine({ rightRobotNumber: '' }));
    expect(errors.some((e) => e.includes('droit'))).toBe(true);
  });

  it('reports error when heads count is 0', () => {
    const errors = validateMachine(doubleMachine({ leftRobotHeads: 0 }));
    expect(errors.some((e) => e.includes('têtes'))).toBe(true);
  });
});

// ─── validateLineForm ─────────────────────────────────────────────────────────

describe('validateLineForm', () => {
  it('returns no issues for a valid form', () => {
    expect(validateLineForm({ lineNumber: 'L01', machines: [singleMachine()] })).toHaveLength(0);
  });

  it('requires lineNumber', () => {
    const errors = validateLineForm({ lineNumber: '', machines: [singleMachine()] });
    expect(errors.some((e) => e.includes('numéro de ligne'))).toBe(true);
  });

  it('requires at least one machine', () => {
    const errors = validateLineForm({ lineNumber: 'L01', machines: [] });
    expect(errors.some((e) => e.includes('machine'))).toBe(true);
  });

  it('rejects more than 10 machines', () => {
    const machines = Array.from({ length: 11 }, (_, i) =>
      singleMachine({ machineId: `M${String(i).padStart(2, '0')}` })
    );
    const errors = validateLineForm({ lineNumber: 'L01', machines });
    expect(errors.some((e) => e.includes('10'))).toBe(true);
  });

  it('detects duplicate machineIds (case-insensitive)', () => {
    const machines = [singleMachine({ machineId: 'M01' }), singleMachine({ machineId: 'm01' })];
    const errors = validateLineForm({ lineNumber: 'L01', machines });
    expect(errors.some((e) => e.includes('déjà utilisé'))).toBe(true);
  });
});

// ─── validateMachineAgainstLine ───────────────────────────────────────────────

describe('validateMachineAgainstLine', () => {
  it('returns no issues for a unique valid machine', () => {
    const machines = [singleMachine({ machineId: 'M01' }), singleMachine({ machineId: 'M02' })];
    expect(validateMachineAgainstLine(machines[0], machines, 0)).toHaveLength(0);
  });

  it('detects duplicate machineId with another machine in the list', () => {
    const machines = [singleMachine({ machineId: 'M01' }), singleMachine({ machineId: 'm01' })];
    const errors = validateMachineAgainstLine(machines[1], machines, 1);
    expect(errors.some((e) => e.includes('existe déjà'))).toBe(true);
  });
});

// ─── lineMachineEquals ────────────────────────────────────────────────────────

describe('lineMachineEquals', () => {
  it('considers identical machines equal', () => {
    expect(lineMachineEquals(singleMachine(), singleMachine())).toBe(true);
    expect(lineMachineEquals(doubleMachine(), doubleMachine())).toBe(true);
  });

  it('ignores non-significant whitespace (normalises before comparing)', () => {
    expect(lineMachineEquals(singleMachine({ machineId: ' M01 ' }), singleMachine({ machineId: 'M01' }))).toBe(true);
  });

  it('detects a brand change', () => {
    expect(lineMachineEquals(singleMachine({ brand: 'Fanuc' }), singleMachine({ brand: 'KUKA' }))).toBe(false);
  });

  it('detects a robot mode switch', () => {
    expect(lineMachineEquals(singleMachine(), doubleMachine())).toBe(false);
  });

  it('detects a heads-count change on a single robot', () => {
    expect(lineMachineEquals(singleMachine({ robotHeads: 2 }), singleMachine({ robotHeads: 4 }))).toBe(false);
  });

  it('detects a change on the right robot of a double machine', () => {
    expect(lineMachineEquals(doubleMachine({ rightRobotHeads: 3 }), doubleMachine({ rightRobotHeads: 8 }))).toBe(false);
  });

  it('ignores residual fields of the inactive mode (no false negative)', () => {
    // Une machine simple ayant gardé des champs « double » résiduels reste
    // égale à une machine simple propre : seul le mode actif compte.
    const withResidual = { ...singleMachine(), leftRobotNumber: 'X9', leftRobotHeads: 99 } as LineMachine;
    expect(lineMachineEquals(withResidual, singleMachine())).toBe(true);
  });
});

// ─── lineMachinesEqual ────────────────────────────────────────────────────────

describe('lineMachinesEqual', () => {
  it('considers identical lists equal', () => {
    expect(lineMachinesEqual([singleMachine(), doubleMachine()], [singleMachine(), doubleMachine()])).toBe(true);
  });

  it('detects a different length', () => {
    expect(lineMachinesEqual([singleMachine()], [singleMachine(), singleMachine()])).toBe(false);
  });

  it('is order-sensitive (reordering counts as a change)', () => {
    const a = [singleMachine({ machineId: 'M01' }), singleMachine({ machineId: 'M02' })];
    const b = [singleMachine({ machineId: 'M02' }), singleMachine({ machineId: 'M01' })];
    expect(lineMachinesEqual(a, b)).toBe(false);
  });
});

// ─── machineRobotSummary ──────────────────────────────────────────────────────

describe('machineRobotSummary', () => {
  it('generates a summary for a single-robot machine', () => {
    const summary = machineRobotSummary(singleMachine({ robotNumber: 'R01', robotHeads: 4 }));
    expect(summary).toContain('Robot unique');
    expect(summary).toContain('R01');
    expect(summary).toContain('4 têtes');
  });

  it('generates a summary for a double-robot machine', () => {
    const summary = machineRobotSummary(doubleMachine({ leftRobotNumber: 'L1', leftRobotHeads: 2, rightRobotNumber: 'R1', rightRobotHeads: 3 }));
    expect(summary).toContain('Double robot');
    expect(summary).toContain('L1');
    expect(summary).toContain('R1');
  });
});
