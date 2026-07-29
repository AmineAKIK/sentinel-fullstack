import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WorkshopBoardPage from '../WorkshopBoardPage';
import { getBoardData } from '../../api/board';
import { getUnifiedMe } from '../../api/unifiedAuth';

vi.mock('../../api/board', () => ({
  getBoardData: vi.fn(),
  logoutBoardSession: vi.fn(),
}));

vi.mock('../../api/unifiedAuth', () => ({
  getUnifiedMe: vi.fn(),
}));

vi.mock('../../components/ui/MutationFeedback', () => ({
  useMutationRunner: () => ({
    execute: vi.fn(),
    isPending: () => false,
  }),
}));

function renderSettings() {
  render(
    <MemoryRouter initialEntries={['/board?screen=ecran-a11y']}>
      <WorkshopBoardPage />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Réglages' }));
}

describe('WorkshopBoardPage — noms accessibles des réglages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBoardData).mockResolvedValue({
      incidents: [],
      lines: [],
      metrics: {},
    } as never);
    vi.mocked(getUnifiedMe).mockRejectedValue(new Error('Session kiosk'));
  });

  it.each([
    ['combobox', "Type d'écran"],
    ['combobox', 'Incidents par page'],
    ['slider', 'Vitesse de rotation'],
  ] as const)('nomme le contrôle %s « %s »', async (role, name) => {
    renderSettings();

    await waitFor(() => {
      expect(screen.getByRole(role, { name })).toBeInTheDocument();
    });
  });
});
