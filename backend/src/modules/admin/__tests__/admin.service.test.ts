import { markPasswordResetRequestHandledService } from '../admin.service';
import * as repo from '../admin.repository';

jest.mock('../admin.repository', () => ({
  getReferenceDashboardData: jest.fn(),
  getReferenceQualityRawData: jest.fn(),
  listReferenceAuditData: jest.fn(),
  listPendingPasswordResetRequestsData: jest.fn(),
  markPasswordResetRequestHandledData: jest.fn(),
}));

jest.mock('../../../db/transaction', () => ({
  withTransaction: jest.fn((fn: (client: null) => Promise<unknown>) => fn(null)),
}));

jest.mock('../../adminAudit/adminAudit.events', () => ({
  createAdminSystemAuditEvent: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── markPasswordResetRequestHandledService ───────────────────────────────────

describe('markPasswordResetRequestHandledService', () => {
  it('retourne NOT_FOUND si la demande est introuvable ou déjà traitée', async () => {
    jest.mocked(repo.markPasswordResetRequestHandledData).mockResolvedValue(false);

    const result = await markPasswordResetRequestHandledService(42, 7);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('NOT_FOUND');
      expect(result.status).toBe(404);
    }
  });

  it('retourne un succès typé quand la demande est marquée traitée', async () => {
    jest.mocked(repo.markPasswordResetRequestHandledData).mockResolvedValue(true);

    const result = await markPasswordResetRequestHandledService(42, 7);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.message).toBe('Demande marquée comme traitée.');
    }
    expect(repo.markPasswordResetRequestHandledData).toHaveBeenCalledWith(42, null);
  });
});
