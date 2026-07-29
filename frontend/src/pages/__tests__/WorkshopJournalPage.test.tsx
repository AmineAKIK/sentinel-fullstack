import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WorkshopJournalPage from '../WorkshopJournalPage';
import { useJournalData } from '../../hooks/useJournalData';

vi.mock('../../hooks/useJournalData', () => ({
  useJournalData: vi.fn(),
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

function baseJournalData(overrides: Partial<ReturnType<typeof useJournalData>> = {}) {
  return {
    lines: [],
    historyEvents: [],
    sortedEvents: [],
    historyEventsLoading: false,
    loadingMore: false,
    hasMore: false,
    loadMore: vi.fn(),
    error: '',
    query: '',
    statusFilter: 'all',
    lineFilter: 'all',
    machineFilter: 'all',
    stateFilter: 'all',
    eventTypeFilter: 'all',
    startFilter: '',
    endFilter: '',
    periodError: '',
    sortCol: 'date' as const,
    sortDir: 'desc' as const,
    setQuery: vi.fn(),
    setStatusFilter: vi.fn(),
    setMachineFilter: vi.fn(),
    setStateFilter: vi.fn(),
    setEventTypeFilter: vi.fn(),
    updateSearchFilter: vi.fn(),
    updateLineFilter: vi.fn(),
    updateStartFilter: vi.fn(),
    updateEndFilter: vi.fn(),
    clearPeriodFilter: vi.fn(),
    clearFilters: vi.fn(),
    handleSort: vi.fn(),
    ...overrides,
  };
}

function renderJournalPage(overrides: Partial<ReturnType<typeof useJournalData>> = {}) {
  vi.mocked(useJournalData).mockReturnValue(baseJournalData(overrides) as never);
  return render(
    <MemoryRouter>
      <WorkshopJournalPage />
    </MemoryRouter>
  );
}

describe('WorkshopJournalPage — filtre période (lot 6, ANA-03)', () => {
  it('affiche deux champs de date accessibles pour filtrer par période', () => {
    renderJournalPage();

    expect(screen.getByLabelText('Depuis le')).toBeInTheDocument();
    expect(screen.getByLabelText("Jusqu'au")).toBeInTheDocument();
  });

  it('appelle updateStartFilter/updateEndFilter quand les dates changent', () => {
    const updateStartFilter = vi.fn();
    const updateEndFilter = vi.fn();
    renderJournalPage({ updateStartFilter, updateEndFilter });

    fireEvent.change(screen.getByLabelText('Depuis le'), { target: { value: '2026-03-01' } });
    fireEvent.change(screen.getByLabelText("Jusqu'au"), { target: { value: '2026-03-31' } });

    expect(updateStartFilter).toHaveBeenCalledWith('2026-03-01');
    expect(updateEndFilter).toHaveBeenCalledWith('2026-03-31');
  });

  it('affiche le message d’erreur de période quand la borne est invalide', () => {
    renderJournalPage({ periodError: 'La date de début doit être antérieure à la date de fin.' });

    expect(
      screen.getByText('La date de début doit être antérieure à la date de fin.')
    ).toBeInTheDocument();
  });

  it('affiche un chip de période retirable qui efface les deux bornes', () => {
    const clearPeriodFilter = vi.fn();
    renderJournalPage({
      startFilter: '2026-03-01',
      endFilter: '2026-03-31',
      clearPeriodFilter,
    });

    expect(screen.getByText(/Période : 2026-03-01 → 2026-03-31/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Retirer le filtre Période/i));

    expect(clearPeriodFilter).toHaveBeenCalledOnce();
  });
});

describe('WorkshopJournalPage — pagination par curseur (lot 7, LIST-03)', () => {
  it('n’affiche aucun bouton de suite quand hasMore est faux', () => {
    renderJournalPage({ hasMore: false });

    expect(screen.queryByRole('button', { name: /charger la suite/i })).not.toBeInTheDocument();
  });

  it('affiche un bouton "Charger la suite" quand une page suivante existe', () => {
    renderJournalPage({ hasMore: true });

    expect(screen.getByRole('button', { name: /charger la suite/i })).toBeInTheDocument();
  });

  it('appelle loadMore au clic sur le bouton', () => {
    const loadMore = vi.fn();
    renderJournalPage({ hasMore: true, loadMore });

    fireEvent.click(screen.getByRole('button', { name: /charger la suite/i }));

    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it('désactive le bouton et affiche un état de chargement pendant loadingMore', () => {
    renderJournalPage({ hasMore: true, loadingMore: true });

    const button = screen.getByRole('button', { name: /chargement/i });
    expect(button).toBeDisabled();
  });
});

describe('WorkshopJournalPage — filtre événement accessible (lot 8, A11Y-03)', () => {
  it('a un nom accessible sur le filtre de type d’action', () => {
    renderJournalPage();

    expect(screen.getByLabelText("Filtrer par type d'action")).toBeInTheDocument();
  });

  it('permet de changer le filtre via son nom accessible', () => {
    const setEventTypeFilter = vi.fn();
    renderJournalPage({ setEventTypeFilter });

    fireEvent.change(screen.getByLabelText("Filtrer par type d'action"), {
      target: { value: 'INCIDENT_CLOSED' },
    });

    expect(setEventTypeFilter).toHaveBeenCalledWith('INCIDENT_CLOSED');
  });
});
