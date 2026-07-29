import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('restaure le focus après une réauthentification refusée et la fin du pending', async () => {
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
    fireEvent.change(password, { target: { value: 'mot-de-passe-incorrect' } });
    fireEvent.click(screen.getByRole('button', { name: 'Révoquer' }));
    await waitFor(() => expect(password).toBeDisabled());

    await act(async () => {
      rejectVerification(
        new ApiResponseError('REAUTHENTICATION_FAILED', 'Mot de passe incorrect.', 401)
      );
      await Promise.resolve();
    });

    expect(await screen.findByText('Mot de passe incorrect.')).toBeVisible();
    await waitFor(() => expect(password).toBeEnabled());
    expect(password).toHaveFocus();
  });
});
