import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  getWorkshopKnowledgeIncident,
  listWorkshopKnowledgeIncidents,
  listWorkshopLines,
} from '../../api/workshop';
import { WorkshopIncident } from '../../types';
import { useKnowledgeData } from '../useKnowledgeData';

vi.mock('../../api/workshop', () => ({
  getWorkshopKnowledgeIncident: vi.fn(),
  listWorkshopKnowledgeIncidents: vi.fn(),
  listWorkshopLines: vi.fn(),
}));

function incident(id: number, updatedAt: string): WorkshopIncident {
  return {
    id,
    user_id: 1,
    line_id: 1,
    line_number: '117',
    machine_id: 'MCH-1',
    machine_brand: 'Fanuc',
    robot_label: 'R01',
    head_number: 1,
    state: 'DEGRADEE',
    comment: null,
    current_product: null,
    is_taken: false,
    is_priority: false,
    status: 'CLOSED',
    diagnostic: null,
    intervention_note: 'Capteur remplacé',
    responsible_comment: null,
    edit_request: null,
    taken_by_user_id: null,
    taken_at: null,
    taken_by_first_name: null,
    taken_by_last_name: null,
    taken_by_role: null,
    display_order: 0,
    created_at: updatedAt,
    updated_at: updatedAt,
    first_name: 'Eden',
    last_name: 'AKIK',
    badge_number: 'RE-01',
    role: 'OPERATOR',
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(MemoryRouter, null, children);
}

describe('useKnowledgeData — pagination par curseur (lot 7C, LIST-02)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listWorkshopLines).mockResolvedValue([]);
    vi.mocked(getWorkshopKnowledgeIncident).mockResolvedValue(
      incident(999, '2026-01-01T00:00:00.000Z')
    );
  });

  it('charge la première page et expose hasMore', async () => {
    vi.mocked(listWorkshopKnowledgeIncidents).mockResolvedValue({
      items: [incident(1, '2026-03-02T10:00:00.000Z')],
      nextCursor: 'opaque-cursor-token',
    });

    const { result } = renderHook(() => useKnowledgeData(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.incidents).toHaveLength(1);
    expect(result.current.hasMore).toBe(true);
  });

  it('accumule les fiches de la page suivante sans dupliquer la première page', async () => {
    vi.mocked(listWorkshopKnowledgeIncidents).mockResolvedValueOnce({
      items: [incident(1, '2026-03-02T10:00:00.000Z')],
      nextCursor: 'cursor-page-2',
    });
    const { result } = renderHook(() => useKnowledgeData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.mocked(listWorkshopKnowledgeIncidents).mockResolvedValueOnce({
      items: [incident(2, '2026-03-01T10:00:00.000Z')],
      nextCursor: null,
    });
    act(() => {
      result.current.loadMore();
    });
    await waitFor(() => expect(result.current.loadingMore).toBe(false));

    expect(result.current.incidents.map((i) => i.id)).toEqual([1, 2]);
    expect(result.current.hasMore).toBe(false);
  });

  it('ne rappelle pas loadMore quand hasMore est faux', async () => {
    vi.mocked(listWorkshopKnowledgeIncidents).mockResolvedValue({
      items: [incident(1, '2026-03-02T10:00:00.000Z')],
      nextCursor: null,
    });
    const { result } = renderHook(() => useKnowledgeData(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const callsBefore = vi.mocked(listWorkshopKnowledgeIncidents).mock.calls.length;
    act(() => result.current.loadMore());

    expect(vi.mocked(listWorkshopKnowledgeIncidents).mock.calls.length).toBe(callsBefore);
  });
});
