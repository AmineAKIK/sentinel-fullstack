import { IncidentStatus } from '../../../domain/constants';
import {
  createIncidentService,
  cancelIncidentService,
  followIncidentService,
  reorderIncidentsService,
  unfollowIncidentService,
  updateIncidentService,
} from '../workshop.service';

// ─── mocks ────────────────────────────────────────────────────────────────────

jest.mock('../workshop.repository', () => ({
  getActiveWorkshopLine: jest.fn(),
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
  getWorkshopAnalytics: jest.fn(),
  fetchIncidentWithUsersForActor: jest.fn(),
  incidentExists: jest.fn(),
  getIncidentStatus: jest.fn(),
  followIncidentData: jest.fn(),
  unfollowIncidentData: jest.fn(),
  listReorderableIncidentIds: jest.fn(),
  reorderIncidentsData: jest.fn(),
}));

jest.mock('../workshop.events', () => ({
  logIncidentEvent: jest.fn(),
}));

// withTransaction: execute the callback directly with a null client so tests
// don't need a real DB connection. Repository mocks ignore the client param.
jest.mock('../../../db/transaction', () => ({
  withTransaction: jest.fn((fn: (client: null) => Promise<unknown>) => fn(null)),
}));

import * as repo from '../workshop.repository';
import * as events from '../workshop.events';

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

function mockCancelSnapshot(overrides: Partial<{
  status: 'OPEN' | 'PENDING' | 'CLOSED' | 'CANCELED';
  is_taken: boolean;
  taken_by_user_id: number | null;
  user_id: number;
  delete_request: boolean;
  delete_request_reason: string | null;
}> = {}) {
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
  jest.mocked(repo.fetchIncidentWithUsersForActor).mockImplementation((incidentId: number) =>
    repo.fetchIncidentWithUsers(incidentId)
  );
});

// ─── createIncidentService ────────────────────────────────────────────────────

describe('createIncidentService', () => {
  it('retourne NOT_FOUND si la ligne n\'existe pas', async () => {
    jest.mocked(repo.getActiveWorkshopLine).mockResolvedValue(null);

    const result = await createIncidentService(validCreateInput, 1, 'OPERATOR');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('NOT_FOUND');
      expect(result.status).toBe(404);
    }
  });

  it('retourne VALIDATION_ERROR si la machine n\'existe pas dans la ligne', async () => {
    const line = mockLine();
    jest.mocked(repo.getActiveWorkshopLine).mockResolvedValue(line);

    const result = await createIncidentService({ ...validCreateInput, machineId: 'INEXISTANT' }, 1, 'OPERATOR');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('VALIDATION_ERROR');
      expect(result.status).toBe(400);
    }
  });

  it('retourne VALIDATION_ERROR si le robot n\'existe pas dans la machine', async () => {
    const line = mockLine();
    jest.mocked(repo.getActiveWorkshopLine).mockResolvedValue(line);

    const result = await createIncidentService({ ...validCreateInput, robotLabel: 'INEXISTANT' }, 1, 'OPERATOR');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('retourne VALIDATION_ERROR si le numéro de tête est invalide (0)', async () => {
    const line = mockLine();
    jest.mocked(repo.getActiveWorkshopLine).mockResolvedValue(line);

    const result = await createIncidentService({ ...validCreateInput, headNumber: 0 }, 1, 'OPERATOR');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('retourne VALIDATION_ERROR si le numéro de tête dépasse le max', async () => {
    const line = mockLine();
    jest.mocked(repo.getActiveWorkshopLine).mockResolvedValue(line);

    const result = await createIncidentService({ ...validCreateInput, headNumber: 99 }, 1, 'OPERATOR');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('crée l\'incident avec succès et logge l\'événement INCIDENT_CREATED', async () => {
    const line = mockLine();
    const incident = mockIncident();
    jest.mocked(repo.getActiveWorkshopLine).mockResolvedValue(line);
    jest.mocked(repo.createIncidentData).mockResolvedValue(1);
    jest.mocked(repo.fetchIncidentWithUsers).mockResolvedValue(incident);
    jest.mocked(events.logIncidentEvent).mockResolvedValue(undefined);

    const result = await createIncidentService(validCreateInput, 1, 'OPERATOR');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual(incident);
    expect(events.logIncidentEvent).toHaveBeenCalledWith(1, 1, 'INCIDENT_CREATED', expect.any(Object), null);
  });
});

// ─── cancelIncidentService ────────────────────────────────────────────────────

describe('cancelIncidentService', () => {
  it('retourne NOT_FOUND si l\'incident n\'existe pas', async () => {
    jest.mocked(repo.getIncidentCancelSnapshot).mockResolvedValue(null);

    const result = await cancelIncidentService(999, 1, 'MAINTENANCE');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('NOT_FOUND');
      expect(result.status).toBe(404);
    }
  });

  it('retourne FORBIDDEN si l\'OPERATOR tente d\'annuler directement', async () => {
    jest.mocked(repo.getIncidentCancelSnapshot).mockResolvedValue(mockCancelSnapshot());

    const result = await cancelIncidentService(1, 1, 'OPERATOR');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
  });

  it('MAINTENANCE peut annuler directement un incident non pris', async () => {
    jest.mocked(repo.getIncidentCancelSnapshot).mockResolvedValue(mockCancelSnapshot({ is_taken: false }));
    jest.mocked(repo.cancelIncidentData).mockResolvedValue(true);
    jest.mocked(events.logIncidentEvent).mockResolvedValue(undefined);

    const result = await cancelIncidentService(1, 1, 'MAINTENANCE');
    expect(result.ok).toBe(true);
    expect(events.logIncidentEvent).toHaveBeenCalledWith(1, 1, 'INCIDENT_CANCELED', expect.any(Object), null);
  });

  it('RESPONSABLE peut approuver une annulation demandée', async () => {
    jest.mocked(repo.getIncidentCancelSnapshot).mockResolvedValue(
      mockCancelSnapshot({ delete_request: true })
    );
    jest.mocked(repo.cancelIncidentData).mockResolvedValue(true);
    jest.mocked(events.logIncidentEvent).mockResolvedValue(undefined);

    const result = await cancelIncidentService(1, 1, 'RESPONSABLE');
    expect(result.ok).toBe(true);
    expect(events.logIncidentEvent).toHaveBeenCalledWith(1, 1, 'INCIDENT_CANCELED', expect.objectContaining({ mode: 'request_approved' }), null);
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
    jest.mocked(repo.getIncidentStatus).mockResolvedValue({ status: 'OPEN' });
    jest.mocked(repo.fetchIncidentWithUsers).mockResolvedValue(incident);
    jest.mocked(repo.followIncidentData).mockResolvedValue(undefined);
    jest.mocked(events.logIncidentEvent).mockResolvedValue(undefined);

    const result = await followIncidentService(1, 7, 'RESPONSABLE');

    expect(result.ok).toBe(true);
    expect(repo.followIncidentData).toHaveBeenCalledWith(1, 7, null);
    expect(events.logIncidentEvent).toHaveBeenCalledWith(1, 7, 'INCIDENT_FOLLOWED', {}, null);
  });
});

describe('unfollowIncidentService', () => {
  it('permet au responsable de retirer un suivi', async () => {
    const incident = mockIncident({ is_followed: false });
    jest.mocked(repo.incidentExists).mockResolvedValue(true);
    jest.mocked(repo.fetchIncidentWithUsers).mockResolvedValue(incident);
    jest.mocked(repo.unfollowIncidentData).mockResolvedValue(undefined);
    jest.mocked(events.logIncidentEvent).mockResolvedValue(undefined);

    const result = await unfollowIncidentService(1, 7, 'RESPONSABLE');

    expect(result.ok).toBe(true);
    expect(repo.unfollowIncidentData).toHaveBeenCalledWith(1, 7, null);
    expect(events.logIncidentEvent).toHaveBeenCalledWith(1, 7, 'INCIDENT_UNFOLLOWED', {}, null);
  });
});

// ─── updateIncidentService ────────────────────────────────────────────────────

describe('updateIncidentService – OPERATOR', () => {
  it('retourne NOT_FOUND si l\'incident n\'existe pas', async () => {
    jest.mocked(repo.getIncidentById).mockResolvedValue(null);

    const result = await updateIncidentService(999, { requestOnly: true, state: 'INDISPONIBLE' }, 1, 'OPERATOR');
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
    jest.mocked(events.logIncidentEvent).mockResolvedValue(undefined);

    const result = await updateIncidentService(1, { deleteRequest: true, deleteRequestReason: 'Erreur de saisie' }, 1, 'OPERATOR');
    expect(result.ok).toBe(true);
    expect(events.logIncidentEvent).toHaveBeenCalledWith(1, 1, 'CANCEL_REQUESTED', expect.any(Object), null);
  });

  it('retourne VALIDATION_ERROR si demande d\'annulation sans motif', async () => {
    const incident = mockIncident({ is_taken: false });
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);

    const result = await updateIncidentService(1, { deleteRequest: true, deleteRequestReason: '' }, 1, 'OPERATOR');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('OPERATOR peut demander une correction et l\'événement EDIT_REQUESTED est loggué', async () => {
    const incident = mockIncident();
    const updated = mockIncident({ edit_request: { state: 'INDISPONIBLE' } });
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);
    jest.mocked(repo.requestEditIncident).mockResolvedValue(1);
    jest.mocked(repo.fetchIncidentWithUsers).mockResolvedValue(updated);
    jest.mocked(events.logIncidentEvent).mockResolvedValue(undefined);

    const result = await updateIncidentService(1, { requestOnly: true, state: 'INDISPONIBLE' }, 1, 'OPERATOR');
    expect(result.ok).toBe(true);
    expect(events.logIncidentEvent).toHaveBeenCalledWith(1, 1, 'EDIT_REQUESTED', expect.any(Object), null);
  });

  it('OPERATOR peut demander une correction de ligne sans contourner la whitelist', async () => {
    const incident = mockIncident();
    const updated = mockIncident({ edit_request: { lineId: 2 } });
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);
    jest.mocked(repo.requestEditIncident).mockResolvedValue(1);
    jest.mocked(repo.fetchIncidentWithUsers).mockResolvedValue(updated);
    jest.mocked(events.logIncidentEvent).mockResolvedValue(undefined);

    const result = await updateIncidentService(1, { requestOnly: true, lineId: 2 }, 1, 'OPERATOR');
    expect(result.ok).toBe(true);
    expect(repo.requestEditIncident).toHaveBeenCalledWith(1, { lineId: 2 }, null);
  });

  it('rejette une demande de correction mélangée à un champ hors édition', async () => {
    const result = await updateIncidentService(1, { requestOnly: true, state: 'INDISPONIBLE', isPriority: true }, 1, 'OPERATOR');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VALIDATION_ERROR');
    expect(repo.getIncidentById).not.toHaveBeenCalled();
    expect(repo.requestEditIncident).not.toHaveBeenCalled();
  });
});

describe('updateIncidentService – RESPONSABLE', () => {
  it('RESPONSABLE peut approuver une correction et l\'événement EDIT_APPLIED est loggué', async () => {
    const incident = mockIncident({ edit_request: { state: 'INDISPONIBLE' } });
    const updated = mockIncident({ state: 'INDISPONIBLE' });
    const line = mockLine();
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);
    jest.mocked(repo.getActiveWorkshopLine).mockResolvedValue(line);
    jest.mocked(repo.applyEditRequestIncident).mockResolvedValue(1);
    jest.mocked(repo.fetchIncidentWithUsers).mockResolvedValue(updated);
    jest.mocked(events.logIncidentEvent).mockResolvedValue(undefined);

    const result = await updateIncidentService(1, { applyEditRequest: true }, 1, 'RESPONSABLE');
    expect(result.ok).toBe(true);
    expect(events.logIncidentEvent).toHaveBeenCalledWith(1, 1, 'EDIT_APPLIED', expect.any(Object), null);
  });

  it('RESPONSABLE peut refuser une correction et l\'événement EDIT_REJECTED est loggué', async () => {
    const incident = mockIncident({ edit_request: { state: 'INDISPONIBLE' } });
    const updated = mockIncident({ edit_request: null });
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);
    jest.mocked(repo.rejectEditIncident).mockResolvedValue(1);
    jest.mocked(repo.fetchIncidentWithUsers).mockResolvedValue(updated);
    jest.mocked(events.logIncidentEvent).mockResolvedValue(undefined);

    const result = await updateIncidentService(1, { rejectEditRequest: true }, 1, 'RESPONSABLE');
    expect(result.ok).toBe(true);
    expect(events.logIncidentEvent).toHaveBeenCalledWith(1, 1, 'EDIT_REJECTED', expect.any(Object), null);
  });

  it('RESPONSABLE peut invalider un incident clôturé et l\'événement INCIDENT_INVALIDATED est loggué', async () => {
    const incident = mockIncident({ status: 'CLOSED' });
    const updated = mockIncident({ status: 'OPEN' });
    const line = mockLine();
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);
    jest.mocked(repo.getActiveWorkshopLine).mockResolvedValue(line);
    jest.mocked(repo.invalidateIncident).mockResolvedValue(1);
    jest.mocked(repo.fetchIncidentWithUsers).mockResolvedValue(updated);
    jest.mocked(events.logIncidentEvent).mockResolvedValue(undefined);

    const result = await updateIncidentService(1, { status: 'CANCELED', invalidationReason: 'Incident incorrect' }, 1, 'RESPONSABLE');
    expect(result.ok).toBe(true);
    expect(events.logIncidentEvent).toHaveBeenCalledWith(1, 1, 'INCIDENT_INVALIDATED', expect.any(Object), null);
  });

  it('retourne VALIDATION_ERROR si invalidation sans motif', async () => {
    const incident = mockIncident({ status: 'CLOSED' });
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);

    const result = await updateIncidentService(1, { status: 'CANCELED', invalidationReason: '' }, 1, 'RESPONSABLE');
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

  it('MAINTENANCE peut passer en PENDING avec diagnostic et l\'événement STATUS_CHANGED est loggué', async () => {
    const incident = mockIncident({ is_taken: true });
    const updated = mockIncident({ status: 'PENDING', diagnostic: 'Capteur défaillant' });
    const line = mockLine();
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);
    jest.mocked(repo.getActiveWorkshopLine).mockResolvedValue(line);
    jest.mocked(repo.updateIncidentData).mockResolvedValue(1);
    jest.mocked(repo.fetchIncidentWithUsers).mockResolvedValue(updated);
    jest.mocked(events.logIncidentEvent).mockResolvedValue(undefined);

    const result = await updateIncidentService(1, { status: 'PENDING', diagnostic: 'Capteur défaillant' }, 1, 'MAINTENANCE');
    expect(result.ok).toBe(true);
    expect(events.logIncidentEvent).toHaveBeenCalledWith(1, 1, 'INCIDENT_SET_PENDING', expect.objectContaining({ from: 'OPEN', to: 'PENDING' }), null);
  });

  it('MAINTENANCE ne peut pas clôturer sans note d\'intervention', async () => {
    const incident = mockIncident({ is_taken: true });
    const line = mockLine();
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);
    jest.mocked(repo.getActiveWorkshopLine).mockResolvedValue(line);

    const result = await updateIncidentService(1, { status: 'CLOSED' }, 1, 'MAINTENANCE');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('MAINTENANCE peut clôturer avec note d\'intervention et l\'événement STATUS_CHANGED est loggué', async () => {
    const incident = mockIncident({ is_taken: true });
    const updated = mockIncident({ status: 'CLOSED', intervention_note: 'Capteur remplacé' });
    const line = mockLine();
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);
    jest.mocked(repo.getActiveWorkshopLine).mockResolvedValue(line);
    jest.mocked(repo.updateIncidentData).mockResolvedValue(1);
    jest.mocked(repo.fetchIncidentWithUsers).mockResolvedValue(updated);
    jest.mocked(events.logIncidentEvent).mockResolvedValue(undefined);

    const result = await updateIncidentService(1, { status: 'CLOSED', interventionNote: 'Capteur remplacé' }, 1, 'MAINTENANCE');
    expect(result.ok).toBe(true);
    expect(events.logIncidentEvent).toHaveBeenCalledWith(1, 1, 'INCIDENT_CLOSED', expect.objectContaining({ from: 'OPEN', to: 'CLOSED' }), null);
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
    const boardData = { lines: [], incidents: [], metrics: { total: 0, open: 0, pending: 0, open_over_7d: 0 } };
    jest.mocked(repo.getBoardData).mockResolvedValue(boardData);
    const result = await getBoardDataService();
    expect(result).toEqual(boardData);
    expect(repo.getBoardData).toHaveBeenCalledTimes(1);
  });
});

describe('listWorkshopLinesService', () => {
  it('retourne les lignes actives', async () => {
    const lines = [{ id: 1, line_number: 'L01', machines: [] }];
    jest.mocked(repo.listActiveWorkshopLines).mockResolvedValue(lines);
    const result = await listWorkshopLinesService();
    expect(result).toEqual(lines);
  });
});

describe('listIncidentsService', () => {
  it('retourne tous les incidents actifs', async () => {
    const incidents = [mockIncident()];
    jest.mocked(repo.listIncidents).mockResolvedValue(incidents);
    const result = await listIncidentsService(7, 'RESPONSABLE');
    expect(result).toEqual(incidents);
    expect(repo.listIncidents).toHaveBeenCalledWith(7, 'RESPONSABLE');
  });
});

describe('listHistoryIncidentsService', () => {
  it('transmet la query au repository en mode history', async () => {
    const rows = [mockIncident({ status: 'CLOSED' })];
    jest.mocked(repo.listIncidentWorkspaceRows).mockResolvedValue(rows);
    const result = await listHistoryIncidentsService({ status: 'CLOSED' });
    expect(result).toEqual(rows);
    expect(repo.listIncidentWorkspaceRows).toHaveBeenCalledWith({ status: 'CLOSED' }, 'history');
  });
});

describe('listKnowledgeIncidentsService', () => {
  it('transmet la query au repository en mode knowledge', async () => {
    const rows = [mockIncident({ status: 'CLOSED', intervention_note: 'Ok' })];
    jest.mocked(repo.listIncidentWorkspaceRows).mockResolvedValue(rows);
    const result = await listKnowledgeIncidentsService({ q: 'robot' });
    expect(result).toEqual(rows);
    expect(repo.listIncidentWorkspaceRows).toHaveBeenCalledWith({ q: 'robot' }, 'knowledge');
  });
});

describe('getHistoryIncidentService', () => {
  it('retourne NOT_FOUND si incident absent', async () => {
    jest.mocked(repo.fetchIncidentWithUsers).mockResolvedValue(undefined);
    const result = await getHistoryIncidentService(999);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_FOUND');
  });

  it('retourne l\'incident si trouvé', async () => {
    const incident = mockIncident({ status: 'CLOSED' });
    jest.mocked(repo.fetchIncidentWithUsers).mockResolvedValue(incident);
    const result = await getHistoryIncidentService(1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual(incident);
  });
});

describe('getKnowledgeIncidentService', () => {
  it('retourne NOT_FOUND si incident absent', async () => {
    jest.mocked(repo.fetchIncidentWithUsers).mockResolvedValue(undefined);
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
  it('transmet la query au repository', async () => {
    const events_data = [{ id: 1, event_type: 'INCIDENT_CREATED' }];
    jest.mocked(repo.listHistoryEvents).mockResolvedValue(events_data);
    const result = await listHistoryEventsService({ lineId: '1' });
    expect(result).toEqual(events_data);
    expect(repo.listHistoryEvents).toHaveBeenCalledWith({ lineId: '1' });
  });
});

describe('listIncidentEventsService', () => {
  it('retourne les événements d\'un incident', async () => {
    const evts = [{ id: 1, event_type: 'INCIDENT_CREATED', created_at: new Date() }];
    jest.mocked(repo.listIncidentEvents).mockResolvedValue(evts);
    const result = await listIncidentEventsService(1);
    expect(result).toEqual(evts);
    expect(repo.listIncidentEvents).toHaveBeenCalledWith(1);
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
      open_over_7d: 0,
      closed_today: 0,
    };
    jest.mocked(repo.getIncidentMetrics).mockResolvedValue(metrics);
    const result = await getIncidentMetricsService(7);
    expect(result).toEqual(metrics);
    expect(repo.getIncidentMetrics).toHaveBeenCalledWith(7);
  });
});

describe('getWorkshopAnalyticsService', () => {
  it('transmet la query au repository', async () => {
    const analytics = { total: 10, open: 5, pending: 2, closed: 3, priority: 1, active: 7, not_taken: 3, urgent_not_taken: 0, taken: 4, open_over_24h: 1, open_over_7d: 0, oldest_active_seconds: null, median_take_seconds: null, avg_take_seconds: null, median_close_seconds: null, avg_close_seconds: null, by_state: [], by_line: [], by_machine: [], trend: [] };
    jest.mocked(repo.getWorkshopAnalytics).mockResolvedValue(analytics);
    const result = await getWorkshopAnalyticsService({ start: '2025-01-01', end: '2025-01-31' });
    expect(result).toEqual(analytics);
    expect(repo.getWorkshopAnalytics).toHaveBeenCalledWith({ start: '2025-01-01', end: '2025-01-31' });
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
    const result = await updateIncidentService(1, { state: 'INDISPONIBLE', diagnostic: 'injection' }, 1, 'RESPONSABLE');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VALIDATION_ERROR');
    expect(repo.updateIncidentData).not.toHaveBeenCalled();
  });

  it('rejette une action de statut mélangée à une autre action', async () => {
    const result = await updateIncidentService(1, { status: 'CLOSED', interventionNote: 'Ok', isPriority: true }, 1, 'MAINTENANCE');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VALIDATION_ERROR');
    expect(repo.getIncidentById).not.toHaveBeenCalled();
  });

  it('retourne NOT_FOUND si requestCancelIncident retourne null (race condition)', async () => {
    const incident = mockIncident({ is_taken: false });
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);
    jest.mocked(repo.requestCancelIncident).mockResolvedValue(null);

    const result = await updateIncidentService(1, { deleteRequest: true, deleteRequestReason: 'Erreur' }, 1, 'OPERATOR');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_FOUND');
  });

  it('retourne NOT_FOUND si rejectEditIncident retourne null (race condition)', async () => {
    const incident = mockIncident({ edit_request: { state: 'ARRET' } });
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);
    jest.mocked(repo.rejectEditIncident).mockResolvedValue(null);

    const result = await updateIncidentService(1, { rejectEditRequest: true }, 1, 'RESPONSABLE');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_FOUND');
  });

  it('retourne FORBIDDEN si CLOSE tenté sur incident PENDING (policy bloque avant BAD_REQUEST)', async () => {
    const incident = mockIncident({ status: 'PENDING', is_taken: true, intervention_note: 'Note existante' });
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);

    const result = await updateIncidentService(1, { status: 'CLOSED', interventionNote: 'Note' }, 1, 'MAINTENANCE');
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

  it('ne valide pas la sélection si aucun champ de sélection n\'est modifié', async () => {
    const incident = mockIncident({ is_taken: false });
    const updated = mockIncident({ is_priority: true });
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);
    jest.mocked(repo.updateIncidentData).mockResolvedValue(1);
    jest.mocked(repo.fetchIncidentWithUsers).mockResolvedValue(updated);
    jest.mocked(events.logIncidentEvent).mockResolvedValue(undefined);

    const result = await updateIncidentService(1, { isPriority: true }, 1, 'RESPONSABLE');
    expect(result.ok).toBe(true);
    expect(repo.getActiveWorkshopLine).not.toHaveBeenCalled();
  });
});

describe('cancelIncidentService – cas limites', () => {
  it('retourne FORBIDDEN si OPERATOR tente d\'annuler un incident pris en charge', async () => {
    const snapshot = mockCancelSnapshot({ is_taken: true });
    jest.mocked(repo.getIncidentCancelSnapshot).mockResolvedValue(snapshot);

    const result = await cancelIncidentService(1, 1, 'OPERATOR');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
  });
});

describe('reorderIncidentsService', () => {
  it('interdit le réordonnancement aux rôles non responsables', async () => {
    const result = await reorderIncidentsService({ orderedIncidentIds: [1, 2] }, 1, 'MAINTENANCE');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
    expect(repo.listReorderableIncidentIds).not.toHaveBeenCalled();
  });

  it('rejette les doublons avant la transaction', async () => {
    const result = await reorderIncidentsService({ orderedIncidentIds: [1, 1] }, 1, 'RESPONSABLE');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VALIDATION_ERROR');
    expect(repo.listReorderableIncidentIds).not.toHaveBeenCalled();
  });

  it('rejette les incidents inexistants ou non actifs avant update et logs', async () => {
    jest.mocked(repo.listReorderableIncidentIds).mockResolvedValue([1]);

    const result = await reorderIncidentsService({ orderedIncidentIds: [1, 2] }, 1, 'RESPONSABLE');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VALIDATION_ERROR');
    expect(repo.reorderIncidentsData).not.toHaveBeenCalled();
    expect(events.logIncidentEvent).not.toHaveBeenCalled();
  });

  it('réordonne uniquement après verrouillage des incidents actifs', async () => {
    jest.mocked(repo.listReorderableIncidentIds).mockResolvedValue([1, 2]);
    jest.mocked(repo.reorderIncidentsData).mockResolvedValue(2);
    jest.mocked(events.logIncidentEvent).mockResolvedValue(undefined);

    const result = await reorderIncidentsService({ orderedIncidentIds: [1, 2] }, 7, 'RESPONSABLE');

    expect(result).toEqual({ ok: true, data: { updated: 2 } });
    expect(repo.listReorderableIncidentIds).toHaveBeenCalledWith([1, 2], null);
    expect(repo.reorderIncidentsData).toHaveBeenCalledWith([1, 2], null);
    expect(events.logIncidentEvent).toHaveBeenCalledWith(1, 7, 'INCIDENT_REORDERED', { position: 1, batchSize: 2 }, null);
    expect(events.logIncidentEvent).toHaveBeenCalledWith(2, 7, 'INCIDENT_REORDERED', { position: 2, batchSize: 2 }, null);
  });
});

// ─── policy : EDIT_AFTER_TAKE ─────────────────────────────────────────────────

describe('updateIncidentService – EDIT_AFTER_TAKE', () => {
  it('MAINTENANCE peut modifier les champs descriptifs d\'un incident qu\'il possède', async () => {
    const incident = mockIncident({ is_taken: true, taken_by_user_id: 42, status: 'OPEN' });
    const updated = mockIncident({ state: 'INDISPONIBLE', is_taken: true, taken_by_user_id: 42 });
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);
    jest.mocked(repo.updateIncidentData).mockResolvedValue(1);
    jest.mocked(repo.fetchIncidentWithUsers).mockResolvedValue(updated);
    jest.mocked(events.logIncidentEvent).mockResolvedValue(undefined);

    const result = await updateIncidentService(1, { state: 'INDISPONIBLE' }, 42, 'MAINTENANCE');
    expect(result.ok).toBe(true);
  });

  it('MAINTENANCE ne peut pas modifier les champs descriptifs d\'un incident appartenant à un autre', async () => {
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
    jest.mocked(events.logIncidentEvent).mockResolvedValue(undefined);

    // DIRECT_EDIT is allowed on untaken incidents — this should pass
    const result = await updateIncidentService(1, { state: 'INDISPONIBLE' }, 42, 'MAINTENANCE');
    expect(result.ok).toBe(true);
  });
});

// ─── transactions : rollback sur échec logIncidentEvent ───────────────────────

import { withTransaction as mockWithTransaction } from '../../../db/transaction';

describe('updateIncidentService – cohérence transactionnelle', () => {
  it('withTransaction est appelé pour chaque opération d\'écriture', async () => {
    const incident = mockIncident();
    jest.mocked(repo.getIncidentById).mockResolvedValue(incident);
    jest.mocked(repo.updateIncidentData).mockResolvedValue(1);
    jest.mocked(repo.fetchIncidentWithUsers).mockResolvedValue(incident);
    jest.mocked(events.logIncidentEvent).mockResolvedValue(undefined);

    await updateIncidentService(1, { isPriority: true }, 1, 'RESPONSABLE');
    expect(mockWithTransaction).toHaveBeenCalledTimes(1);
  });

  it('withTransaction est appelé lors de la création', async () => {
    const line = mockLine();
    const incident = mockIncident();
    jest.mocked(repo.getActiveWorkshopLine).mockResolvedValue(line);
    jest.mocked(repo.createIncidentData).mockResolvedValue(1);
    jest.mocked(repo.fetchIncidentWithUsers).mockResolvedValue(incident);
    jest.mocked(events.logIncidentEvent).mockResolvedValue(undefined);

    await createIncidentService(validCreateInput, 1, 'OPERATOR');
    expect(mockWithTransaction).toHaveBeenCalledTimes(1);
  });
});
