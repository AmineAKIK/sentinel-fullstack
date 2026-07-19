import {
  archiveLineService,
  checkLineAvailabilityService,
  checkLineConflictsService,
  createLineService,
  getLineImpactService,
  getLineService,
  updateLineService,
} from '../lines.service';

// ─── mocks ────────────────────────────────────────────────────────────────────

jest.mock('../lines.repository', () => ({
  cancelActiveIncidentsByLine: jest.fn(),
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

jest.mock('../../workshop/workshop.events', () => ({
  logIncidentEvent: jest.fn(),
}));

jest.mock('../../workshop/workshop.arbitration.repository', () => ({
  supersedeOpenArbitrationCases: jest.fn(),
}));

jest.mock('../lines.policy', () => ({
  getLineEventType: jest.fn().mockReturnValue('LINE_UPDATED'),
  hasStructuralLineChanges: jest.fn((updates: Record<string, unknown>) =>
    Boolean(
      updates.lineNumber !== undefined ||
      updates.machines !== undefined ||
      updates.isActive === false
    )
  ),
}));

jest.mock('../../../db/transaction', () => ({
  withTransaction: jest.fn((fn: (client: null) => Promise<unknown>) => fn(null)),
}));

import * as repo from '../lines.repository';
import * as events from '../lines.events';
import * as workshopEvents from '../../workshop/workshop.events';
import * as arbitrationRepo from '../../workshop/workshop.arbitration.repository';

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
  machines: [
    {
      machineId: 'M01',
      brand: 'Fanuc',
      hasDoubleRobot: false as const,
      robotNumber: 'R01',
      robotHeads: 4,
    },
  ],
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
  it("retourne les conflits d'ID machine", async () => {
    jest.mocked(repo.findMachineConflicts).mockResolvedValue(['M01']);
    jest.mocked(repo.lineNumberExists).mockResolvedValue(false);

    const result = await checkLineConflictsService('L02', ['M01']);
    expect(result.machineConflicts).toContain('M01');
    expect(result.lineExists).toBe(false);
  });

  it("retourne un tableau vide quand il n'y a pas de conflit machine", async () => {
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
    expect(events.createLineAuditEvent).toHaveBeenCalledWith(
      line.id,
      1,
      'LINE_CREATED',
      expect.any(Object),
      null
    );
    expect(repo.lineNumberExists).toHaveBeenCalledWith('L01', undefined, null);
    expect(repo.findMachineConflicts).toHaveBeenCalledWith(['M01'], undefined, null);
  });

  it('traduit une collision PostgreSQL concurrente en erreur métier', async () => {
    jest.mocked(repo.lineNumberExists).mockResolvedValue(false);
    jest.mocked(repo.findMachineConflicts).mockResolvedValue([]);
    jest.mocked(repo.createLineData).mockRejectedValue({
      code: '23505',
      constraint: 'idx_production_line_machines_global_id',
    });

    const result = await createLineService(validCreateInput, 1);

    expect(result).toEqual({
      ok: false,
      status: 409,
      code: 'MACHINE_ALREADY_EXISTS',
      message: 'Un ou plusieurs IDs machine existent déjà.',
    });
  });
});

// ─── getLineService ───────────────────────────────────────────────────────────

describe('getLineService', () => {
  it("retourne NOT_FOUND quand la ligne n'existe pas", async () => {
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
  it("retourne NOT_FOUND si la ligne n'existe pas", async () => {
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

  it.each([
    ['renommage', { lineNumber: 'L02' }],
    [
      'reconfiguration des machines',
      {
        machines: [
          {
            machineId: 'M02',
            brand: 'ABB',
            hasDoubleRobot: false as const,
            robotNumber: 'R02',
            robotHeads: 2,
          },
        ],
      },
    ],
  ])('retourne RESOURCE_IN_USE lors du %s d’une ligne utilisée', async (_label, updates) => {
    jest.mocked(repo.getLineForUpdate).mockResolvedValue(mockLineForUpdate());
    jest.mocked(repo.getActiveIncidentCountForLine).mockResolvedValue(1);

    const result = await updateLineService(1, updates, 1);

    expect(result).toMatchObject({ ok: false, status: 409, code: 'RESOURCE_IN_USE' });
    expect(repo.updateLineData).not.toHaveBeenCalled();
    expect(events.createLineAuditEvent).not.toHaveBeenCalled();
    expect(repo.lineNumberExists).not.toHaveBeenCalled();
    expect(repo.findMachineConflicts).not.toHaveBeenCalled();
  });

  it('autorise l’activation d’une ligne inactive sans la traiter comme une mutation structurelle', async () => {
    const current = mockLineForUpdate({ is_active: false });
    const updated = mockLine({ is_active: true });
    jest.mocked(repo.getLineForUpdate).mockResolvedValue(current);
    jest.mocked(repo.updateLineData).mockResolvedValue(updated);
    jest.mocked(events.createLineAuditEvent).mockResolvedValue(undefined);

    const result = await updateLineService(1, { isActive: true }, 1);

    expect(result).toEqual({ ok: true, data: updated });
    expect(repo.getActiveIncidentCountForLine).not.toHaveBeenCalled();
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
    expect(repo.getLineForUpdate).toHaveBeenCalledWith(1, null);
    expect(repo.lineNumberExists).toHaveBeenCalledWith('L02', 1, null);
    expect(repo.updateLineData).toHaveBeenCalledWith(1, { lineNumber: 'L02' }, null);
  });

  it('ne modifie ni ne journalise une mise à jour sans changement réel', async () => {
    const current = mockLineForUpdate({
      machine_sequence: validCreateInput.machines,
    });
    const line = mockLine({ machines: validCreateInput.machines });
    jest.mocked(repo.getLineForUpdate).mockResolvedValue(current);
    jest.mocked(repo.getLineData).mockResolvedValue(line);

    const result = await updateLineService(
      1,
      {
        lineNumber: 'L01',
        isActive: true,
        machines: validCreateInput.machines,
      },
      1
    );

    expect(result).toEqual({ ok: true, data: line });
    expect(repo.updateLineData).not.toHaveBeenCalled();
    expect(events.createLineAuditEvent).not.toHaveBeenCalled();
    expect(repo.lineNumberExists).not.toHaveBeenCalled();
    expect(repo.findMachineConflicts).not.toHaveBeenCalled();
  });
});

// ─── archiveLineService ───────────────────────────────────────────────────────

describe('archiveLineService', () => {
  it('retourne LINE_HAS_ACTIVE_INCIDENTS si la ligne a des incidents actifs sans force', async () => {
    jest.mocked(repo.getLineForUpdate).mockResolvedValue(mockLineForUpdate());
    jest.mocked(repo.getActiveIncidentCountForLine).mockResolvedValue(2);

    const result = await archiveLineService(1, 1, false);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('LINE_HAS_ACTIVE_INCIDENTS');
      expect(result.status).toBe(409);
    }
  });

  it("retourne NOT_FOUND si la ligne n'existe pas", async () => {
    jest.mocked(repo.getLineForUpdate).mockResolvedValue(null);

    const result = await archiveLineService(999, 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('NOT_FOUND');
      expect(result.status).toBe(404);
    }
  });

  it("archive la ligne avec succès quand pas d'incidents actifs", async () => {
    jest.mocked(repo.getLineForUpdate).mockResolvedValue(mockLineForUpdate());
    jest.mocked(repo.getActiveIncidentCountForLine).mockResolvedValue(0);
    jest.mocked(repo.softDeleteLine).mockResolvedValue(true);
    jest.mocked(events.createLineAuditEvent).mockResolvedValue(undefined);

    const result = await archiveLineService(1, 1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.message).toBe('Ligne archivée.');
    expect(events.createLineAuditEvent).toHaveBeenCalledWith(
      1,
      1,
      'LINE_SOFT_DELETED',
      { forcedCanceledIncidents: 0 },
      null
    );
  });

  it('annule les incidents actifs et archive la ligne avec force=true', async () => {
    jest.mocked(repo.getLineForUpdate).mockResolvedValue(mockLineForUpdate());
    jest.mocked(repo.getActiveIncidentCountForLine).mockResolvedValue(3);
    jest.mocked(repo.cancelActiveIncidentsByLine).mockResolvedValue([10, 11, 12]);
    jest.mocked(repo.softDeleteLine).mockResolvedValue(true);
    jest.mocked(events.createLineAuditEvent).mockResolvedValue(undefined);

    const result = await archiveLineService(1, 1, true);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.message).toContain('3 incident(s) actif(s) annulé(s)');
      expect(result.data.canceledIncidents).toBe(3);
    }
    const logIncidentEvent = jest.mocked(workshopEvents.logIncidentEvent);
    expect(logIncidentEvent).toHaveBeenCalledTimes(3);
    expect(arbitrationRepo.supersedeOpenArbitrationCases).toHaveBeenCalledWith(
      [10, 11, 12],
      'Archivage forcé de la ligne',
      null
    );
    expect(logIncidentEvent).toHaveBeenCalledWith(
      10,
      { kind: 'ADMIN', adminId: 1 },
      'INCIDENT_CANCELED',
      { reason: 'line_archived', lineNumber: 'L01' },
      null
    );
  });
});

// ─── getLineImpactService ─────────────────────────────────────────────────────

describe('getLineImpactService', () => {
  it("retourne les compteurs d'impact de la ligne", async () => {
    const impact = { incidents: 12, open_or_pending_incidents: 0 };
    jest.mocked(repo.getLineImpactData).mockResolvedValue(impact);

    const result = await getLineImpactService(1);
    expect(result).toEqual(impact);
  });
});
