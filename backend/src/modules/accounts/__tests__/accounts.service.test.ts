import {
  checkBadgeAvailabilityService,
  createAccountService,
  deactivateAccountService,
  deleteAccountService,
  getAccountImpactService,
  getAccountService,
  resetAccountPasswordService,
  updateAccountService,
} from '../accounts.service';

// ─── mocks ────────────────────────────────────────────────────────────────────

jest.mock('../accounts.repository', () => ({
  accountBadgeExists: jest.fn(),
  createAccountData: jest.fn(),
  getAccountData: jest.fn(),
  getAccountImpactData: jest.fn(),
  getActiveTakenIncidentCountForUser: jest.fn(),
  listAccountsData: jest.fn(),
  resetAccountPasswordData: jest.fn(),
  setAccountActive: jest.fn(),
  softDeleteAccount: jest.fn(),
  updateAccountData: jest.fn(),
}));

jest.mock('../accounts.events', () => ({
  createAccountAuditEvent: jest.fn(),
}));

jest.mock('../../../db/transaction', () => ({
  withTransaction: jest.fn((fn: (client: null) => Promise<unknown>) => fn(null)),
}));

jest.mock('../../../auth/setupCode', () => ({
  generateWorkshopPasswordSetupCode: jest.fn(() => 'ABCD234567'),
  getWorkshopPasswordSetupExpiry: jest.fn(() => new Date('2025-01-02T00:00:00Z')),
  hashWorkshopPasswordSetupCode: jest.fn(() => Promise.resolve('hashed-setup-code')),
}));

jest.mock('../../adminCredentials/adminCredentials.repository', () => ({
  getAppSettings: jest.fn(() => Promise.resolve({ setup_code_ttl_hours: 24 })),
}));

import * as repo from '../accounts.repository';
import * as events from '../accounts.events';

// ─── helpers ──────────────────────────────────────────────────────────────────

function mockAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    first_name: 'Jean',
    last_name: 'Dupont',
    badge_number: 'B001',
    role: 'OPERATOR' as const,
    is_active: true,
    email: null as string | null,
    has_password: false,
    has_password_setup_code: true,
    password_setup_expires_at: new Date('2025-01-02T00:00:00Z'),
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── checkBadgeAvailabilityService ────────────────────────────────────────────

describe('checkBadgeAvailabilityService', () => {
  it('retourne exists: false quand le badge est libre', async () => {
    jest.mocked(repo.accountBadgeExists).mockResolvedValue(false);
    const result = await checkBadgeAvailabilityService('B999');
    expect(result).toEqual({ exists: false });
  });

  it('retourne exists: true quand le badge est pris', async () => {
    jest.mocked(repo.accountBadgeExists).mockResolvedValue(true);
    const result = await checkBadgeAvailabilityService('B001');
    expect(result).toEqual({ exists: true });
  });
});

// ─── createAccountService ─────────────────────────────────────────────────────

describe('createAccountService', () => {
  const input = {
    firstName: 'Jean',
    lastName: 'Dupont',
    badgeNumber: 'B001',
    role: 'OPERATOR' as const,
  };

  it('retourne BADGE_ALREADY_EXISTS quand le badge est déjà utilisé', async () => {
    jest.mocked(repo.accountBadgeExists).mockResolvedValue(true);
    const result = await createAccountService(input, 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('BADGE_ALREADY_EXISTS');
      expect(result.status).toBe(409);
    }
  });

  it('crée le compte et retourne les données quand le badge est libre', async () => {
    const created = mockAccount();
    jest.mocked(repo.accountBadgeExists).mockResolvedValue(false);
    jest.mocked(repo.createAccountData).mockResolvedValue(created);
    jest.mocked(events.createAccountAuditEvent).mockResolvedValue(undefined);

    const result = await createAccountService(input, 1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ ...created, password_setup_code: 'ABCD234567' });
    }
    expect(repo.createAccountData).toHaveBeenCalledWith(
      input,
      'hashed-setup-code',
      new Date('2025-01-02T00:00:00Z'),
      null
    );
    expect(events.createAccountAuditEvent).toHaveBeenCalledWith(
      created.id,
      1,
      'USER_CREATED',
      {
        firstName: 'Jean',
        lastName: 'Dupont',
        badgeNumber: 'B001',
        role: 'OPERATOR',
        emailConfigured: false,
      },
      null
    );
  });

  it("journalise uniquement la présence de l'email professionnel à la création", async () => {
    const email = 'jean.dupont@example.test';
    const created = mockAccount({ email });
    jest.mocked(repo.accountBadgeExists).mockResolvedValue(false);
    jest.mocked(repo.createAccountData).mockResolvedValue(created);
    jest.mocked(events.createAccountAuditEvent).mockResolvedValue(undefined);

    await createAccountService({ ...input, email }, 1);

    const auditChanges = jest.mocked(events.createAccountAuditEvent).mock.calls[0][3];
    expect(auditChanges).toEqual({
      firstName: 'Jean',
      lastName: 'Dupont',
      badgeNumber: 'B001',
      role: 'OPERATOR',
      emailConfigured: true,
    });
    expect(JSON.stringify(auditChanges)).not.toContain(email);
  });
});

// ─── getAccountService ────────────────────────────────────────────────────────

describe('getAccountService', () => {
  it("retourne NOT_FOUND quand le compte n'existe pas", async () => {
    jest.mocked(repo.getAccountData).mockResolvedValue(null);
    const result = await getAccountService(999);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('NOT_FOUND');
      expect(result.status).toBe(404);
    }
  });

  it('retourne les données du compte quand il existe', async () => {
    const account = mockAccount();
    jest.mocked(repo.getAccountData).mockResolvedValue(account);
    const result = await getAccountService(1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual(account);
  });
});

// ─── updateAccountService ─────────────────────────────────────────────────────

describe('updateAccountService', () => {
  it("retourne NOT_FOUND si l'utilisateur n'existe pas", async () => {
    jest.mocked(repo.getAccountData).mockResolvedValue(null);
    const result = await updateAccountService(999, { firstName: 'Test' }, 1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_FOUND');
  });

  it('retourne BADGE_ALREADY_EXISTS si le nouveau badge est déjà pris', async () => {
    const current = mockAccount({ badge_number: 'B001' });
    jest.mocked(repo.getAccountData).mockResolvedValue(current);
    jest.mocked(repo.accountBadgeExists).mockResolvedValue(true);

    const result = await updateAccountService(1, { badgeNumber: 'B002' }, 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('BADGE_ALREADY_EXISTS');
      expect(result.status).toBe(409);
    }
  });

  it("retourne RESOURCE_IN_USE si le rôle change et qu'il y a des incidents actifs", async () => {
    const current = mockAccount({ role: 'OPERATOR' });
    jest.mocked(repo.getAccountData).mockResolvedValue(current);
    jest.mocked(repo.accountBadgeExists).mockResolvedValue(false);
    jest.mocked(repo.getActiveTakenIncidentCountForUser).mockResolvedValue(2);

    const result = await updateAccountService(1, { role: 'MAINTENANCE' }, 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('RESOURCE_IN_USE');
      expect(result.status).toBe(409);
    }
  });

  it('met à jour le compte avec succès quand tout est valide', async () => {
    const current = mockAccount();
    const updated = mockAccount({ first_name: 'Pierre' });
    jest.mocked(repo.getAccountData).mockResolvedValue(current);
    jest.mocked(repo.accountBadgeExists).mockResolvedValue(false);
    jest.mocked(repo.getActiveTakenIncidentCountForUser).mockResolvedValue(0);
    jest.mocked(repo.updateAccountData).mockResolvedValue(updated);
    jest.mocked(events.createAccountAuditEvent).mockResolvedValue(undefined);

    const result = await updateAccountService(1, { firstName: 'Pierre' }, 1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual(updated);
    expect(repo.updateAccountData).toHaveBeenCalledWith(1, { firstName: 'Pierre' }, false, null);
  });

  it.each([
    ['badge', mockAccount(), { badgeNumber: 'B002' }, mockAccount({ badge_number: 'B002' })],
    [
      'rôle',
      mockAccount({ role: 'MAINTENANCE' }),
      { role: 'RESPONSABLE' as const },
      mockAccount({ role: 'RESPONSABLE' }),
    ],
  ])(
    'demande la révocation des sessions après changement de %s',
    async (_label, current, updates, updated) => {
      jest.mocked(repo.getAccountData).mockResolvedValue(current);
      jest.mocked(repo.accountBadgeExists).mockResolvedValue(false);
      jest.mocked(repo.getActiveTakenIncidentCountForUser).mockResolvedValue(0);
      jest.mocked(repo.updateAccountData).mockResolvedValue(updated);
      jest.mocked(events.createAccountAuditEvent).mockResolvedValue(undefined);

      const result = await updateAccountService(1, updates, 1);

      expect(result.ok).toBe(true);
      expect(repo.updateAccountData).toHaveBeenCalledWith(1, updates, true, null);
    }
  );

  it('court-circuite une mise à jour sans changement réel', async () => {
    const current = mockAccount();
    jest.mocked(repo.getAccountData).mockResolvedValue(current);

    const result = await updateAccountService(
      1,
      {
        firstName: current.first_name,
        lastName: current.last_name,
        badgeNumber: current.badge_number,
        role: 'OPERATOR',
        email: current.email,
      },
      1
    );

    expect(result).toEqual({ ok: true, data: current });
    expect(repo.updateAccountData).not.toHaveBeenCalled();
    expect(events.createAccountAuditEvent).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'ajout',
      currentEmail: null,
      nextEmail: 'jean.dupont@example.test',
      action: 'configured',
    },
    {
      label: 'modification',
      currentEmail: 'ancienne@example.test',
      nextEmail: 'nouvelle@example.test',
      action: 'updated',
    },
    {
      label: 'suppression',
      currentEmail: 'jean.dupont@example.test',
      nextEmail: null,
      action: 'removed',
    },
  ])(
    "journalise le type d'action sans adresse lors de la $label d'un email",
    async ({ currentEmail, nextEmail, action }) => {
      const current = mockAccount({ email: currentEmail });
      const updated = mockAccount({ email: nextEmail });
      jest.mocked(repo.getAccountData).mockResolvedValue(current);
      jest.mocked(repo.updateAccountData).mockResolvedValue(updated);
      jest.mocked(events.createAccountAuditEvent).mockResolvedValue(undefined);

      await updateAccountService(1, { email: nextEmail }, 1);

      const auditChanges = jest.mocked(events.createAccountAuditEvent).mock.calls[0][3];
      expect(auditChanges).toEqual({ email: { action } });
      if (currentEmail) expect(JSON.stringify(auditChanges)).not.toContain(currentEmail);
      if (nextEmail) expect(JSON.stringify(auditChanges)).not.toContain(nextEmail);
    }
  );
});

// ─── deactivateAccountService ─────────────────────────────────────────────────

describe('deactivateAccountService', () => {
  it("retourne RESOURCE_IN_USE si l'utilisateur a des incidents actifs pris en charge", async () => {
    jest.mocked(repo.getActiveTakenIncidentCountForUser).mockResolvedValue(3);

    const result = await deactivateAccountService(1, 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('RESOURCE_IN_USE');
      expect(result.status).toBe(409);
    }
  });

  it("retourne NOT_FOUND si l'utilisateur n'existe pas", async () => {
    jest.mocked(repo.getActiveTakenIncidentCountForUser).mockResolvedValue(0);
    jest.mocked(repo.setAccountActive).mockResolvedValue(null);

    const result = await deactivateAccountService(999, 1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_FOUND');
  });

  it("désactive le compte avec succès quand il n'y a pas d'incidents actifs", async () => {
    const account = mockAccount({ is_active: false });
    jest.mocked(repo.getActiveTakenIncidentCountForUser).mockResolvedValue(0);
    jest.mocked(repo.setAccountActive).mockResolvedValue(account);
    jest.mocked(events.createAccountAuditEvent).mockResolvedValue(undefined);

    const result = await deactivateAccountService(1, 1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.is_active).toBe(false);
    expect(events.createAccountAuditEvent).toHaveBeenCalledWith(
      1,
      1,
      'USER_DEACTIVATED',
      null,
      null
    );
  });
});

// ─── deleteAccountService ─────────────────────────────────────────────────────

describe('deleteAccountService', () => {
  it("retourne RESOURCE_IN_USE si l'utilisateur a des incidents actifs pris en charge", async () => {
    jest.mocked(repo.getActiveTakenIncidentCountForUser).mockResolvedValue(1);

    const result = await deleteAccountService(1, 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('RESOURCE_IN_USE');
      expect(result.status).toBe(409);
    }
  });

  it("retourne NOT_FOUND si l'utilisateur n'existe pas", async () => {
    jest.mocked(repo.getActiveTakenIncidentCountForUser).mockResolvedValue(0);
    jest.mocked(repo.softDeleteAccount).mockResolvedValue(false);

    const result = await deleteAccountService(999, 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('NOT_FOUND');
      expect(result.status).toBe(404);
    }
  });

  it('supprime logiquement le compte avec succès', async () => {
    const account = mockAccount({
      first_name: 'Karim',
      last_name: 'Bensaïd',
      badge_number: 'B777',
    });
    jest.mocked(repo.getActiveTakenIncidentCountForUser).mockResolvedValue(0);
    jest.mocked(repo.getAccountData).mockResolvedValue(account);
    jest.mocked(repo.softDeleteAccount).mockResolvedValue(true);
    jest.mocked(events.createAccountAuditEvent).mockResolvedValue(undefined);

    const result = await deleteAccountService(1, 1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.message).toBe('Utilisateur supprimé.');
    // L'identité d'origine est figée dans l'event (pas le pseudonyme ANON).
    expect(events.createAccountAuditEvent).toHaveBeenCalledWith(
      1,
      1,
      'USER_SOFT_DELETED',
      null,
      null,
      { firstName: 'Karim', lastName: 'Bensaïd', badgeNumber: 'B777' }
    );
  });
});

// ─── resetAccountPasswordService ──────────────────────────────────────────────

describe('resetAccountPasswordService', () => {
  it("retourne NOT_FOUND si le compte n'existe pas", async () => {
    jest.mocked(repo.resetAccountPasswordData).mockResolvedValue(null);

    const result = await resetAccountPasswordService(999, 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('NOT_FOUND');
      expect(result.status).toBe(404);
    }
  });

  it('réinitialise le mot de passe avec succès', async () => {
    const account = mockAccount();
    jest.mocked(repo.resetAccountPasswordData).mockResolvedValue(account);
    jest.mocked(events.createAccountAuditEvent).mockResolvedValue(undefined);

    const result = await resetAccountPasswordService(1, 1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ ...account, password_setup_code: 'ABCD234567' });
    }
    expect(repo.resetAccountPasswordData).toHaveBeenCalledWith(
      1,
      'hashed-setup-code',
      new Date('2025-01-02T00:00:00Z'),
      null
    );
    expect(events.createAccountAuditEvent).toHaveBeenCalledWith(
      1,
      1,
      'USER_PASSWORD_RESET',
      null,
      null
    );
  });
});

// ─── getAccountImpactService ──────────────────────────────────────────────────

describe('getAccountImpactService', () => {
  it("retourne les compteurs d'impact de l'utilisateur", async () => {
    const impact = { reported_incidents: 5, taken_incidents: 3, active_taken_incidents: 0 };
    jest.mocked(repo.getAccountImpactData).mockResolvedValue(impact);

    const result = await getAccountImpactService(1);
    expect(result).toEqual(impact);
  });
});
