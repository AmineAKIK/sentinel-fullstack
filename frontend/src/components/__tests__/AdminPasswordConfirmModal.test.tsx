import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiResponseError } from '../../api/client';
import { verifyAdminPassword } from '../../api/adminSecurity';
import AdminPasswordConfirmModal from '../AdminPasswordConfirmModal';
import { MutationFeedbackProvider } from '../ui/MutationFeedback';

vi.mock('../../api/adminSecurity', () => ({
  verifyAdminPassword: vi.fn(),
}));

describe('AdminPasswordConfirmModal', () => {
  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('associe l’erreur au champ et restaure son focus après un refus activé au clavier', async () => {
    const user = userEvent.setup();
    let rejectVerification: (reason: unknown) => void = () => undefined;
    vi.mocked(verifyAdminPassword).mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectVerification = reject;
        })
    );

    render(
      <MutationFeedbackProvider>
        <AdminPasswordConfirmModal
          title="Confirmer l’action"
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          confirmLabel="Révoquer"
          mutationKey="test:admin-password"
          successMessage="Action confirmée."
        >
          <p>Confirmation sensible.</p>
        </AdminPasswordConfirmModal>
      </MutationFeedbackProvider>
    );

    const password = screen.getByLabelText('Mot de passe administrateur');
    await user.type(password, 'mot-de-passe-incorrect');
    const confirm = screen.getByRole('button', { name: 'Révoquer' });
    confirm.focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(password).toBeDisabled());

    await act(async () => {
      rejectVerification(
        new ApiResponseError('REAUTHENTICATION_FAILED', 'Mot de passe incorrect.', 401)
      );
      await Promise.resolve();
    });

    const passwordError = await screen.findByText('Mot de passe incorrect.');
    expect(passwordError).toBeVisible();
    expect(passwordError).toHaveAttribute('role', 'alert');
    expect(passwordError).toHaveAttribute('id', 'admin-password-error');
    await waitFor(() => expect(password).toBeEnabled());
    expect(password).toHaveAttribute('aria-invalid', 'true');
    expect(password).toHaveAttribute('aria-describedby', 'admin-password-error');
    expect(password).toHaveAccessibleDescription('Mot de passe incorrect.');
    expect(password).toHaveFocus();
  });
});
