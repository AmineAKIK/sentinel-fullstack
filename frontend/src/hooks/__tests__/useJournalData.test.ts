import React from 'react';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router-dom';
import { listWorkshopHistoryEvents, listWorkshopLines } from '../../api/workshop';
import { WorkshopHistoryEvent } from '../../types';
import { useJournalData } from '../useJournalData';

vi.mock('../../api/workshop', () => ({
  listWorkshopHistoryEvents: vi.fn(),
  listWorkshopLines: vi.fn(),
}));

function event(id: number, createdAt: string): WorkshopHistoryEvent {
  return {
    id,
    incident_id: 1,
    event_type: 'INCIDENT_TAKEN',
    payload: null,
    created_at: createdAt,
    line_id: 1,
    line_number: '117',
    machine_id: 'MCH-1',
    robot_label: 'R01',
    head_number: 1,
    current_state: 'DEGRADEE',
    current_status: 'OPEN',
    first_name: 'Eden',
    last_name: 'AKIK',
    role: 'RESPONSABLE',
    badge_number: 'RE-01',
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(MemoryRouter, null, children);
}

function JournalNavigationHarness() {
  const journal = useJournalData();
  return React.createElement(
    'output',
    { 'aria-label': 'filtres Journal' },
    [
      journal.query,
      journal.statusFilter,
      journal.lineFilter,
      journal.machineFilter,
      journal.stateFilter,
      journal.eventTypeFilter,
      journal.startFilter,
      journal.endFilter,
    ].join('|')
  );
}

describe('useJournalData — pagination par curseur (lot 7, LIST-03)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listWorkshopLines).mockResolvedValue([]);
  });

  it('charge la première page et expose hasMore/nextCursor via le résultat', async () => {
    vi.mocked(listWorkshopHistoryEvents).mockResolvedValue({
      items: [event(1, '2026-03-02T10:00:00.000Z')],
      nextCursor: 'opaque-cursor-token',
    });

    const { result } = renderHook(() => useJournalData(), { wrapper });

    await waitFor(() => expect(result.current.historyEventsLoading).toBe(false));

    expect(result.current.historyEvents).toHaveLength(1);
    expect(result.current.hasMore).toBe(true);
  });

  it('accumule les événements de la page suivante sans dupliquer la première page', async () => {
    vi.mocked(listWorkshopHistoryEvents).mockResolvedValueOnce({
      items: [event(1, '2026-03-02T10:00:00.000Z')],
      nextCursor: 'cursor-page-2',
    });
    const { result } = renderHook(() => useJournalData(), { wrapper });
    await waitFor(() => expect(result.current.historyEventsLoading).toBe(false));

    vi.mocked(listWorkshopHistoryEvents).mockResolvedValueOnce({
      items: [event(2, '2026-03-01T10:00:00.000Z')],
      nextCursor: null,
    });
    act(() => {
      result.current.loadMore();
    });
    await waitFor(() => expect(result.current.loadingMore).toBe(false));

    expect(result.current.historyEvents.map((e) => e.id)).toEqual([1, 2]);
    expect(result.current.hasMore).toBe(false);
  });

  it('transmet le curseur reçu à listWorkshopHistoryEvents lors du chargement suivant', async () => {
    vi.mocked(listWorkshopHistoryEvents).mockResolvedValueOnce({
      items: [event(1, '2026-03-02T10:00:00.000Z')],
      nextCursor: 'cursor-abc',
    });
    const { result } = renderHook(() => useJournalData(), { wrapper });
    await waitFor(() => expect(result.current.historyEventsLoading).toBe(false));

    vi.mocked(listWorkshopHistoryEvents).mockResolvedValueOnce({ items: [], nextCursor: null });
    act(() => {
      result.current.loadMore();
    });
    await waitFor(() => expect(result.current.loadingMore).toBe(false));

    const lastCallParams = vi.mocked(listWorkshopHistoryEvents).mock.calls[1][0];
    expect(lastCallParams?.cursor).toBe('cursor-abc');
  });

  it('réinitialise la liste (repart de la première page) quand un filtre change', async () => {
    vi.mocked(listWorkshopHistoryEvents).mockResolvedValue({
      items: [event(1, '2026-03-02T10:00:00.000Z')],
      nextCursor: null,
    });
    const { result } = renderHook(() => useJournalData(), { wrapper });
    await waitFor(() => expect(result.current.historyEventsLoading).toBe(false));

    vi.mocked(listWorkshopHistoryEvents).mockResolvedValue({
      items: [event(2, '2026-03-05T10:00:00.000Z')],
      nextCursor: null,
    });
    act(() => result.current.setEventTypeFilter('INCIDENT_CLOSED'));
    await waitFor(() => expect(result.current.historyEventsLoading).toBe(false));
    await waitFor(() => expect(result.current.historyEvents.map((e) => e.id)).toEqual([2]));
  });

  it('ne rappelle pas loadMore quand hasMore est faux', async () => {
    vi.mocked(listWorkshopHistoryEvents).mockResolvedValue({
      items: [event(1, '2026-03-02T10:00:00.000Z')],
      nextCursor: null,
    });
    const { result } = renderHook(() => useJournalData(), { wrapper });
    await waitFor(() => expect(result.current.historyEventsLoading).toBe(false));

    const callsBefore = vi.mocked(listWorkshopHistoryEvents).mock.calls.length;
    act(() => result.current.loadMore());

    expect(vi.mocked(listWorkshopHistoryEvents).mock.calls.length).toBe(callsBefore);
  });

  it('transmet au Journal les bornes locales inclusives de l’URL en hiver Europe/Paris', async () => {
    vi.stubEnv('TZ', 'Europe/Paris');
    vi.mocked(listWorkshopHistoryEvents).mockResolvedValue({ items: [], nextCursor: null });
    const journalWrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/workshop/journal?start=2026-01-15&end=2026-01-15'] },
        children
      );

    const { unmount } = renderHook(() => useJournalData(), { wrapper: journalWrapper });
    try {
      await waitFor(() =>
        expect(listWorkshopHistoryEvents).toHaveBeenCalledWith(
          expect.objectContaining({
            start: '2026-01-14T23:00:00.000Z',
            end: '2026-01-15T22:59:59.999Z',
          }),
          expect.anything()
        )
      );
    } finally {
      unmount();
      vi.unstubAllEnvs();
    }
  });

  it('resynchronise toute l’interface lors des navigations retour puis avance', async () => {
    vi.mocked(listWorkshopHistoryEvents).mockResolvedValue({ items: [], nextCursor: null });
    const before =
      '/workshop/journal?q=avant&status=OPEN&line=1&machine=M-1&state=DEGRADEE&event=INCIDENT_TAKEN&start=2026-01-01&end=2026-01-02';
    const after =
      '/workshop/journal?q=apres&status=CLOSED&line=2&machine=M-2&state=INDISPONIBLE&event=INCIDENT_CLOSED&start=2026-02-01&end=2026-02-02';
    const router = createMemoryRouter(
      [
        {
          path: '/workshop/journal',
          element: React.createElement(JournalNavigationHarness),
        },
      ],
      { initialEntries: [before, after], initialIndex: 1 }
    );
    render(React.createElement(RouterProvider, { router }));

    await waitFor(() =>
      expect(screen.getByLabelText('filtres Journal')).toHaveTextContent(
        'apres|CLOSED|2|M-2|INDISPONIBLE|INCIDENT_CLOSED|2026-02-01|2026-02-02'
      )
    );

    await act(async () => {
      await router.navigate(-1);
    });
    expect(router.state.location.pathname + router.state.location.search).toBe(before);
    await waitFor(() =>
      expect(screen.getByLabelText('filtres Journal')).toHaveTextContent(
        'avant|OPEN|1|M-1|DEGRADEE|INCIDENT_TAKEN|2026-01-01|2026-01-02'
      )
    );

    await act(async () => {
      await router.navigate(1);
    });
    expect(router.state.location.pathname + router.state.location.search).toBe(after);
    await waitFor(() =>
      expect(screen.getByLabelText('filtres Journal')).toHaveTextContent(
        'apres|CLOSED|2|M-2|INDISPONIBLE|INCIDENT_CLOSED|2026-02-01|2026-02-02'
      )
    );
  });
});
