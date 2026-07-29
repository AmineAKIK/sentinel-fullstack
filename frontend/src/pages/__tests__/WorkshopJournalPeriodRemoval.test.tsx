import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { listWorkshopHistoryEvents, listWorkshopLines } from '../../api/workshop';
import WorkshopJournalPage from '../WorkshopJournalPage';

vi.mock('../../api/workshop', () => ({
  listWorkshopHistoryEvents: vi.fn(),
  listWorkshopLines: vi.fn(),
}));

vi.mock('../../routes/AppAuthContext', () => ({
  useAppAuth: () => ({
    session: {
      accountType: 'workshop',
      user: {
        id: 3,
        first_name: 'Eden',
        last_name: 'AKIK',
        badge_number: 'RE-01',
        role: 'RESPONSABLE',
      },
    },
    loading: false,
    setSession: vi.fn(),
    logout: vi.fn(),
  }),
}));

describe('WorkshopJournalPage — suppression de la période', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listWorkshopLines).mockResolvedValue([]);
    vi.mocked(listWorkshopHistoryEvents).mockResolvedValue({ items: [], nextCursor: null });
  });

  it('le clic sur la vraie puce retire start et end de l’URL comme de l’interface', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [
        {
          path: '/workshop/journal',
          element: <WorkshopJournalPage />,
        },
      ],
      {
        initialEntries: ['/workshop/journal?status=OPEN&start=2026-03-01&end=2026-03-31'],
      }
    );
    render(<RouterProvider router={router} />);

    expect(screen.getByLabelText('Depuis le')).toHaveValue('2026-03-01');
    expect(screen.getByLabelText("Jusqu'au")).toHaveValue('2026-03-31');
    const periodChip = screen.getByRole('button', {
      name: /Retirer le filtre Période : 2026-03-01 → 2026-03-31/i,
    });

    await user.click(periodChip);

    await waitFor(() => {
      const params = new URLSearchParams(router.state.location.search);
      expect(params.get('status')).toBe('OPEN');
      expect(params.has('start')).toBe(false);
      expect(params.has('end')).toBe(false);
      expect(screen.getByLabelText('Depuis le')).toHaveValue('');
      expect(screen.getByLabelText("Jusqu'au")).toHaveValue('');
      expect(screen.queryByRole('button', { name: /Retirer le filtre Période/i })).toBeNull();
    });
  });
});
