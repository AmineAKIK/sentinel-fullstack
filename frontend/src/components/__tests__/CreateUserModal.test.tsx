import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render as testingLibraryRender, screen, waitFor } from '@testing-library/react';

vi.mock('../../api/accounts', () => ({
  checkBadgeAvailability: vi.fn(),
  createAccount: vi.fn(),
}));

import * as accountsApi from '../../api/accounts';
import CreateUserModal from '../CreateUserModal';
import type { SentinelUser } from '../../types';
import { ApiResponseError } from '../../api/client';
import { MutationFeedbackProvider } from '../ui/MutationFeedback';

function render(ui: React.ReactNode) {
  return testingLibraryRender(<MutationFeedbackProvider>{ui}</MutationFeedbackProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(accountsApi.checkBadgeAvailability).mockResolvedValue({ exists: false });
});

describe('CreateUserModal — email professionnel', () => {
  it("valide, prévisualise et transmet l'email à la création", async () => {
    const createdUser = {
      id: 1,
      first_name: 'Jean',
      last_name: 'Dupont',
      badge_number: '1001',
      email: 'jean.dupont@example.test',
      role: 'OPERATOR',
      is_active: true,
      has_password: false,
      has_password_setup_code: true,
      password_setup_code: 'ABC123DEF4',
      password_setup_expires_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as SentinelUser;
    vi.mocked(accountsApi.createAccount).mockResolvedValue(createdUser);

    render(<CreateUserModal onClose={vi.fn()} onSuccess={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Prénom *'), { target: { value: 'Jean' } });
    fireEvent.change(screen.getByLabelText('Nom *'), { target: { value: 'Dupont' } });
    fireEvent.change(screen.getByLabelText('Numéro de badge *'), { target: { value: '1001' } });
    fireEvent.change(screen.getByLabelText('Email professionnel (notifications)'), {
      target: { value: ' Jean.Dupont@Example.Test ' },
    });
    fireEvent.click(screen.getByRole('combobox', { name: 'Rôle' }));
    fireEvent.click(screen.getByRole('option', { name: 'Opérateur' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aperçu' }));

    await waitFor(() => {
      expect(screen.getByText('Jean.Dupont@Example.Test')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Confirmer la création' }));

    await waitFor(() => {
      expect(accountsApi.createAccount).toHaveBeenCalledWith({
        firstName: 'Jean',
        lastName: 'Dupont',
        badgeNumber: '1001',
        email: 'Jean.Dupont@Example.Test',
        role: 'OPERATOR',
      });
    });
  });

  it("refuse une adresse professionnelle invalide avant l'appel API", async () => {
    render(<CreateUserModal onClose={vi.fn()} onSuccess={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Prénom *'), { target: { value: 'Jean' } });
    fireEvent.change(screen.getByLabelText('Nom *'), { target: { value: 'Dupont' } });
    fireEvent.change(screen.getByLabelText('Numéro de badge *'), { target: { value: '1001' } });
    fireEvent.change(screen.getByLabelText('Email professionnel (notifications)'), {
      target: { value: 'email-invalide' },
    });
    fireEvent.click(screen.getByRole('combobox', { name: 'Rôle' }));
    fireEvent.click(screen.getByRole('option', { name: 'Opérateur' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aperçu' }));

    expect(await screen.findByText("L'adresse email professionnelle est invalide.")).toBeDefined();
    expect(accountsApi.checkBadgeAvailability).not.toHaveBeenCalled();
    expect(accountsApi.createAccount).not.toHaveBeenCalled();
  });
});

describe('CreateUserModal — rôles attribuables (RC5-8)', () => {
  it.each([
    ['Opérateur', 'OPERATOR'],
    ['Technicien', 'MAINTENANCE'],
    ['Responsable', 'RESPONSABLE'],
  ])('prévisualise et crée un utilisateur avec le rôle autorisé %s', async (label, roleValue) => {
    const createdUser = {
      id: 1,
      first_name: 'Jean',
      last_name: 'Dupont',
      badge_number: '1001',
      role: roleValue,
      is_active: true,
      has_password: false,
      has_password_setup_code: true,
      password_setup_code: 'ABC123DEF4',
      password_setup_expires_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as SentinelUser;
    vi.mocked(accountsApi.createAccount).mockResolvedValue(createdUser);

    render(<CreateUserModal onClose={vi.fn()} onSuccess={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Prénom *'), { target: { value: 'Jean' } });
    fireEvent.change(screen.getByLabelText('Nom *'), { target: { value: 'Dupont' } });
    fireEvent.change(screen.getByLabelText('Numéro de badge *'), { target: { value: '1001' } });
    fireEvent.click(screen.getByRole('combobox', { name: 'Rôle' }));
    fireEvent.click(screen.getByRole('option', { name: label }));
    fireEvent.click(screen.getByRole('button', { name: 'Aperçu' }));

    await waitFor(() => {
      expect(screen.getByText('Aperçu utilisateur')).toBeDefined();
    });
    // L'aperçu affiche exactement le rôle choisi, jamais une valeur protégée.
    expect(screen.getByText(roleValue)).toBeDefined();
    expect(screen.queryByText('ADMIN')).toBeNull();
    expect(screen.queryByText('SYSTEM')).toBeNull();
    expect(screen.queryByText('Administrateur')).toBeNull();
    expect(screen.queryByText('Système')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmer la création' }));

    await waitFor(() => {
      expect(accountsApi.createAccount).toHaveBeenCalledWith(
        expect.objectContaining({ role: roleValue })
      );
    });
    // Aucun payload envoyé au fil du test n'a jamais porté un rôle protégé.
    for (const call of vi.mocked(accountsApi.createAccount).mock.calls) {
      expect(['OPERATOR', 'MAINTENANCE', 'RESPONSABLE']).toContain(call[0].role);
    }
  });

  it('affiche un message accessible et sûr quand le serveur refuse la création', async () => {
    vi.mocked(accountsApi.createAccount).mockRejectedValue(
      new ApiResponseError('VALIDATION_ERROR', 'internal detail not for users', 400)
    );

    render(<CreateUserModal onClose={vi.fn()} onSuccess={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Prénom *'), { target: { value: 'Jean' } });
    fireEvent.change(screen.getByLabelText('Nom *'), { target: { value: 'Dupont' } });
    fireEvent.change(screen.getByLabelText('Numéro de badge *'), { target: { value: '1001' } });
    fireEvent.click(screen.getByRole('combobox', { name: 'Rôle' }));
    fireEvent.click(screen.getByRole('option', { name: 'Opérateur' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aperçu' }));

    await waitFor(() => {
      expect(screen.getByText('Aperçu utilisateur')).toBeDefined();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer la création' }));

    const alert = await screen.findByRole('alert');
    // Message générique traduit, jamais le detail brut du serveur.
    expect(alert.textContent).not.toContain('internal detail not for users');
    expect(alert.textContent).toMatch(/erreur/i);
  });
});
