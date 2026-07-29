import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WorkshopKnowledgePage from '../WorkshopKnowledgePage';
import { MutationFeedbackProvider } from '../../components/ui/MutationFeedback';
import { useKnowledgeData } from '../../hooks/useKnowledgeData';
import type { WorkshopIncident } from '../../types/workshop';

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
      <MutationFeedbackProvider>
        <WorkshopKnowledgePage />
      </MutationFeedbackProvider>
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

// ── Fiche détaillée : cardinalité des cas similaires et contenus longs (RC5-6) ──
function baseIncident(overrides: Partial<WorkshopIncident> = {}): WorkshopIncident {
  return {
    id: 1,
    user_id: 1,
    line_id: 1,
    line_number: '999',
    machine_id: 'E2E-MCH-1',
    machine_brand: 'ABB',
    robot_label: 'Robot 1',
    head_number: 1,
    state: 'DEGRADEE',
    comment: 'Symptôme observé.',
    current_product: 'PROD-1',
    is_taken: true,
    is_priority: false,
    status: 'CLOSED',
    diagnostic: 'Diagnostic posé.',
    waiting_reason: null,
    intervention_note: 'Solution appliquée.',
    responsible_comment: null,
    edit_request: null,
    taken_by_user_id: 2,
    taken_at: '2026-03-01T08:00:00.000Z',
    taken_by_first_name: 'Eden',
    taken_by_last_name: 'AKIK',
    taken_by_role: 'RESPONSABLE',
    display_order: 1,
    created_at: '2026-03-01T07:00:00.000Z',
    updated_at: '2026-03-01T08:30:00.000Z',
    first_name: 'Op',
    last_name: 'Erateur',
    badge_number: 'OP-01',
    role: 'OPERATEUR',
    ...overrides,
  } as WorkshopIncident;
}

describe('WorkshopKnowledgePage — fiche détaillée responsive (RC5-6)', () => {
  it('n’affiche pas la section "Déjà résolu ailleurs" quand aucune fiche n’est similaire', () => {
    const incident = baseIncident({ id: 10 });
    renderKnowledgePage({
      incidents: [incident],
      selectedId: '10',
      selectedIncident: incident,
      relatedIncidents: [],
    });

    expect(screen.queryByText('Déjà résolu ailleurs')).not.toBeInTheDocument();
  });

  it('affiche la section avec une seule fiche similaire', () => {
    const incident = baseIncident({ id: 10 });
    const related = baseIncident({ id: 11, line_number: '998' });
    renderKnowledgePage({
      incidents: [incident, related],
      selectedId: '10',
      selectedIncident: incident,
      relatedIncidents: [related],
    });

    expect(screen.getByText('Déjà résolu ailleurs')).toBeInTheDocument();
    const relatedList = screen.getByRole('list');
    expect(
      within(relatedList).getAllByRole('button', { name: /Ligne 998 · E2E-MCH-1/ })
    ).toHaveLength(1);
  });

  it('affiche jusqu’à plusieurs fiches similaires sans dupliquer la fiche sélectionnée', () => {
    const incident = baseIncident({ id: 10 });
    const related = [
      baseIncident({ id: 11, line_number: '998' }),
      baseIncident({ id: 12, line_number: '997' }),
      baseIncident({ id: 13, line_number: '996' }),
    ];
    renderKnowledgePage({
      incidents: [incident, ...related],
      selectedId: '10',
      selectedIncident: incident,
      relatedIncidents: related,
    });

    const relatedList = screen.getByRole('list');
    const items = within(relatedList).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(within(relatedList).queryByText(/Ligne 999 · E2E-MCH-1/)).not.toBeInTheDocument();
  });

  it('casse un titre de machine long sans le tronquer ni provoquer d’ellipse', () => {
    const incident = baseIncident({
      id: 10,
      line_number: '999',
      machine_id: 'E2E-MCH-TRES-LONG-IDENTIFIANT-DE-MACHINE-INDUSTRIELLE-PROLONGE',
    });
    renderKnowledgePage({
      incidents: [incident],
      selectedId: '10',
      selectedIncident: incident,
      relatedIncidents: [],
    });

    expect(
      screen.getByRole('heading', {
        name: /Ligne 999 · E2E-MCH-TRES-LONG-IDENTIFIANT-DE-MACHINE-INDUSTRIELLE-PROLONGE/,
      })
    ).toBeInTheDocument();
  });

  it('affiche un nom de technicien long en entier', () => {
    const incident = baseIncident({
      id: 10,
      taken_by_first_name: 'Jean-Baptiste-Alexandre',
      taken_by_last_name: 'De La Fontaine-Beauchamp-Rousseau',
    });
    renderKnowledgePage({
      incidents: [incident],
      selectedId: '10',
      selectedIncident: incident,
      relatedIncidents: [],
    });

    expect(
      screen.getByText('Jean-Baptiste-Alexandre De La Fontaine-Beauchamp-Rousseau')
    ).toBeInTheDocument();
  });

  it('affiche un produit long en entier (limite réelle du champ, 120 caractères)', () => {
    const longProduct = `E2E-KB-LONGPRODUCT-${'X'.repeat(90)}-99999999999`.slice(0, 120);
    const incident = baseIncident({ id: 10, current_product: longProduct });
    renderKnowledgePage({
      incidents: [incident],
      selectedId: '10',
      selectedIncident: incident,
      relatedIncidents: [],
    });

    const detail = document.querySelector('.kb-detail') as HTMLElement;
    expect(within(detail).getByText(longProduct)).toBeInTheDocument();
  });

  it('affiche un diagnostic et une solution longs en entier, sans troncature', () => {
    const longDiagnostic =
      'Diagnostic détaillé décrivant précisément chaque symptôme observé sur la machine, ' +
      'les hypothèses écartées une à une, et la cause racine finalement identifiée après ' +
      'plusieurs vérifications successives sur le terrain avec le conducteur de ligne.';
    const longSolution =
      'Solution appliquée en plusieurs étapes : remplacement du composant défectueux, ' +
      'recalibrage complet du robot, test de validation sur cinq cycles consécutifs, ' +
      'puis remise en service supervisée avant clôture définitive de l’incident.';
    const incident = baseIncident({
      id: 10,
      diagnostic: longDiagnostic,
      intervention_note: longSolution,
    });
    renderKnowledgePage({
      incidents: [incident],
      selectedId: '10',
      selectedIncident: incident,
      relatedIncidents: [],
    });

    const detail = document.querySelector('.kb-detail') as HTMLElement;
    expect(within(detail).getByText(longDiagnostic)).toBeInTheDocument();
    expect(within(detail).getByText(longSolution)).toBeInTheDocument();
  });
});

describe('WorkshopKnowledgePage — copie du lien', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function renderSelectedIncident() {
    const incident = baseIncident({ id: 10 });
    return renderKnowledgePage({
      incidents: [incident],
      selectedId: '10',
      selectedIncident: incident,
      relatedIncidents: [],
    });
  }

  it('annonce globalement un rejet du presse-papiers sans faux succès local', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('permission denied'));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    renderSelectedIncident();

    fireEvent.click(screen.getByRole('button', { name: 'Copier le lien' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Action impossible');
    expect(alert).toHaveTextContent('Impossible de copier le lien');
    expect(screen.getByRole('button', { name: 'Copier le lien' })).toBeInTheDocument();
  });

  it('annule le timer de succès local lorsque la page est démontée', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const { unmount } = renderSelectedIncident();

    fireEvent.click(screen.getByRole('button', { name: 'Copier le lien' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole('button', { name: 'Lien copié !' })).toBeInTheDocument();
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
