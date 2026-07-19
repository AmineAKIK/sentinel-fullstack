import { IncidentStatus } from '../../../domain/constants';
import {
  createIncidentService,
  cancelIncidentService,
  consultArbitrationRequestService,
  followIncidentService,
  unfollowIncidentService,
  updateIncidentService,
} from '../workshop.service';

// ─── mocks ────────────────────────────────────────────────────────────────────

jest.mock('../workshop.repository', () => ({
  // isKnowledgeEligible est un prédicat pur (pas d'accès DB) : on garde
  // l'implémentation réelle pour que les tests exercent la vraie règle
  // métier, pas un mock qui la contournerait.
  ...jest.requireActual('../workshop.repository'),
  getActiveWorkshopLine: jest.fn(),
  getIncidentLineLockContext: jest.fn(),
  lockActiveWorkshopLines: jest.fn(),
  fetchIncidentWithUsers: jest.fn(),
  createIncidentData: jest.fn(),
  getIncidentCancelSnapshot: jest.fn(),
  cancelIncidentData: jest.fn(),
  getIncidentById: jest.fn(),
  requestCancelIncident: jest.fn(),
  requestEditIncident: jest.fn(),
  rejectEditIncident: jest.fn(),
  rejectCancelIncident: jest.fn(),
  applyEditRequestIncident: jest.fn(),
  updateIncidentData: jest.fn(),
  invalidateIncident: jest.fn(),
  getBoardData: jest.fn(),
  listActiveWorkshopLines: jest.fn(),
  listIncidents: jest.fn(),
  listIncidentWorkspaceRows: jest.fn(),
  listHistoryEvents: jest.fn(),
  listIncidentEvents: jest.fn(),
  getIncidentMetrics: jest.fn(),
  consultArbitrationRequest: jest.fn(),
  getWorkshopAnalytics: jest.fn(),
  fetchIncidentWithUsersForActor: jest.fn(),
  incidentExists: jest.fn(),
  getIncidentStatus: jest.fn(),
  followIncidentData: jest.fn(),
  unfollowIncidentData: jest.fn(),
}));

jest.mock('../workshop.arbitration.repository', () => ({
  getOpenArbitrationCase: jest.fn(),
  createArbitrationCase: jest.fn(),
  consultArbitrationCase: jest.fn(),
  resolveArbitrationCase: jest.fn(),
  countActiveArbitrationIncidents: jest.fn(),
}));

jest.mock('../workshop.events', () => ({
  logIncidentEvent: jest.fn(),
}));

// withTransaction: execute the callback directly with a null client so tests
// don't need a real DB connection. Repository mocks ignore the client param.
jest.mock('../../../db/transaction', () => ({
  withTransaction: jest.fn((fn: (client: null) => Promise<unknown>) => fn(null)),
}));

jest.mock('../../notifications/notifications.service', () => ({
  notifyDeclarantCancelApproved: jest.fn(() => Promise.resolve()),
  notifyDeclarantCancelRejected: jest.fn(() => Promise.resolve()),
  notifyDeclarantEditApproved: jest.fn(() => Promise.resolve()),
  notifyDeclarantEditRejected: jest.fn(() => Promise.resolve()),
  notifyDeclarantIncidentTaken: jest.fn(() => Promise.resolve()),
  notifyFollowersIncidentCanceled: jest.fn(() => Promise.resolve()),
  notifyFollowersIncidentClosed: jest.fn(() => Promise.resolve()),
  notifyFollowersIncidentSetPending: jest.fn(() => Promise.resolve()),
  notifyFollowersIncidentTaken: jest.fn(() => Promise.resolve()),
  notifyMaintenanceIncidentUrgent: jest.fn(() => Promise.resolve()),
  notifyResponsablesCancelRequested: jest.fn(() => Promise.resolve()),
  notifyResponsablesEditRequested: jest.fn(() => Promise.resolve()),
  notifyTechnicianIncidentCanceled: jest.fn(() => Promise.resolve()),
  notifyTechnicianIncidentInvalidated: jest.fn(() => Promise.resolve()),
  notifyTechnicianResponsibleComment: jest.fn(() => Promise.resolve()),
}));

import * as repo from '../workshop.repository';
import * as events from '../workshop.events';
import * as arbitrationRepo from '../workshop.arbitration.repository';

// ─── helpers ──────────────────────────────────────────────────────────────────

function mockLine() {
  return {
    id: 1,
    line_number: 'L01',
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
}

function mockCancelSnapshot(
  overrides: Partial<{
    status: 'OPEN' | 'PENDING' | 'CLOSED' | 'CANCELED';
    is_taken: boolean;
    taken_by_user_id: number | null;
    user_id: number;
    delete_request: boolean;
    delete_request_reason: string | null;
  }> = {}
) {
  return {
    status: 'OPEN' as const,
    is_taken: false,
    taken_by_user_id: null,
    user_id: 1,
    delete_request: false,
    delete_request_reason: null,
    ...overrides,
  };
}

function mockArbitrationCase(requestType: 'EDIT' | 'CANCEL' = 'EDIT') {
  return {
    id: 12,
    incident_id: 1,
    request_event_id: 44,
    request_type: requestType,
    status: 'ACTIVE' as const,
    payload: requestType === 'EDIT' ? { state: 'INDISPONIBLE' } : null,
    reason: requestType === 'CANCEL' ? 'Erreur de saisie' : null,
    requested_by_user_id: 3,
    requested_at: new Date('2026-07-01T08:00:00.000Z'),
    consulted_by_user_id: null,
    consulted_at: null,
  };
}

function mockIncident(overrides: Record<string, unknown> = {}) {
  const now = new Date('2025-01-01T00:00:00Z');
  return {
    id: 1,
    user_id: 1,
    status: 'OPEN' as IncidentStatus,
    is_taken: false,
    taken_by_user_id: null,
    delete_request: false,
    delete_request_reason: null,
    edit_request: null,
    line_id: 1,
    line_number: 'L01',
    machine_id: 'M01',
    machine_brand: 'Fanuc',
    robot_label: 'R01',
    head_number: 1,
    state: 'DEGRADEE',
    comment: null,
    current_product: null,
    diagnostic: null,
    intervention_note: null,
    is_priority: false,
    display_order: 0,
    responsible_comment: null,
    taken_at: null,
    row_version: '100',
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

const validCreateInput = {
  lineId: 1,
  machineId: 'M01',
  robotLabel: 'R01',
  headNumber: 1,
  state: 'DEGRADEE' as const,
  currentProduct: 'REF-TEST',
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(repo.getIncidentLineLockContext).mockReset();
  jest.mocked(repo.getIncidentLineLockContext).mockResolvedValue({
    line_id: 1,
    edit_request: null,
    row_version: '100',
  });
  jest.mocked(repo.lockActiveWorkshopLines).mockReset();
  jest.mocked(repo.lockActiveWorkshopLines).mockResolvedValue([mockLine()]);
  jest.mocked(arbitrationRepo.getOpenArbitrationCase).mockReset();
  jest.mocked(arbitrationRepo.getOpenArbitrationCase).mockResolvedValue(null);
  jest.mocked(arbitrationRepo.createArbitrationCase).mockReset();
  jest.mocked(arbitrationRepo.consultArbitrationCase).mockReset();
  jest.mocked(arbitrationRepo.resolveArbitrationCase).mockReset();
  jest
    .mocked(repo.fetchIncidentWithUsersForActor)
    .mockImplementation((incidentId: number) => repo.fetchIncidentWithUsers(incidentId));
});

// ─── createIncidentService ────────────────────────────────────────────────────

describe('createIncidentService', () => {
  it("retourne NOT_FOUND si la ligne n'existe pas", async () => {
    jest.mocked(repo.lockActiveWorkshopLines).mockResolvedValue([]);

    const result = await createIncidentService(validCreateInput, 1, 'OPERATOR');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('NOT_FOUND');
      expect(result.status).toBe(404);
    }
  });

  it("retourne VALIDATION_ERROR si la machine n'existe pas dans la ligne", async () => {
    const line = mockLine();
    jest.mocked(repo.lockActiveWorkshopLines).mockResolvedValue([line]);

    const result = await createIncidentService(
      { ...validCreateInput, machineId: 'INEXISTANT' },
      1,
      'OPERATOR'
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('VALIDATION_ERROR');
      expect(result.status).toBe(400);
    }
  });

  it("retourne VALIDATION_ERROR si le robot n'existe pas dans la machine", async () => {
    const line = mockLine();
    jest.mocked(repo.lockActiveWorkshopLines).mockResolvedValue([line]);

    const result = await createIncidentService(
      { ...validCreateInput, robotLabel: 'INEXISTANT' },
      1,
      'OPERATOR'
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('retourne VALIDATION_ERROR si le numéro de tête est invalide (0)', async () => {
    const line = mockLine();
    jest.mocked(repo.lockActiveWorkshopLines).mockResolvedValue([line]);

    const result = await createIncidentService(
      { ...validCreateInput, headNumber: 0 },
      1,
      'OPERATOR'
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('retourne VALIDATION_ERROR si le numéro de tête dépasse le max', async () => {
    const line = mockLine();
    jest.mocked(repo.lockActiveWorkshopLines).mockResolvedValue([line]);

    const result = await createIncidentService(
      { ...validCreateInput, headNumber: 99 },
      1,
      'OPERATOR'
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VALIDATION_ERROR');
  });

  it("crée l'incident avec succès et logge l'événement INCIDENT_CREATED", async () => {
    const line = mockLine();
    const incident = mockIncident();
    jest.mocked(repo.lockActiveWorkshopLines).mockResolvedValue([line]);
    jest.mocked(repo.createIncidentData).mockResolvedValue(1);
    jest.mocked(repo.fetchIncidentWithUsers).mockResolvedValue(incident);
    jest.mocked(events.logIncidentEvent).mockResolvedValue(1);

    const result = await createIncidentService(validCreateInput, 1, 'OPERATOR');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual(incident);
    expect(repo.lockActiveWorkshopLines).toHaveBeenCalledWith([1], null);
    expect(jest.mocked(repo.lockActiveWorkshopLines).mock.invocationCallOrder[0]).toBeLessThan(
      jest.mocked(repo.createIncidentData).mock.invocationCallOrder[0]
    );
    expect(events.logIncidentEvent).toHaveBeenCalledWith(
      1,
      1,
      'INCIDENT_CREATED',
      expect.any(Object),
      null
    );
  });
});

// ─── cancelIncidentService ────────────────────────────────────────────────────

describe('cancelIncidentService', () => {
  it("retourne NOT_FOUND si l'incident n'existe pas", async () => {
    jest.mocked(repo.getIncidentCancelSnapshot).mockResolvedValue(null);

    const result = await cancelIncidentService(999, 1, 'MAINTENANCE');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('NOT_FOUND');
      expect(result.status).toBe(404);
    }
  });

  it("retourne FORBIDDEN si l'OPERATOR tente d'annuler directement", async () => {
    jest.mocked(repo.getIncidentCancelSnapshot).mockResolvedValue(mockCancelSnapshot());

    const result = await cancelIncidentService(1, 1, 'OPERATOR');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
  });

  it('MAINTENANCE peut annuler directement un incident non pris', async () => {
    jest
      .mocked(repo.getIncidentCancelSnapshot)
      .mockResolvedValue(mockCancelSnapshot({ is_taken: false }));
    jest.mocked(repo.cancelIncidentData).mockResolvedValue(true);
    jest.mocked(events.logIncidentEvent).mockResolvedValue(1);

    const result = await cancelIncidentService(1, 1, 'MAINTENANCE');
    expect(result.ok).toBe(true);
    expect(events.logIncidentEvent).toHaveBeenCalledWith(
      1,
      1,
      'INCIDENT_CANCELED',
      expect.any(Object),
      null
    );
  });

  it('RESPONSABLE peut approuver une annulation demandée', async () => {
    jest
      .mocked(repo.getIncidentCancelSnapshot)
      .mockResolvedValue(mockCancelSnapshot({ delete_request: true }));
    jest
      .mocked(arbitrationRepo.getOpenArbitrationCase)
      .mockResolvedValue(mockArbitrationCase('CANCEL'));
    jest.mocked(repo.cancelIncidentData).mockResolvedValue(true);
    jest.mocked(events.logIncidentEvent).mockResolvedValue(1);

    const result = await cancelIncidentService(1, 1, 'RESPONSABLE');
    expect(result.ok).toBe(true);
    expect(events.logIncidentEvent).toHaveBeenCalledWith(
      1,
      1,
      'INCIDENT_CANCELED',
      expect.objectContaining({ mode: 'request_approved' }),
      null
    );
    expect(arbitrationRepo.resolveArbitrationCase).toHaveBeenCalledWith(
      1,
      'CANCEL',
      'APPROVED',
      1,
      null,
      null
    );
  });
});

// ─── followIncidentService ────────────────────────────────────────────────────

describe('followIncidentService', () => {
  it('interdit le suivi manuel aux rôles non responsables', async () => {
    const result = await followIncidentService(1, 7, 'MAINTENANCE');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
  });

  it('permet au responsable de suivre un incident actif', async () => {
    const incident = mockIncident({ is_followed: true });
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);
    jest.mocked(repo.fetchIncidentWithUsers).mockResolvedValue(incident);
    jest.mocked(repo.followIncidentData).mockResolvedValue(true);
    jest.mocked(events.logIncidentEvent).mockResolvedValue(1);

    const result = await followIncidentService(1, 7, 'RESPONSABLE');

    expect(result.ok).toBe(true);
    expect(repo.followIncidentData).toHaveBeenCalledWith(1, 7, null);
    expect(events.logIncidentEvent).toHaveBeenCalledWith(1, 7, 'INCIDENT_FOLLOWED', {}, null);
  });

  it('ne journalise pas un suivi déjà actif', async () => {
    const incident = mockIncident({ is_followed: true });
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);
    jest.mocked(repo.fetchIncidentWithUsers).mockResolvedValue(incident);
    jest.mocked(repo.followIncidentData).mockResolvedValue(false);

    const result = await followIncidentService(1, 7, 'RESPONSABLE');

    expect(result.ok).toBe(true);
    expect(events.logIncidentEvent).not.toHaveBeenCalled();
  });

  it('refuse de suivre un incident terminé', async () => {
    const incident = mockIncident({ status: 'CLOSED' });
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);

    const result = await followIncidentService(1, 7, 'RESPONSABLE');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
    expect(repo.followIncidentData).not.toHaveBeenCalled();
  });
});

describe('unfollowIncidentService', () => {
  it('permet au responsable de retirer un suivi', async () => {
    const incident = mockIncident({ is_followed: false });
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);
    jest.mocked(repo.fetchIncidentWithUsers).mockResolvedValue(incident);
    jest.mocked(repo.unfollowIncidentData).mockResolvedValue(true);
    jest.mocked(events.logIncidentEvent).mockResolvedValue(1);

    const result = await unfollowIncidentService(1, 7, 'RESPONSABLE');

    expect(result.ok).toBe(true);
    expect(repo.unfollowIncidentData).toHaveBeenCalledWith(1, 7, null);
    expect(events.logIncidentEvent).toHaveBeenCalledWith(1, 7, 'INCIDENT_UNFOLLOWED', {}, null);
  });

  it('ne journalise pas un retrait de suivi déjà effectif', async () => {
    const incident = mockIncident({ is_followed: false });
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);
    jest.mocked(repo.fetchIncidentWithUsers).mockResolvedValue(incident);
    jest.mocked(repo.unfollowIncidentData).mockResolvedValue(false);

    const result = await unfollowIncidentService(1, 7, 'RESPONSABLE');

    expect(result.ok).toBe(true);
    expect(events.logIncidentEvent).not.toHaveBeenCalled();
  });
});

// ─── updateIncidentService ────────────────────────────────────────────────────

describe('updateIncidentService – OPERATOR', () => {
  it("retourne NOT_FOUND si l'incident n'existe pas", async () => {
    jest.mocked(repo.getIncidentById).mockResolvedValue(null);

    const result = await updateIncidentService(
      999,
      { requestOnly: true, state: 'INDISPONIBLE' },
      1,
      'OPERATOR'
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_FOUND');
  });

  it('retourne FORBIDDEN si OPERATOR tente une modification directe', async () => {
    const incident = mockIncident();
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);

    const result = await updateIncidentService(1, { state: 'INDISPONIBLE' }, 1, 'OPERATOR');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
  });

  it('OPERATOR peut demander une annulation avec motif', async () => {
    const incident = mockIncident({ is_taken: false });
    const updated = mockIncident({ delete_request: true });
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);
    jest.mocked(repo.requestCancelIncident).mockResolvedValue(1);
    jest.mocked(repo.fetchIncidentWithUsers).mockResolvedValue(updated);
    jest.mocked(events.logIncidentEvent).mockResolvedValue(1);

    const result = await updateIncidentService(
      1,
      { deleteRequest: true, deleteRequestReason: 'Erreur de saisie' },
      1,
      'OPERATOR'
    );
    expect(result.ok).toBe(true);
    expect(events.logIncidentEvent).toHaveBeenCalledWith(
      1,
      1,
      'CANCEL_REQUESTED',
      expect.any(Object),
      null
    );
    expect(arbitrationRepo.createArbitrationCase).toHaveBeenCalledWith(
      {
        incidentId: 1,
        requestEventId: 1,
        requestType: 'CANCEL',
        reason: 'Erreur de saisie',
        requestedByUserId: 1,
      },
      null
    );
  });

  it("retourne VALIDATION_ERROR si demande d'annulation sans motif", async () => {
    const incident = mockIncident({ is_taken: false });
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);

    const result = await updateIncidentService(
      1,
      { deleteRequest: true, deleteRequestReason: '' },
      1,
      'OPERATOR'
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VALIDATION_ERROR');
  });

  it("OPERATOR peut demander une correction et l'événement EDIT_REQUESTED est loggué", async () => {
    const incident = mockIncident();
    const updated = mockIncident({ edit_request: { state: 'INDISPONIBLE' } });
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);
    jest.mocked(repo.requestEditIncident).mockResolvedValue(1);
    jest.mocked(repo.fetchIncidentWithUsers).mockResolvedValue(updated);
    jest.mocked(events.logIncidentEvent).mockResolvedValue(1);

    const result = await updateIncidentService(
      1,
      { requestOnly: true, state: 'INDISPONIBLE' },
      1,
      'OPERATOR'
    );
    expect(result.ok).toBe(true);
    expect(events.logIncidentEvent).toHaveBeenCalledWith(
      1,
      1,
      'EDIT_REQUESTED',
      expect.any(Object),
      null
    );
    expect(arbitrationRepo.createArbitrationCase).toHaveBeenCalledWith(
      {
        incidentId: 1,
        requestEventId: 1,
        requestType: 'EDIT',
        payload: { state: 'INDISPONIBLE' },
        requestedByUserId: 1,
      },
      null
    );
  });

  it('retourne NO_CHANGES sans écriture pour une demande identique', async () => {
    const incident = mockIncident({ current_product: 'REF-10' });
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);

    const result = await updateIncidentService(
      1,
      {
        requestOnly: true,
        lineId: 1,
        machineId: 'M01',
        robotLabel: 'R01',
        headNumber: 1,
        state: 'DEGRADEE',
        comment: '',
        currentProduct: 'REF-10',
      },
      1,
      'OPERATOR'
    );

    expect(result).toMatchObject({ ok: false, status: 400, code: 'NO_CHANGES' });
    expect(repo.requestEditIncident).not.toHaveBeenCalled();
    expect(events.logIncidentEvent).not.toHaveBeenCalled();
    expect(arbitrationRepo.createArbitrationCase).not.toHaveBeenCalled();
  });

  it("ne conserve que les écarts réels dans la demande et son événement d'audit", async () => {
    const incident = mockIncident({ current_product: 'REF-10' });
    const updated = mockIncident({
      state: 'INDISPONIBLE',
      current_product: 'REF-10',
      edit_request: { state: 'INDISPONIBLE' },
    });
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);
    jest.mocked(repo.requestEditIncident).mockResolvedValue(1);
    jest.mocked(repo.fetchIncidentWithUsers).mockResolvedValue(updated);
    jest.mocked(events.logIncidentEvent).mockResolvedValue(17);

    const result = await updateIncidentService(
      1,
      {
        requestOnly: true,
        lineId: 1,
        machineId: 'M01',
        robotLabel: 'R01',
        headNumber: 1,
        state: 'INDISPONIBLE',
        comment: '',
        currentProduct: 'REF-10',
      },
      1,
      'OPERATOR'
    );

    expect(result.ok).toBe(true);
    expect(repo.requestEditIncident).toHaveBeenCalledWith(1, { state: 'INDISPONIBLE' }, null);
    expect(events.logIncidentEvent).toHaveBeenCalledWith(
      1,
      1,
      'EDIT_REQUESTED',
      { changes: { state: 'INDISPONIBLE' }, fields: ['state'] },
      null
    );
    expect(arbitrationRepo.createArbitrationCase).toHaveBeenCalledWith(
      {
        incidentId: 1,
        requestEventId: 17,
        requestType: 'EDIT',
        payload: { state: 'INDISPONIBLE' },
        requestedByUserId: 1,
      },
      null
    );
  });

  it('OPERATOR peut demander une correction de ligne sans contourner la whitelist', async () => {
    const incident = mockIncident();
    const updated = mockIncident({ edit_request: { lineId: 2 } });
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);
    jest.mocked(repo.requestEditIncident).mockResolvedValue(1);
    jest.mocked(repo.fetchIncidentWithUsers).mockResolvedValue(updated);
    jest.mocked(events.logIncidentEvent).mockResolvedValue(1);

    const result = await updateIncidentService(1, { requestOnly: true, lineId: 2 }, 1, 'OPERATOR');
    expect(result.ok).toBe(true);
    expect(repo.requestEditIncident).toHaveBeenCalledWith(1, { lineId: 2 }, null);
  });

  it('rejette une demande de correction mélangée à un champ hors édition', async () => {
    const result = await updateIncidentService(
      1,
      { requestOnly: true, state: 'INDISPONIBLE', isPriority: true },
      1,
      'OPERATOR'
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VALIDATION_ERROR');
    expect(repo.getIncidentById).not.toHaveBeenCalled();
    expect(repo.requestEditIncident).not.toHaveBeenCalled();
  });
});

describe('arbitration workflow guards', () => {
  it('rejects a second request while a normalized case is still open', async () => {
    jest.mocked(repo.getIncidentById).mockResolvedValue(mockIncident());
    jest.mocked(arbitrationRepo.getOpenArbitrationCase).mockResolvedValue(mockArbitrationCase());

    const result = await updateIncidentService(
      1,
      { deleteRequest: true, deleteRequestReason: 'Nouvelle demande' },
      1,
      'OPERATOR'
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('ARBITRATION_ALREADY_PENDING');
    expect(repo.requestCancelIncident).not.toHaveBeenCalled();
  });

  it.each([
    ['take', { isTaken: true }],
    ['close', { status: 'CLOSED', interventionNote: 'Intervention terminée' }],
    ['direct edit', { state: 'INDISPONIBLE' }],
  ] as const)('blocks %s while arbitration is unresolved', async (label, update) => {
    jest
      .mocked(repo.getIncidentById)
      .mockResolvedValue(mockIncident({ is_taken: label === 'close', taken_by_user_id: 7 }));
    jest.mocked(arbitrationRepo.getOpenArbitrationCase).mockResolvedValue(mockArbitrationCase());

    const role = label === 'direct edit' ? 'RESPONSABLE' : 'MAINTENANCE';
    const result = await updateIncidentService(1, update, 7, role);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('ARBITRATION_REQUIRED');
    expect(repo.updateIncidentData).not.toHaveBeenCalled();
  });

  it('blocks direct cancellation when the open case concerns an edit', async () => {
    jest.mocked(repo.getIncidentCancelSnapshot).mockResolvedValue(mockCancelSnapshot());
    jest.mocked(arbitrationRepo.getOpenArbitrationCase).mockResolvedValue(mockArbitrationCase());

    const result = await cancelIncidentService(1, 7, 'MAINTENANCE');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('ARBITRATION_REQUIRED');
    expect(repo.cancelIncidentData).not.toHaveBeenCalled();
  });
});

describe('updateIncidentService – RESPONSABLE', () => {
  it('traite une édition identique comme un succès sans écriture, audit ni suivi automatique', async () => {
    const incident = mockIncident({ current_product: 'REF-10' });
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);
    jest.mocked(repo.fetchIncidentWithUsers).mockResolvedValue(incident);

    const result = await updateIncidentService(
      1,
      {
        lineId: 1,
        machineId: 'M01',
        robotLabel: 'R01',
        headNumber: 1,
        state: 'DEGRADEE',
        comment: '',
        currentProduct: 'REF-10',
      },
      7,
      'RESPONSABLE'
    );

    expect(result.ok).toBe(true);
    expect(repo.lockActiveWorkshopLines).toHaveBeenCalledWith([1, 1], null);
    expect(jest.mocked(repo.lockActiveWorkshopLines).mock.invocationCallOrder[0]).toBeLessThan(
      jest.mocked(repo.getIncidentById).mock.invocationCallOrder[0]
    );
    expect(repo.updateIncidentData).not.toHaveBeenCalled();
    expect(events.logIncidentEvent).not.toHaveBeenCalled();
    expect(repo.followIncidentData).not.toHaveBeenCalled();
  });

  it("retourne CONFLICT si l'incident change entre la lecture préparatoire et son verrouillage", async () => {
    const current = mockIncident({ row_version: '101' });
    jest.mocked(repo.getIncidentById).mockResolvedValue(current);

    const result = await updateIncidentService(1, { state: 'INDISPONIBLE' }, 7, 'RESPONSABLE');

    expect(result).toMatchObject({ ok: false, status: 409, code: 'CONFLICT' });
    expect(repo.updateIncidentData).not.toHaveBeenCalled();
    expect(events.logIncidentEvent).not.toHaveBeenCalled();
  });

  it("RESPONSABLE peut approuver une correction et l'événement EDIT_APPLIED est loggué", async () => {
    const incident = mockIncident({ edit_request: { state: 'INDISPONIBLE' } });
    const updated = mockIncident({ state: 'INDISPONIBLE' });
    const line = mockLine();
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);
    jest.mocked(arbitrationRepo.getOpenArbitrationCase).mockResolvedValue(mockArbitrationCase());
    jest.mocked(repo.lockActiveWorkshopLines).mockResolvedValue([line]);
    jest.mocked(repo.applyEditRequestIncident).mockResolvedValue(1);
    jest.mocked(repo.fetchIncidentWithUsers).mockResolvedValue(updated);
    jest.mocked(events.logIncidentEvent).mockResolvedValue(1);

    const result = await updateIncidentService(1, { applyEditRequest: true }, 1, 'RESPONSABLE');
    expect(result.ok).toBe(true);
    expect(jest.mocked(repo.lockActiveWorkshopLines).mock.invocationCallOrder[0]).toBeLessThan(
      jest.mocked(repo.getIncidentById).mock.invocationCallOrder[0]
    );
    expect(events.logIncidentEvent).toHaveBeenCalledWith(
      1,
      1,
      'EDIT_APPLIED',
      expect.any(Object),
      null
    );
    expect(arbitrationRepo.resolveArbitrationCase).toHaveBeenCalledWith(
      1,
      'EDIT',
      'APPROVED',
      1,
      null,
      null
    );
  });

  it("RESPONSABLE peut refuser une correction et l'événement EDIT_REJECTED est loggué", async () => {
    const incident = mockIncident({ edit_request: { state: 'INDISPONIBLE' } });
    const updated = mockIncident({ edit_request: null });
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);
    jest.mocked(arbitrationRepo.getOpenArbitrationCase).mockResolvedValue(mockArbitrationCase());
    jest.mocked(repo.rejectEditIncident).mockResolvedValue(1);
    jest.mocked(repo.fetchIncidentWithUsers).mockResolvedValue(updated);
    jest.mocked(events.logIncidentEvent).mockResolvedValue(1);

    const result = await updateIncidentService(1, { rejectEditRequest: true }, 1, 'RESPONSABLE');
    expect(result.ok).toBe(true);
    expect(events.logIncidentEvent).toHaveBeenCalledWith(
      1,
      1,
      'EDIT_REJECTED',
      expect.any(Object),
      null
    );
    expect(arbitrationRepo.resolveArbitrationCase).toHaveBeenCalledWith(
      1,
      'EDIT',
      'REJECTED',
      1,
      null,
      null
    );
  });

  it("RESPONSABLE peut invalider un incident clôturé et l'événement INCIDENT_INVALIDATED est loggué", async () => {
    const incident = mockIncident({ status: 'CLOSED' });
    const updated = mockIncident({ status: 'OPEN' });
    const line = mockLine();
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);
    jest.mocked(repo.getActiveWorkshopLine).mockResolvedValue(line);
    jest.mocked(repo.invalidateIncident).mockResolvedValue(1);
    jest.mocked(repo.fetchIncidentWithUsers).mockResolvedValue(updated);
    jest.mocked(events.logIncidentEvent).mockResolvedValue(1);

    const result = await updateIncidentService(
      1,
      { status: 'CANCELED', invalidationReason: 'Incident incorrect' },
      1,
      'RESPONSABLE'
    );
    expect(result.ok).toBe(true);
    expect(events.logIncidentEvent).toHaveBeenCalledWith(
      1,
      1,
      'INCIDENT_INVALIDATED',
      expect.any(Object),
      null
    );
  });

  it('retourne VALIDATION_ERROR si invalidation sans motif', async () => {
    const incident = mockIncident({ status: 'CLOSED' });
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);

    const result = await updateIncidentService(
      1,
      { status: 'CANCELED', invalidationReason: '' },
      1,
      'RESPONSABLE'
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VALIDATION_ERROR');
  });
});

describe('updateIncidentService – MAINTENANCE', () => {
  it('MAINTENANCE ne peut pas passer en PENDING sans diagnostic', async () => {
    const incident = mockIncident({ is_taken: true });
    const line = mockLine();
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);
    jest.mocked(repo.getActiveWorkshopLine).mockResolvedValue(line);

    const result = await updateIncidentService(1, { status: 'PENDING' }, 1, 'MAINTENANCE');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VALIDATION_ERROR');
  });

  it("MAINTENANCE peut passer en PENDING avec diagnostic et l'événement STATUS_CHANGED est loggué", async () => {
    const incident = mockIncident({ is_taken: true });
    const updated = mockIncident({ status: 'PENDING', diagnostic: 'Capteur défaillant' });
    const line = mockLine();
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);
    jest.mocked(repo.getActiveWorkshopLine).mockResolvedValue(line);
    jest.mocked(repo.updateIncidentData).mockResolvedValue(1);
    jest.mocked(repo.fetchIncidentWithUsers).mockResolvedValue(updated);
    jest.mocked(events.logIncidentEvent).mockResolvedValue(1);

    const result = await updateIncidentService(
      1,
      { status: 'PENDING', diagnostic: 'Capteur défaillant' },
      1,
      'MAINTENANCE'
    );
    expect(result.ok).toBe(true);
    expect(events.logIncidentEvent).toHaveBeenCalledWith(
      1,
      1,
      'INCIDENT_SET_PENDING',
      expect.objectContaining({ from: 'OPEN', to: 'PENDING' }),
      null
    );
  });

  it("MAINTENANCE ne peut pas clôturer sans note d'intervention", async () => {
    const incident = mockIncident({ is_taken: true });
    const line = mockLine();
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);
    jest.mocked(repo.getActiveWorkshopLine).mockResolvedValue(line);

    const result = await updateIncidentService(1, { status: 'CLOSED' }, 1, 'MAINTENANCE');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VALIDATION_ERROR');
  });

  it("MAINTENANCE peut clôturer avec note d'intervention et l'événement STATUS_CHANGED est loggué", async () => {
    const incident = mockIncident({ is_taken: true });
    const updated = mockIncident({ status: 'CLOSED', intervention_note: 'Capteur remplacé' });
    const line = mockLine();
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);
    jest.mocked(repo.getActiveWorkshopLine).mockResolvedValue(line);
    jest.mocked(repo.updateIncidentData).mockResolvedValue(1);
    jest.mocked(repo.fetchIncidentWithUsers).mockResolvedValue(updated);
    jest.mocked(events.logIncidentEvent).mockResolvedValue(1);

    const result = await updateIncidentService(
      1,
      { status: 'CLOSED', interventionNote: 'Capteur remplacé' },
      1,
      'MAINTENANCE'
    );
    expect(result.ok).toBe(true);
    expect(events.logIncidentEvent).toHaveBeenCalledWith(
      1,
      1,
      'INCIDENT_CLOSED',
      expect.objectContaining({ from: 'OPEN', to: 'CLOSED' }),
      null
    );
  });
});

// ─── services passthrough (board, lines, incidents, history, knowledge, metrics, analytics) ────

import {
  getBoardDataService,
  listWorkshopLinesService,
  listIncidentsService,
  listHistoryIncidentsService,
  listKnowledgeIncidentsService,
  getHistoryIncidentService,
  getKnowledgeIncidentService,
  listHistoryEventsService,
  listIncidentEventsService,
  getIncidentMetricsService,
  getWorkshopAnalyticsService,
} from '../workshop.service';

describe('getBoardDataService', () => {
  it('retourne les données du board', async () => {
    const boardData = {
      lines: [],
      incidents: [],
      metrics: { total: 0, open: 0, pending: 0, open_over_7d: 0 },
    };
    jest.mocked(repo.getBoardData).mockResolvedValue(boardData);
    const result = await getBoardDataService();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual(boardData);
    expect(repo.getBoardData).toHaveBeenCalledTimes(1);
  });
});

describe('listWorkshopLinesService', () => {
  it('retourne les lignes actives', async () => {
    const lines = [{ id: 1, line_number: 'L01', machines: [] }];
    jest.mocked(repo.listActiveWorkshopLines).mockResolvedValue(lines);
    const result = await listWorkshopLinesService();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual(lines);
  });
});

describe('listIncidentsService', () => {
  it('retourne tous les incidents actifs', async () => {
    const incidents = [mockIncident()];
    jest.mocked(repo.listIncidents).mockResolvedValue(incidents);
    const result = await listIncidentsService(7, 'RESPONSABLE');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual(incidents);
    expect(repo.listIncidents).toHaveBeenCalledWith(7, 'RESPONSABLE');
  });
});

describe('listHistoryIncidentsService', () => {
  it('transmet la query au repository en mode history', async () => {
    const rows = [mockIncident({ status: 'CLOSED' })];
    jest.mocked(repo.listIncidentWorkspaceRows).mockResolvedValue(rows);
    const result = await listHistoryIncidentsService({ status: 'CLOSED' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual(rows);
    expect(repo.listIncidentWorkspaceRows).toHaveBeenCalledWith({ status: 'CLOSED' }, 'history');
  });
});

describe('listKnowledgeIncidentsService', () => {
  it('transmet la query au repository en mode knowledge', async () => {
    const rows = [mockIncident({ status: 'CLOSED', intervention_note: 'Ok' })];
    jest.mocked(repo.listIncidentWorkspaceRows).mockResolvedValue(rows);
    const result = await listKnowledgeIncidentsService({ q: 'robot' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual(rows);
    expect(repo.listIncidentWorkspaceRows).toHaveBeenCalledWith({ q: 'robot' }, 'knowledge');
  });
});

describe('getHistoryIncidentService', () => {
  it('retourne NOT_FOUND si incident absent', async () => {
    jest.mocked(repo.fetchIncidentWithUsers).mockResolvedValue(null);
    const result = await getHistoryIncidentService(999);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_FOUND');
  });

  it("retourne l'incident si trouvé", async () => {
    const incident = mockIncident({ status: 'CLOSED' });
    jest.mocked(repo.fetchIncidentWithUsers).mockResolvedValue(incident);
    const result = await getHistoryIncidentService(1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual(incident);
  });
});

describe('getKnowledgeIncidentService', () => {
  it('retourne NOT_FOUND si incident absent', async () => {
    jest.mocked(repo.fetchIncidentWithUsers).mockResolvedValue(null);
    const result = await getKnowledgeIncidentService(999);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_FOUND');
  });

  it('retourne NOT_FOUND si incident non clôturé', async () => {
    const incident = mockIncident({ status: 'OPEN', intervention_note: 'Note' });
    jest.mocked(repo.fetchIncidentWithUsers).mockResolvedValue(incident);
    const result = await getKnowledgeIncidentService(1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_FOUND');
  });

  it('retourne NOT_FOUND si intervention_note vide', async () => {
    const incident = mockIncident({ status: 'CLOSED', intervention_note: '   ' });
    jest.mocked(repo.fetchIncidentWithUsers).mockResolvedValue(incident);
    const result = await getKnowledgeIncidentService(1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_FOUND');
  });

  it('retourne la fiche si clôturée avec note', async () => {
    const incident = mockIncident({ status: 'CLOSED', intervention_note: 'Capteur remplacé' });
    jest.mocked(repo.fetchIncidentWithUsers).mockResolvedValue(incident);
    const result = await getKnowledgeIncidentService(1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual(incident);
  });
});

describe('listHistoryEventsService', () => {
  it('transmet la query au repository pour un RESPONSABLE', async () => {
    const events_data = [{ id: 1, event_type: 'INCIDENT_CREATED' }];
    jest.mocked(repo.listHistoryEvents).mockResolvedValue(events_data);
    const result = await listHistoryEventsService({ lineId: '1' }, 'RESPONSABLE');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual(events_data);
    expect(repo.listHistoryEvents).toHaveBeenCalledWith({ lineId: '1' });
  });

  it('retourne FORBIDDEN pour un rôle non RESPONSABLE', async () => {
    const result = await listHistoryEventsService({ lineId: '1' }, 'MAINTENANCE');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
    expect(repo.listHistoryEvents).not.toHaveBeenCalled();
  });
});

describe('listIncidentEventsService', () => {
  it("retourne les événements d'un incident", async () => {
    const evts = [{ id: 1, event_type: 'INCIDENT_CREATED', created_at: new Date() }];
    jest.mocked(repo.getIncidentStatus).mockResolvedValue({ status: 'OPEN' });
    jest.mocked(repo.listIncidentEvents).mockResolvedValue(evts);
    const result = await listIncidentEventsService(1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual(evts);
    expect(repo.listIncidentEvents).toHaveBeenCalledWith(1);
  });

  it("retourne NOT_FOUND au lieu d'une liste vide pour un incident inexistant", async () => {
    jest.mocked(repo.getIncidentStatus).mockResolvedValue(null);

    const result = await listIncidentEventsService(999);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_FOUND');
    expect(repo.listIncidentEvents).not.toHaveBeenCalled();
  });
});

describe('getIncidentMetricsService', () => {
  it('retourne les métriques', async () => {
    const metrics = {
      total: 5,
      open: 3,
      pending: 1,
      priority: 1,
      taken: 2,
      not_taken: 1,
      assigned_to_me: 1,
      followed: 2,
      followed_resolved: 1,
      arbitration_unread: 0,
      open_over_7d: 0,
      closed_today: 0,
    };
    jest.mocked(repo.getIncidentMetrics).mockResolvedValue(metrics);
    const result = await getIncidentMetricsService(7, 'RESPONSABLE');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual(metrics);
    expect(repo.getIncidentMetrics).toHaveBeenCalledWith(7, 'RESPONSABLE');
  });
});

describe('consultArbitrationRequestService', () => {
  it('refuse les rôles non responsables', async () => {
    const result = await consultArbitrationRequestService(1, 7, 'MAINTENANCE', 'EDIT');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
    expect(arbitrationRepo.consultArbitrationCase).not.toHaveBeenCalled();
  });

  it("passe le dossier d'arbitrage en consultation pour un responsable", async () => {
    const incident = mockIncident({ edit_request: { state: 'DEGRADEE' } });
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);
    jest.mocked(arbitrationRepo.getOpenArbitrationCase).mockResolvedValue({
      id: 12,
      incident_id: 1,
      request_event_id: 44,
      request_type: 'EDIT',
      status: 'ACTIVE',
      payload: { state: 'DEGRADEE' },
      reason: null,
      requested_by_user_id: 3,
      requested_at: new Date('2026-07-01T08:00:00.000Z'),
      consulted_by_user_id: null,
      consulted_at: null,
    });
    jest.mocked(arbitrationRepo.consultArbitrationCase).mockResolvedValue({
      id: 12,
      incident_id: 1,
      request_event_id: 44,
      request_type: 'EDIT',
      status: 'CONSULTED',
      payload: { state: 'DEGRADEE' },
      reason: null,
      requested_by_user_id: 3,
      requested_at: new Date('2026-07-01T08:00:00.000Z'),
      consulted_by_user_id: 7,
      consulted_at: new Date('2026-07-01T09:00:00.000Z'),
    });
    jest.mocked(repo.fetchIncidentWithUsersForActor).mockResolvedValue(incident);
    jest.mocked(events.logIncidentEvent).mockResolvedValue(45);

    const result = await consultArbitrationRequestService(1, 7, 'RESPONSABLE', 'EDIT');

    expect(result).toEqual({ ok: true, data: { consulted: 1, incident } });
    expect(arbitrationRepo.consultArbitrationCase).toHaveBeenCalledWith(1, 'EDIT', 7, null);
    expect(events.logIncidentEvent).toHaveBeenCalledWith(
      1,
      7,
      'ARBITRATION_CONSULTED',
      { requestType: 'EDIT', arbitrationCaseId: 12 },
      null
    );
  });

  it('reste idempotent quand le dossier a déjà été consulté', async () => {
    const incident = mockIncident({ edit_request: { state: 'DEGRADEE' } });
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);
    jest.mocked(arbitrationRepo.getOpenArbitrationCase).mockResolvedValue({
      id: 12,
      incident_id: 1,
      request_event_id: 44,
      request_type: 'EDIT',
      status: 'CONSULTED',
      payload: { state: 'DEGRADEE' },
      reason: null,
      requested_by_user_id: 3,
      requested_at: new Date('2026-07-01T08:00:00.000Z'),
      consulted_by_user_id: 7,
      consulted_at: new Date('2026-07-01T09:00:00.000Z'),
    });
    jest.mocked(repo.fetchIncidentWithUsersForActor).mockResolvedValue(incident);

    const result = await consultArbitrationRequestService(1, 7, 'RESPONSABLE', 'EDIT');

    expect(result).toEqual({ ok: true, data: { consulted: 0, incident } });
    expect(arbitrationRepo.consultArbitrationCase).not.toHaveBeenCalled();
    expect(events.logIncidentEvent).not.toHaveBeenCalled();
  });
});

describe('getWorkshopAnalyticsService', () => {
  it('transmet la query au repository', async () => {
    const analytics = {
      total: 10,
      open: 5,
      pending: 2,
      closed: 3,
      priority: 1,
      active: 7,
      not_taken: 3,
      urgent_not_taken: 0,
      taken: 4,
      open_over_24h: 1,
      open_over_7d: 0,
      oldest_active_seconds: null,
      median_take_seconds: null,
      avg_take_seconds: null,
      median_close_seconds: null,
      avg_close_seconds: null,
      by_state: [],
      by_line: [],
      by_machine: [],
      trend: [],
    };
    jest.mocked(repo.getWorkshopAnalytics).mockResolvedValue(analytics);
    const result = await getWorkshopAnalyticsService({ start: '2025-01-01', end: '2025-01-31' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual(analytics);
    expect(repo.getWorkshopAnalytics).toHaveBeenCalledWith({
      start: '2025-01-01',
      end: '2025-01-31',
    });
  });

  it('plafonne à 90 jours quand ni start ni end ne sont fournis', async () => {
    jest.mocked(repo.getWorkshopAnalytics).mockResolvedValue({} as never);
    await getWorkshopAnalyticsService({ lineId: 3 });

    expect(repo.getWorkshopAnalytics).toHaveBeenCalledTimes(1);
    const calledWith = jest.mocked(repo.getWorkshopAnalytics).mock.calls[0][0] as {
      start: string;
      lineId: number;
    };
    expect(calledWith.lineId).toBe(3);
    const daysSince = (Date.now() - new Date(calledWith.start).getTime()) / (1000 * 60 * 60 * 24);
    expect(daysSince).toBeGreaterThan(89);
    expect(daysSince).toBeLessThan(91);
  });

  it('ne plafonne pas si end seul est fourni (borne explicite)', async () => {
    jest.mocked(repo.getWorkshopAnalytics).mockResolvedValue({} as never);
    await getWorkshopAnalyticsService({ end: '2025-01-31' });

    expect(repo.getWorkshopAnalytics).toHaveBeenCalledWith({ end: '2025-01-31' });
  });
});

// ─── cas limites manquants ─────────────────────────────────────────────────────

describe('updateIncidentService – cas limites', () => {
  it('rejette un payload vide avant toute lecture DB', async () => {
    const result = await updateIncidentService(1, {}, 1, 'RESPONSABLE');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VALIDATION_ERROR');
    expect(repo.getIncidentById).not.toHaveBeenCalled();
  });

  it('rejette un champ technique caché dans une modification descriptive', async () => {
    const result = await updateIncidentService(
      1,
      { state: 'INDISPONIBLE', diagnostic: 'injection' },
      1,
      'RESPONSABLE'
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VALIDATION_ERROR');
    expect(repo.updateIncidentData).not.toHaveBeenCalled();
  });

  it('rejette une action de statut mélangée à une autre action', async () => {
    const result = await updateIncidentService(
      1,
      { status: 'CLOSED', interventionNote: 'Ok', isPriority: true },
      1,
      'MAINTENANCE'
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VALIDATION_ERROR');
    expect(repo.getIncidentById).not.toHaveBeenCalled();
  });

  it('retourne NOT_FOUND si requestCancelIncident retourne null (race condition)', async () => {
    const incident = mockIncident({ is_taken: false });
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);
    jest.mocked(repo.requestCancelIncident).mockResolvedValue(null);

    const result = await updateIncidentService(
      1,
      { deleteRequest: true, deleteRequestReason: 'Erreur' },
      1,
      'OPERATOR'
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_FOUND');
  });

  it('retourne NOT_FOUND si rejectEditIncident retourne null (race condition)', async () => {
    const incident = mockIncident({ edit_request: { state: 'ARRET' } });
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);
    jest.mocked(arbitrationRepo.getOpenArbitrationCase).mockResolvedValue(mockArbitrationCase());
    jest.mocked(repo.rejectEditIncident).mockResolvedValue(null);

    const result = await updateIncidentService(1, { rejectEditRequest: true }, 1, 'RESPONSABLE');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_FOUND');
  });

  it('retourne FORBIDDEN si CLOSE tenté sur incident PENDING (policy bloque avant BAD_REQUEST)', async () => {
    const incident = mockIncident({
      status: 'PENDING',
      is_taken: true,
      intervention_note: 'Note existante',
    });
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);

    const result = await updateIncidentService(
      1,
      { status: 'CLOSED', interventionNote: 'Note' },
      1,
      'MAINTENANCE'
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
  });

  it('retourne NOT_FOUND si updateIncidentData retourne null (race condition)', async () => {
    const incident = mockIncident({ is_taken: true });
    const line = mockLine();
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);
    jest.mocked(repo.getActiveWorkshopLine).mockResolvedValue(line);
    jest.mocked(repo.updateIncidentData).mockResolvedValue(null);

    const result = await updateIncidentService(1, { isPriority: true }, 1, 'RESPONSABLE');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_FOUND');
  });

  it("ne valide pas la sélection si aucun champ de sélection n'est modifié", async () => {
    const incident = mockIncident({ is_taken: false });
    const updated = mockIncident({ is_priority: true });
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);
    jest.mocked(repo.updateIncidentData).mockResolvedValue(1);
    jest.mocked(repo.fetchIncidentWithUsers).mockResolvedValue(updated);
    jest.mocked(events.logIncidentEvent).mockResolvedValue(1);

    const result = await updateIncidentService(1, { isPriority: true }, 1, 'RESPONSABLE');
    expect(result.ok).toBe(true);
    expect(repo.getActiveWorkshopLine).not.toHaveBeenCalled();
  });
});

describe('cancelIncidentService – cas limites', () => {
  it("retourne FORBIDDEN si OPERATOR tente d'annuler un incident pris en charge", async () => {
    const snapshot = mockCancelSnapshot({ is_taken: true });
    jest.mocked(repo.getIncidentCancelSnapshot).mockResolvedValue(snapshot);

    const result = await cancelIncidentService(1, 1, 'OPERATOR');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
  });
});

// ─── policy : EDIT_AFTER_TAKE ─────────────────────────────────────────────────

describe('updateIncidentService – EDIT_AFTER_TAKE', () => {
  it("MAINTENANCE peut modifier les champs descriptifs d'un incident qu'il possède", async () => {
    const incident = mockIncident({ is_taken: true, taken_by_user_id: 42, status: 'OPEN' });
    const updated = mockIncident({ state: 'INDISPONIBLE', is_taken: true, taken_by_user_id: 42 });
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);
    jest.mocked(repo.updateIncidentData).mockResolvedValue(1);
    jest.mocked(repo.fetchIncidentWithUsers).mockResolvedValue(updated);
    jest.mocked(events.logIncidentEvent).mockResolvedValue(1);

    const result = await updateIncidentService(1, { state: 'INDISPONIBLE' }, 42, 'MAINTENANCE');
    expect(result.ok).toBe(true);
  });

  it("MAINTENANCE ne peut pas modifier les champs descriptifs d'un incident appartenant à un autre", async () => {
    const incident = mockIncident({ is_taken: true, taken_by_user_id: 99, status: 'OPEN' });
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);

    const result = await updateIncidentService(1, { state: 'INDISPONIBLE' }, 42, 'MAINTENANCE');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
  });

  it('MAINTENANCE ne peut pas modifier un incident non pris (DIRECT_EDIT path)', async () => {
    const incident = mockIncident({ is_taken: false, status: 'OPEN' });
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);
    jest.mocked(repo.updateIncidentData).mockResolvedValue(1);
    jest.mocked(repo.fetchIncidentWithUsers).mockResolvedValue(incident);
    jest.mocked(events.logIncidentEvent).mockResolvedValue(1);

    // DIRECT_EDIT is allowed on untaken incidents — this should pass
    const result = await updateIncidentService(1, { state: 'INDISPONIBLE' }, 42, 'MAINTENANCE');
    expect(result.ok).toBe(true);
  });
});

// ─── transactions : rollback sur échec logIncidentEvent ───────────────────────

import { withTransaction as mockWithTransaction } from '../../../db/transaction';

describe('updateIncidentService – cohérence transactionnelle', () => {
  it("withTransaction est appelé pour chaque opération d'écriture", async () => {
    const incident = mockIncident();
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);
    jest.mocked(repo.updateIncidentData).mockResolvedValue(1);
    jest.mocked(repo.fetchIncidentWithUsers).mockResolvedValue(incident);
    jest.mocked(events.logIncidentEvent).mockResolvedValue(1);

    await updateIncidentService(1, { isPriority: true }, 1, 'RESPONSABLE');
    expect(mockWithTransaction).toHaveBeenCalledTimes(1);
  });

  it('withTransaction est appelé lors de la création', async () => {
    const line = mockLine();
    const incident = mockIncident();
    jest.mocked(repo.lockActiveWorkshopLines).mockResolvedValue([line]);
    jest.mocked(repo.createIncidentData).mockResolvedValue(1);
    jest.mocked(repo.fetchIncidentWithUsers).mockResolvedValue(incident);
    jest.mocked(events.logIncidentEvent).mockResolvedValue(1);

    await createIncidentService(validCreateInput, 1, 'OPERATOR');
    expect(mockWithTransaction).toHaveBeenCalledTimes(1);
  });
});
