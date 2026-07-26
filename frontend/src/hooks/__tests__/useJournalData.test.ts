import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
});
