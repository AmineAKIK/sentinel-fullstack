import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WorkshopHistoryPage from '../WorkshopHistoryPage';
import { useHistoryData } from '../../hooks/useHistoryData';

vi.mock('../../hooks/useHistoryData', () => ({
  useHistoryData: vi.fn(),
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

function baseHistoryData(overrides: Partial<ReturnType<typeof useHistoryData>> = {}) {
  return {
    incidents: [],
    lines: [],
    selectedId: '',
    selectedIncident: undefined,
    events: [],
    loading: false,
    loadingMore: false,
    hasMore: false,
    loadMore: vi.fn(),
    eventsLoading: false,
    highlightedEventId: null,
    error: '',
    query: '',
    statusFilter: 'all',
    lineFilter: 'all',
    machineFilter: 'all',
    stateFilter: 'all',
    incidentDetailRef: { current: null },
    activeItemRef: { current: null },
    setQuery: vi.fn(),
    setStatusFilter: vi.fn(),
    setMachineFilter: vi.fn(),
    setStateFilter: vi.fn(),
    updateSearchFilter: vi.fn(),
    updateLineFilter: vi.fn(),
    selectIncident: vi.fn(),
    clearFilters: vi.fn(),
    ...overrides,
  };
}

function renderHistoryPage(overrides: Partial<ReturnType<typeof useHistoryData>> = {}) {
  vi.mocked(useHistoryData).mockReturnValue(baseHistoryData(overrides) as never);
  return render(
    <MemoryRouter>
      <WorkshopHistoryPage />
    </MemoryRouter>
  );
}

describe('WorkshopHistoryPage — pagination par curseur (lot 7B, LIST-01)', () => {
  it('n’affiche aucun bouton de suite quand hasMore est faux', () => {
    renderHistoryPage({ hasMore: false });

    expect(screen.queryByRole('button', { name: /charger la suite/i })).not.toBeInTheDocument();
  });

  it('affiche un bouton "Charger la suite" quand une page suivante existe', () => {
    renderHistoryPage({ hasMore: true });

    expect(screen.getByRole('button', { name: /charger la suite/i })).toBeInTheDocument();
  });

  it('appelle loadMore au clic sur le bouton', () => {
    const loadMore = vi.fn();
    renderHistoryPage({ hasMore: true, loadMore });

    fireEvent.click(screen.getByRole('button', { name: /charger la suite/i }));

    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it('désactive le bouton pendant loadingMore', () => {
    renderHistoryPage({ hasMore: true, loadingMore: true });

    expect(screen.getByRole('button', { name: /chargement/i })).toBeDisabled();
  });
});

describe('WorkshopHistoryPage — sélection perceptible', () => {
  it('expose l’incident actif autrement que par sa couleur', () => {
    const selected = {
      id: 1,
      line_number: '117',
      machine_id: 'M01',
      status: 'CLOSED',
      state: 'DEGRADEE',
      robot_label: 'R01',
      head_number: 1,
      updated_at: '2026-03-01T10:00:00.000Z',
      created_at: '2026-03-01T09:00:00.000Z',
      intervention_note: null,
      is_priority: false,
    };
    const other = { ...selected, id: 2, line_number: '118' };
    renderHistoryPage({ incidents: [selected, other] as never, selectedId: '1' });

    expect(screen.getByRole('button', { name: /Ligne 117 · M01/ })).toHaveAttribute(
      'aria-current',
      'true'
    );
    expect(screen.getByRole('button', { name: /Ligne 118 · M01/ })).not.toHaveAttribute(
      'aria-current'
    );
  });
});
