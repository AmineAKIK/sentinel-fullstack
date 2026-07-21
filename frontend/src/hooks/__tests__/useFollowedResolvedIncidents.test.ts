import { act, renderHook, waitFor } from '@testing-library/react';
import { listWorkshopFollowedResolvedIncidents } from '../../api/workshop';
import { WorkshopIncident } from '../../types';
import { useFollowedResolvedIncidents } from '../useFollowedResolvedIncidents';

vi.mock('../../api/workshop', () => ({
  listWorkshopFollowedResolvedIncidents: vi.fn(),
}));

function incident(id: number): WorkshopIncident {
  return {
    id,
    status: 'CLOSED',
    is_priority: false,
    display_order: 0,
    is_taken: false,
    created_at: '2026-03-01T10:00:00.000Z',
  } as WorkshopIncident;
}

describe('useFollowedResolvedIncidents (lot 7D, LIST-04, DR-12)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ne déclenche aucun appel API quand enabled est faux', () => {
    renderHook(() => useFollowedResolvedIncidents(false));

    expect(listWorkshopFollowedResolvedIncidents).not.toHaveBeenCalled();
  });

  it('charge les suivis résolus dès que enabled devient vrai', async () => {
    vi.mocked(listWorkshopFollowedResolvedIncidents).mockResolvedValue({
      items: [incident(1)],
      nextCursor: null,
    });

    const { result, rerender } = renderHook(
      ({ enabled }) => useFollowedResolvedIncidents(enabled),
      { initialProps: { enabled: false } }
    );
    expect(listWorkshopFollowedResolvedIncidents).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await waitFor(() => expect(result.current.followedResolvedLoading).toBe(false));

    expect(result.current.followedResolvedIncidents).toHaveLength(1);
  });

  it('vide la liste quand enabled repasse à faux', async () => {
    vi.mocked(listWorkshopFollowedResolvedIncidents).mockResolvedValue({
      items: [incident(1)],
      nextCursor: null,
    });
    const { result, rerender } = renderHook(
      ({ enabled }) => useFollowedResolvedIncidents(enabled),
      { initialProps: { enabled: true } }
    );
    await waitFor(() => expect(result.current.followedResolvedLoading).toBe(false));
    expect(result.current.followedResolvedIncidents).toHaveLength(1);

    rerender({ enabled: false });

    expect(result.current.followedResolvedIncidents).toHaveLength(0);
  });

  it('accumule les pages suivantes sans dupliquer la première page', async () => {
    vi.mocked(listWorkshopFollowedResolvedIncidents).mockResolvedValueOnce({
      items: [incident(1)],
      nextCursor: 'cursor-2',
    });
    const { result } = renderHook(() => useFollowedResolvedIncidents(true));
    await waitFor(() => expect(result.current.followedResolvedLoading).toBe(false));
    expect(result.current.followedResolvedHasMore).toBe(true);

    vi.mocked(listWorkshopFollowedResolvedIncidents).mockResolvedValueOnce({
      items: [incident(2)],
      nextCursor: null,
    });
    act(() => {
      result.current.loadMoreFollowedResolved();
    });
    await waitFor(() => expect(result.current.followedResolvedLoadingMore).toBe(false));

    expect(result.current.followedResolvedIncidents.map((i) => i.id)).toEqual([1, 2]);
    expect(result.current.followedResolvedHasMore).toBe(false);
  });
});
