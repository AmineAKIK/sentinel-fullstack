import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WorkshopKnowledgePage from '../WorkshopKnowledgePage';
import { useKnowledgeData } from '../../hooks/useKnowledgeData';

vi.mock('../../hooks/useKnowledgeData', () => ({
  useKnowledgeData: vi.fn(),
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

function baseKnowledgeData(overrides: Partial<ReturnType<typeof useKnowledgeData>> = {}) {
  return {
    incidents: [],
    lines: [],
    loading: false,
    loadingMore: false,
    hasMore: false,
    loadMore: vi.fn(),
    error: '',
    query: '',
    lineFilter: 'all',
    machineFilter: 'all',
    stateFilter: 'all',
    selectedId: '',
    selectedIncident: undefined,
    relatedIncidents: [],
    machineCount: 0,
    lastItem: undefined,
    setQuery: vi.fn(),
    setMachineFilter: vi.fn(),
    setStateFilter: vi.fn(),
    updateSearchFilter: vi.fn(),
    updateLineFilter: vi.fn(),
    selectIncident: vi.fn(),
    clearFilters: vi.fn(),
    ...overrides,
  };
}

function renderKnowledgePage(overrides: Partial<ReturnType<typeof useKnowledgeData>> = {}) {
  vi.mocked(useKnowledgeData).mockReturnValue(baseKnowledgeData(overrides) as never);
  return render(
    <MemoryRouter>
      <WorkshopKnowledgePage />
    </MemoryRouter>
  );
}

describe('WorkshopKnowledgePage — pagination par curseur (lot 7C, LIST-02)', () => {
  it('n’affiche aucun bouton de suite quand hasMore est faux', () => {
    renderKnowledgePage({ hasMore: false });

    expect(screen.queryByRole('button', { name: /charger la suite/i })).not.toBeInTheDocument();
  });

  it('affiche un bouton "Charger la suite" quand une page suivante existe', () => {
    renderKnowledgePage({ hasMore: true });

    expect(screen.getByRole('button', { name: /charger la suite/i })).toBeInTheDocument();
  });

  it('appelle loadMore au clic sur le bouton', () => {
    const loadMore = vi.fn();
    renderKnowledgePage({ hasMore: true, loadMore });

    fireEvent.click(screen.getByRole('button', { name: /charger la suite/i }));

    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it('désactive le bouton pendant loadingMore', () => {
    renderKnowledgePage({ hasMore: true, loadingMore: true });

    expect(screen.getByRole('button', { name: /chargement/i })).toBeDisabled();
  });

  it('ne présente pas le compteur comme un total complet quand hasMore est vrai', () => {
    renderKnowledgePage({
      incidents: [
        {
          id: 1,
          machine_id: 'MCH-1',
          updated_at: '2026-03-01T00:00:00.000Z',
        } as never,
      ],
      machineCount: 1,
      hasMore: true,
    });

    expect(screen.getByText(/d.autres restent à charger/i)).toBeInTheDocument();
  });
});
