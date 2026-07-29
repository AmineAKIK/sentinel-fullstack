import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { getBoardData, logoutBoardSession } from '../../api/board';
import { getUnifiedMe } from '../../api/unifiedAuth';
import { MutationFeedbackProvider } from '../../components/ui/MutationFeedback';
import WorkshopBoardPage from '../WorkshopBoardPage';

vi.mock('../../api/board', () => ({
  getBoardData: vi.fn(),
  logoutBoardSession: vi.fn(),
}));

vi.mock('../../api/unifiedAuth', () => ({
  getUnifiedMe: vi.fn(),
}));

describe('WorkshopBoardPage — focus après échec de déconnexion', () => {
  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    vi.mocked(getBoardData).mockResolvedValue({
      incidents: [],
      lines: [],
      metrics: {},
    } as never);
    vi.mocked(getUnifiedMe).mockRejectedValue(new Error('Session kiosque'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('restaure le focus sur Quitter une fois le bouton réactivé', async () => {
    let rejectLogout: (reason: unknown) => void = () => undefined;
    vi.mocked(logoutBoardSession).mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectLogout = reject;
        })
    );
    const user = userEvent.setup();

    render(
      <MemoryRouter
        initialEntries={['/board?screen=ecran-focus']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <MutationFeedbackProvider>
          <WorkshopBoardPage />
        </MutationFeedbackProvider>
      </MemoryRouter>
    );

    const quit = await screen.findByRole('button', { name: 'Quitter' });
    await user.click(quit);
    await waitFor(() => expect(quit).toBeDisabled());

    // Chromium retire le focus d'un bouton qui devient disabled pendant la
    // requête. jsdom le conserve : déplacer le focus reproduit ici cette perte
    // native avant la résolution de la requête.
    screen.getByRole('button', { name: 'Réglages' }).focus();
    expect(quit).not.toHaveFocus();

    await act(async () => {
      rejectLogout(new TypeError('Failed to fetch'));
      await Promise.resolve();
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Impossible de quitter le Board. Réessayez.'
    );
    await waitFor(() => expect(quit).toBeEnabled());
    expect(quit).toHaveFocus();
  });
});
