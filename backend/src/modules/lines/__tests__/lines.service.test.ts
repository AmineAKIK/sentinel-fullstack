import {
  checkLineAvailabilityService,
  checkLineConflictsService,
  createLineService,
  deleteLineService,
  getLineImpactService,
  getLineService,
  updateLineService,
} from '../lines.service';

// ─── mocks ────────────────────────────────────────────────────────────────────

jest.mock('../lines.repository', () => ({
  createLineData: jest.fn(),
  findMachineConflicts: jest.fn(),
  getActiveIncidentCountForLine: jest.fn(),
  getLineData: jest.fn(),
  getLineForUpdate: jest.fn(),
  getLineImpactData: jest.fn(),
  lineNumberExists: jest.fn(),
  listLinesData: jest.fn(),
  softDeleteLine: jest.fn(),
  updateLineData: jest.fn(),
}));

jest.mock('../lines.events', () => ({
  createLineAuditEvent: jest.fn(),
}));

jest.mock('../lines.policy', () => ({
  getLineEventType: jest.fn().mockReturnValue('LINE_UPDATED'),
}));

import * as repo from '../lines.repository';
import * as events from '../lines.events';

// ─── helpers ──────────────────────────────────────────────────────────────────

function mockLine(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    line_number: 'L01',
    machines: [],
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function mockLineForUpdate(overrides: Record<string, unknown> = {}) {
  return {
    line_number: 'L01',
    is_active: true,
    machine_sequence: [],
    ...overrides,
  };
}

const validCreateInput = {
  lineNumber: 'L01',
  machines: [{ machineId: 'M01', brand: 'Fanuc', hasDoubleRobot: false as const, robotNumber: 'R01', robotHeads: 4 }],
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── checkLineAvailabilityService ─────────────────────────────────────────────

describe('checkLineAvailabilityService', () => {
  it('retourne exists: false quand le numéro de ligne est libre', async () => {
    jest.mocked(repo.lineNumberExists).mockResolvedValue(false);
    const result = await checkLineAvailabilityService('L99');
    expect(result).toEqual({ exists: false });
  });

  it('retourne exists: true quand le numéro de ligne est pris', async () => {
    jest.mocked(repo.lineNumberExists).mockResolvedValue(true);
    const result = await checkLineAvailabilityService('L01');
    expect(result).toEqual({ exists: true });
  });
});

// ─── checkLineConflictsService ────────────────────────────────────────────────

describe('checkLineConflictsService', () => {
  it('retourne les conflits d\'ID machine', async () => {
    jest.mocked(repo.findMachineConflicts).mockResolvedValue(['M01']);
    jest.mocked(repo.lineNumberExists).mockResolvedValue(false);

    const result = await checkLineConflictsService('L02', ['M01']);
    expect(result.machineConflicts).toContain('M01');
    expect(result.lineExists).toBe(false);
  });

  it('retourne un tableau vide quand il n\'y a pas de conflit machine', async () => {
    jest.mocked(repo.findMachineConflicts).mockResolvedValue([]);
    jest.mocked(repo.lineNumberExists).mockResolvedValue(false);

    const result = await checkLineConflictsService('L99', ['M99']);
    expect(result.machineConflicts).toHaveLength(0);
    expect(result.lineExists).toBe(false);
  });

  it('retourne lineExists: true si le numéro de ligne existe déjà', async () => {
    jest.mocked(repo.findMachineConflicts).mockResolvedValue([]);
    jest.mocked(repo.lineNumberExists).mockResolvedValue(true);

    const result = await checkLineConflictsService('L01', []);
    expect(result.lineExists).toBe(true);
  });
});

// ─── createLineService ────────────────────────────────────────────────────────

describe('createLineService', () => {
  it('retourne LINE_ALREADY_EXISTS quand le numéro de ligne est déjà utilisé', async () => {
    jest.mocked(repo.lineNumberExists).mockResolvedValue(true);

    const result = await createLineService(validCreateInput, 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('LINE_ALREADY_EXISTS');
      expect(result.status).toBe(409);
    }
  });

  it('retourne MACHINE_ALREADY_EXISTS si des IDs machine existent déjà', async () => {
    jest.mocked(repo.lineNumberExists).mockResolvedValue(false);
    jest.mocked(repo.findMachineConflicts).mockResolvedValue(['M01']);

    const result = await createLineService(validCreateInput, 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('MACHINE_ALREADY_EXISTS');
      expect(result.status).toBe(409);
    }
  });

  it('crée la ligne avec succès quand les données sont valides', async () => {
    const line = mockLine();
    jest.mocked(repo.lineNumberExists).mockResolvedValue(false);
    jest.mocked(repo.findMachineConflicts).mockResolvedValue([]);
    jest.mocked(repo.createLineData).mockResolvedValue(line);
    jest.mocked(events.createLineAuditEvent).mockResolvedValue(undefined);

    const result = await createLineService(validCreateInput, 1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual(line);
    expect(events.createLineAuditEvent).toHaveBeenCalledWith(line.id, 1, 'LINE_CREATED', expect.any(Object));
  });
});

// ─── getLineService ───────────────────────────────────────────────────────────

describe('getLineService', () => {
  it('retourne NOT_FOUND quand la ligne n\'existe pas', async () => {
    jest.mocked(repo.getLineData).mockResolvedValue(null);

    const result = await getLineService(999);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('NOT_FOUND');
      expect(result.status).toBe(404);
    }
  });

  it('retourne les données de la ligne quand elle existe', async () => {
    const line = mockLine();
    jest.mocked(repo.getLineData).mockResolvedValue(line);

    const result = await getLineService(1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual(line);
  });
});

// ─── updateLineService ────────────────────────────────────────────────────────

describe('updateLineService', () => {
  it('retourne NOT_FOUND si la ligne n\'existe pas', async () => {
    jest.mocked(repo.lineNumberExists).mockResolvedValue(false);
    jest.mocked(repo.getLineForUpdate).mockResolvedValue(null);

    const result = await updateLineService(999, { lineNumber: 'L99' }, 1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_FOUND');
  });

  it('retourne RESOURCE_IN_USE si la ligne a des incidents actifs lors de la désactivation', async () => {
    const current = mockLineForUpdate({ is_active: true });
    jest.mocked(repo.lineNumberExists).mockResolvedValue(false);
    jest.mocked(repo.getLineForUpdate).mockResolvedValue(current);
    jest.mocked(repo.findMachineConflicts).mockResolvedValue([]);
    jest.mocked(repo.getActiveIncidentCountForLine).mockResolvedValue(2);

    const result = await updateLineService(1, { isActive: false }, 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('RESOURCE_IN_USE');
      expect(result.status).toBe(409);
    }
  });

  it('met à jour la ligne avec succès', async () => {
    const current = mockLineForUpdate();
    const updated = mockLine({ line_number: 'L02' });
    jest.mocked(repo.lineNumberExists).mockResolvedValue(false);
    jest.mocked(repo.getLineForUpdate).mockResolvedValue(current);
    jest.mocked(repo.findMachineConflicts).mockResolvedValue([]);
    jest.mocked(repo.getActiveIncidentCountForLine).mockResolvedValue(0);
    jest.mocked(repo.updateLineData).mockResolvedValue(updated);
    jest.mocked(events.createLineAuditEvent).mockResolvedValue(undefined);

    const result = await updateLineService(1, { lineNumber: 'L02' }, 1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual(updated);
  });
});

// ─── deleteLineService ────────────────────────────────────────────────────────

describe('deleteLineService', () => {
  it('retourne RESOURCE_IN_USE si la ligne a des incidents actifs', async () => {
    jest.mocked(repo.getActiveIncidentCountForLine).mockResolvedValue(1);

    const result = await deleteLineService(1, 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('RESOURCE_IN_USE');
      expect(result.status).toBe(409);
    }
  });

  it('retourne NOT_FOUND si la ligne n\'existe pas', async () => {
    jest.mocked(repo.getActiveIncidentCountForLine).mockResolvedValue(0);
    jest.mocked(repo.softDeleteLine).mockResolvedValue(false);

    const result = await deleteLineService(999, 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('NOT_FOUND');
      expect(result.status).toBe(404);
    }
  });

  it('supprime logiquement la ligne avec succès', async () => {
    jest.mocked(repo.getActiveIncidentCountForLine).mockResolvedValue(0);
    jest.mocked(repo.softDeleteLine).mockResolvedValue(true);
    jest.mocked(events.createLineAuditEvent).mockResolvedValue(undefined);

    const result = await deleteLineService(1, 1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.message).toBe('Ligne supprimée.');
    expect(events.createLineAuditEvent).toHaveBeenCalledWith(1, 1, 'LINE_SOFT_DELETED', null);
  });
});

// ─── getLineImpactService ─────────────────────────────────────────────────────

describe('getLineImpactService', () => {
  it('retourne les compteurs d\'impact de la ligne', async () => {
    const impact = { incidents: 12, open_or_pending_incidents: 0 };
    jest.mocked(repo.getLineImpactData).mockResolvedValue(impact);

    const result = await getLineImpactService(1);
    expect(result).toEqual(impact);
  });
});
