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

type JournalPage = Awaited<ReturnType<typeof listWorkshopHistoryEvents>>;

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
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

    vi.mocked(listWorkshopHistoryEvents).mockResolvedValueOnce({
      items: [],
      nextCursor: null,
    });
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

  it('annule une suite et réinitialise atomiquement son état quand un filtre change', async () => {
    const pendingContinuation = deferred<JournalPage>();
    const filteredFirstPage = deferred<JournalPage>();
    let continuationSignal: AbortSignal | undefined;

    vi.mocked(listWorkshopHistoryEvents)
      .mockResolvedValueOnce({
        items: [event(1, '2026-03-02T10:00:00.000Z')],
        nextCursor: 'cursor-old-page-2',
      })
      .mockImplementationOnce((_params, signal) => {
        continuationSignal = signal;
        return pendingContinuation.promise;
      })
      .mockImplementationOnce(() => filteredFirstPage.promise);

    const { result } = renderHook(() => useJournalData(), { wrapper });
    await waitFor(() => expect(result.current.historyEventsLoading).toBe(false));

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.loadingMore).toBe(true));

    act(() => result.current.setEventTypeFilter('INCIDENT_CLOSED'));
    await waitFor(() => expect(listWorkshopHistoryEvents).toHaveBeenCalledTimes(3));

    expect(continuationSignal?.aborted).toBe(true);
    expect(vi.mocked(listWorkshopHistoryEvents).mock.calls[2][0]).toMatchObject({
      eventType: 'INCIDENT_CLOSED',
    });
    expect(vi.mocked(listWorkshopHistoryEvents).mock.calls[2][0].cursor).toBeUndefined();
    expect(result.current.historyEvents).toEqual([]);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.loadingMore).toBe(false);
    expect(result.current.historyEventsLoading).toBe(true);
    expect(result.current.error).toBe('');

    await act(async () => {
      filteredFirstPage.resolve({
        items: [event(2, '2026-03-05T10:00:00.000Z')],
        nextCursor: 'cursor-new-page-2',
      });
      await filteredFirstPage.promise;
    });
    await waitFor(() => expect(result.current.historyEvents.map(({ id }) => id)).toEqual([2]));
    expect(result.current.loadingMore).toBe(false);
    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      pendingContinuation.resolve({
        items: [event(99, '2026-02-01T10:00:00.000Z')],
        nextCursor: null,
      });
      await pendingContinuation.promise;
    });
    expect(result.current.historyEvents.map(({ id }) => id)).toEqual([2]);
  });

  it('ignore la réponse tardive de deux changements rapides et conserve la génération récente', async () => {
    const firstFilterPage = deferred<JournalPage>();
    const secondFilterPage = deferred<JournalPage>();
    let firstFilterSignal: AbortSignal | undefined;

    vi.mocked(listWorkshopHistoryEvents)
      .mockResolvedValueOnce({
        items: [event(1, '2026-03-02T10:00:00.000Z')],
        nextCursor: null,
      })
      // Ces deux promesses ignorent volontairement l'abort du transport : la
      // génération de requête doit protéger l'état même si une réponse arrive.
      .mockImplementationOnce((_params, signal) => {
        firstFilterSignal = signal;
        return firstFilterPage.promise;
      })
      .mockImplementationOnce(() => secondFilterPage.promise);

    const { result } = renderHook(() => useJournalData(), { wrapper });
    await waitFor(() => expect(result.current.historyEventsLoading).toBe(false));

    act(() => result.current.setEventTypeFilter('INCIDENT_CLOSED'));
    await waitFor(() => expect(listWorkshopHistoryEvents).toHaveBeenCalledTimes(2));
    act(() => result.current.setEventTypeFilter('INCIDENT_CREATED'));
    await waitFor(() => expect(listWorkshopHistoryEvents).toHaveBeenCalledTimes(3));

    expect(firstFilterSignal?.aborted).toBe(true);

    await act(async () => {
      secondFilterPage.resolve({
        items: [event(3, '2026-03-06T10:00:00.000Z')],
        nextCursor: null,
      });
      await secondFilterPage.promise;
    });
    await waitFor(() => expect(result.current.historyEvents.map(({ id }) => id)).toEqual([3]));

    await act(async () => {
      firstFilterPage.resolve({
        items: [event(2, '2026-03-05T10:00:00.000Z')],
        nextCursor: null,
      });
      await firstFilterPage.promise;
    });
    expect(result.current.historyEvents.map(({ id }) => id)).toEqual([3]);
    expect(result.current.error).toBe('');
  });

  it.each([
    {
      label: 'une seule page plus courte',
      filteredItems: [event(3, '2026-03-06T10:00:00.000Z')],
    },
    { label: 'aucun résultat', filteredItems: [] },
  ])(
    'efface sans flash les pages déjà chargées quand le nouveau filtre donne $label',
    async ({ filteredItems }) => {
      const filteredFirstPage = deferred<JournalPage>();
      vi.mocked(listWorkshopHistoryEvents)
        .mockResolvedValueOnce({
          items: [event(1, '2026-03-03T10:00:00.000Z')],
          nextCursor: 'cursor-page-2',
        })
        .mockResolvedValueOnce({
          items: [event(2, '2026-03-02T10:00:00.000Z')],
          nextCursor: 'cursor-page-3',
        })
        .mockImplementationOnce(() => filteredFirstPage.promise);

      const { result } = renderHook(() => useJournalData(), { wrapper });
      await waitFor(() => expect(result.current.historyEventsLoading).toBe(false));

      act(() => result.current.loadMore());
      await waitFor(() => expect(result.current.historyEvents.map(({ id }) => id)).toEqual([1, 2]));
      expect(result.current.hasMore).toBe(true);

      act(() => result.current.setEventTypeFilter('INCIDENT_CLOSED'));
      await waitFor(() => expect(listWorkshopHistoryEvents).toHaveBeenCalledTimes(3));

      expect(result.current.historyEvents).toEqual([]);
      expect(result.current.hasMore).toBe(false);
      expect(result.current.loadingMore).toBe(false);
      expect(result.current.historyEventsLoading).toBe(true);

      await act(async () => {
        filteredFirstPage.resolve({ items: filteredItems, nextCursor: null });
        await filteredFirstPage.promise;
      });
      await waitFor(() => expect(result.current.historyEvents).toEqual(filteredItems));
      expect(result.current.hasMore).toBe(false);
      expect(result.current.historyEventsLoading).toBe(false);
    }
  );

  it('efface liste, curseur et chargement quand une période saisie devient inversée', async () => {
    vi.mocked(listWorkshopHistoryEvents)
      .mockResolvedValueOnce({
        items: [event(1, '2026-03-03T10:00:00.000Z')],
        nextCursor: 'cursor-initial',
      })
      .mockResolvedValueOnce({
        items: [event(2, '2026-03-02T10:00:00.000Z')],
        nextCursor: 'cursor-after-start',
      });

    const { result } = renderHook(() => useJournalData(), { wrapper });
    await waitFor(() => expect(result.current.historyEventsLoading).toBe(false));

    act(() => result.current.updateStartFilter('2026-03-10'));
    await waitFor(() => expect(listWorkshopHistoryEvents).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.historyEvents.map(({ id }) => id)).toEqual([2]));

    act(() => result.current.updateEndFilter('2026-03-01'));
    await waitFor(() =>
      expect(result.current.periodError).toBe(
        'La date de début doit être antérieure à la date de fin.'
      )
    );

    expect(listWorkshopHistoryEvents).toHaveBeenCalledTimes(2);
    expect(result.current.historyEvents).toEqual([]);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.loadingMore).toBe(false);
    expect(result.current.historyEventsLoading).toBe(false);
  });

  it('annule réellement une suite en vol au démontage sans publier d’erreur', async () => {
    const pendingContinuation = deferred<JournalPage>();
    let continuationSignal: AbortSignal | undefined;
    vi.mocked(listWorkshopHistoryEvents)
      .mockResolvedValueOnce({
        items: [event(1, '2026-03-02T10:00:00.000Z')],
        nextCursor: 'cursor-page-2',
      })
      .mockImplementationOnce((_params, signal) => {
        continuationSignal = signal;
        return pendingContinuation.promise;
      });

    const { result, unmount } = renderHook(() => useJournalData(), { wrapper });
    await waitFor(() => expect(result.current.historyEventsLoading).toBe(false));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.loadingMore).toBe(true));

    unmount();
    try {
      expect(continuationSignal?.aborted).toBe(true);
      expect(result.current.error).toBe('');
    } finally {
      pendingContinuation.resolve({ items: [], nextCursor: null });
      await pendingContinuation.promise;
    }
  });

  it('termine le chargement et expose une vraie erreur de première page', async () => {
    vi.mocked(listWorkshopHistoryEvents).mockRejectedValueOnce(new Error('network unavailable'));

    const { result } = renderHook(() => useJournalData(), { wrapper });

    await waitFor(() => expect(result.current.historyEventsLoading).toBe(false));
    expect(result.current.error).toBe('Impossible de charger le journal atelier.');
    expect(result.current.historyEvents).toEqual([]);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.loadingMore).toBe(false);
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
    vi.mocked(listWorkshopHistoryEvents).mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    const journalWrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        MemoryRouter,
        {
          initialEntries: ['/workshop/journal?start=2026-01-15&end=2026-01-15'],
        },
        children
      );

    const { unmount } = renderHook(() => useJournalData(), {
      wrapper: journalWrapper,
    });
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
    vi.mocked(listWorkshopHistoryEvents).mockResolvedValue({
      items: [],
      nextCursor: null,
    });
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
