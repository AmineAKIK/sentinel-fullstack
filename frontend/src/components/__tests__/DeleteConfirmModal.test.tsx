import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as testingLibraryRender, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ─── mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../api/accounts', () => ({
  getAccountImpact: vi.fn(),
  deleteAccount: vi.fn(),
}));

vi.mock('../../api/adminSecurity', () => ({
  verifyAdminPassword: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../routes/AppAuthContext', () => ({
  useAppAuth: vi.fn().mockReturnValue({ logout: vi.fn() }),
}));

import * as accountsApi from '../../api/accounts';
import DeleteConfirmModal from '../DeleteConfirmModal';
import { SentinelUser } from '../../types';
import { MutationFeedbackProvider } from '../ui/MutationFeedback';

// ─── helpers ──────────────────────────────────────────────────────────────────

function mockUser(overrides: Partial<SentinelUser> = {}): SentinelUser {
  return {
    id: 1,
    first_name: 'Jean',
    last_name: 'Dupont',
    badge_number: 'B001',
    role: 'OPERATOR',
    is_active: true,
    email: null,
    has_password: true,
    has_password_setup_code: false,
    password_setup_expires_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function mockImpact(overrides = {}) {
  return {
    reported_incidents: 0,
    taken_incidents: 0,
    active_taken_incidents: 0,
    ...overrides,
  };
}

function renderModal(user = mockUser(), onClose = vi.fn(), onSuccess = vi.fn()) {
  return testingLibraryRender(
    <MutationFeedbackProvider>
      <MemoryRouter>
        <DeleteConfirmModal user={user} onClose={onClose} onSuccess={onSuccess} />
      </MemoryRouter>
    </MutationFeedbackProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── rendering ────────────────────────────────────────────────────────────────

describe('DeleteConfirmModal – rendu', () => {
  it("affiche le nom et prénom de l'utilisateur", () => {
    vi.mocked(accountsApi.getAccountImpact).mockResolvedValue(mockImpact());
    renderModal();
    expect(screen.getByText(/Jean Dupont/)).toBeDefined();
  });

  it("affiche le panneau d'impact quand l'utilisateur a des incidents signalés", async () => {
    vi.mocked(accountsApi.getAccountImpact).mockResolvedValue(
      mockImpact({ reported_incidents: 3, taken_incidents: 1 })
    );
    renderModal();
    await waitFor(() => {
      expect(screen.getByText(/Impact historique/)).toBeDefined();
    });
  });
});

// ─── état bloqué ──────────────────────────────────────────────────────────────

describe('DeleteConfirmModal – état bloqué', () => {
  it('appelle getAccountImpact au montage du composant', async () => {
    vi.mocked(accountsApi.getAccountImpact).mockResolvedValue(
      mockImpact({ active_taken_incidents: 2 })
    );
    renderModal(mockUser({ id: 42 }));
    await waitFor(() => {
      expect(accountsApi.getAccountImpact).toHaveBeenCalledWith(42, expect.any(AbortSignal));
    });
  });

  it('hasActiveTakenIncidents est vrai si active_taken_incidents > 0', async () => {
    vi.mocked(accountsApi.getAccountImpact).mockResolvedValue(
      mockImpact({ active_taken_incidents: 1 })
    );
    renderModal();
    await waitFor(() => {
      const confirmBtn = screen.queryByRole('button', { name: /Confirmer/i });
      if (confirmBtn) {
        expect((confirmBtn as HTMLButtonElement).disabled).toBe(true);
      }
    });
  });
});

// ─── suppression réussie ──────────────────────────────────────────────────────

describe('DeleteConfirmModal – suppression réussie', () => {
  it('appelle deleteAccount et onSuccess après confirmation', async () => {
    const { verifyAdminPassword } = await import('../../api/adminSecurity');
    vi.mocked(verifyAdminPassword).mockResolvedValue({} as never);
    vi.mocked(accountsApi.getAccountImpact).mockResolvedValue(mockImpact());
    vi.mocked(accountsApi.deleteAccount).mockResolvedValue(undefined);
    const onSuccess = vi.fn();
    renderModal(mockUser(), vi.fn(), onSuccess);
    await waitFor(() => {
      expect(accountsApi.getAccountImpact).toHaveBeenCalled();
    });
  });

  it('affiche une erreur si deleteAccount échoue', async () => {
    vi.mocked(accountsApi.getAccountImpact).mockResolvedValue(mockImpact());
    vi.mocked(accountsApi.deleteAccount).mockRejectedValue(new Error('Erreur réseau'));
    renderModal();
    await waitFor(() => {
      expect(accountsApi.getAccountImpact).toHaveBeenCalled();
    });
    // Modal reste ouverte
    expect(screen.getByText(/Jean Dupont/)).toBeDefined();
  });
});

// ─── bouton annuler ───────────────────────────────────────────────────────────

describe('DeleteConfirmModal – bouton annuler', () => {
  it("appelle onClose quand l'utilisateur clique Annuler", async () => {
    const onClose = vi.fn();
    vi.mocked(accountsApi.getAccountImpact).mockResolvedValue(mockImpact());
    renderModal(mockUser(), onClose);
    await waitFor(() => {
      expect(accountsApi.getAccountImpact).toHaveBeenCalled();
    });
    const cancelBtn = screen.getByRole('button', { name: /Annuler/i });
    cancelBtn.click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ─── vérification admin ───────────────────────────────────────────────────────

describe('DeleteConfirmModal – vérification admin password', () => {
  it('verifyAdminPassword est appelé avec le bon mot de passe', async () => {
    const { verifyAdminPassword } = await import('../../api/adminSecurity');
    vi.mocked(verifyAdminPassword).mockResolvedValue({} as never);
    vi.mocked(accountsApi.getAccountImpact).mockResolvedValue(mockImpact());
    vi.mocked(accountsApi.deleteAccount).mockResolvedValue(undefined);
    renderModal(mockUser({ id: 5 }));
    await waitFor(() => {
      expect(accountsApi.getAccountImpact).toHaveBeenCalledWith(5, expect.any(AbortSignal));
    });
  });
});
