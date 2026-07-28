import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { MutationFeedbackProvider } from '../../components/ui/MutationFeedback';
import WorkshopDashboardPage from '../WorkshopDashboardPage';
import { useIncidentsData } from '../../hooks/useIncidentsData';
import { WorkshopIncident, WorkshopIncidentMetrics } from '../../types';

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

vi.mock('../../hooks/useIncidentsData', () => ({
  useIncidentsData: vi.fn(),
}));

vi.mock('../../api/workshop', () => ({
  consultWorkshopArbitration: vi.fn(),
  updateWorkshopIncident: vi.fn(),
}));

vi.mock('../../hooks/useIncidentActions', () => ({
  useIncidentActions: () => ({
    handleToggleFollow: vi.fn(),
    handleToggleUrgent: vi.fn(),
    handleConfirmTakeCharge: vi.fn(),
    handleRequestDelete: vi.fn(),
    handleSetPending: vi.fn(),
    handleResumeIncident: vi.fn(),
    handleCloseIncident: vi.fn(),
    handleInvalidateIncident: vi.fn(),
    handleMaintenanceDeleteConfirm: vi.fn(),
    handleApplyEditRequest: vi.fn(),
    handleRejectEditRequest: vi.fn(),
    handleApproveDeleteRequest: vi.fn(),
    handleRejectDeleteRequest: vi.fn(),
  }),
}));

function mockIncident(overrides: Partial<WorkshopIncident> = {}): WorkshopIncident {
  return {
    id: 1,
    user_id: 7,
    line_id: 1,
    line_number: '117',
    machine_id: 'MCH-2117',
    machine_brand: 'Panasonic',
    robot_label: 'Droite 4',
    head_number: 2,
    state: 'SKIPEE_PAR_MACHINE',
    comment: 'Signalement opérateur',
    current_product: 'aida',
    is_taken: false,
    is_priority: false,
    status: 'OPEN',
    diagnostic: null,
    waiting_reason: null,
    intervention_note: null,
    responsible_comment: null,
    edit_request: null,
    cancel_request: false,
    cancel_request_reason: null,
    taken_by_user_id: null,
    taken_at: null,
    taken_by_first_name: null,
    taken_by_last_name: null,
    taken_by_role: null,
    display_order: 0,
    created_at: '2026-06-28T10:24:00.000Z',
    updated_at: '2026-06-28T10:24:00.000Z',
    first_name: 'Lucie',
    last_name: 'ROUSSEAU',
    badge_number: null,
    role: 'OPERATOR',
    is_followed: false,
    ...overrides,
  };
}

const metrics: WorkshopIncidentMetrics = {
  total: 2,
  open: 2,
  pending: 0,
  priority: 0,
  taken: 0,
  not_taken: 2,
  open_over_7d: 0,
  closed_today: 0,
  followed: 0,
  followed_resolved: 0,
  arbitration_unread: 0,
};

function mockDashboardData(incidents: WorkshopIncident[]) {
  vi.mocked(useIncidentsData).mockReturnValue({
    lines: [],
    incidents,
    metrics,
    metricsLoading: false,
    loading: false,
    error: '',
    setIncidents: vi.fn(),
    refreshMetrics: vi.fn(() => Promise.resolve()),
    refreshData: vi.fn(() => Promise.resolve()),
    upsertIncident: vi.fn(),
  });
}

function renderDashboard(initialPath = '/workshop/dashboard') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <MutationFeedbackProvider>
        <WorkshopDashboardPage />
      </MutationFeedbackProvider>
    </MemoryRouter>
  );
}

function DashboardWithBackControl() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate(-1)}>
        Retour navigateur
      </button>
      <WorkshopDashboardPage />
    </>
  );
}

function renderDashboardHistory(initialEntries: string[], initialIndex: number) {
  return render(
    <MemoryRouter initialEntries={initialEntries} initialIndex={initialIndex}>
      <MutationFeedbackProvider>
        <DashboardWithBackControl />
      </MutationFeedbackProvider>
    </MemoryRouter>
  );
}

function mockViewportQuery(isStackedDetailLayout = false) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => ({
      matches: query === '(max-width: 1180px)' ? isStackedDetailLayout : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('WorkshopDashboardPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockViewportQuery(false);
    mockDashboardData([
      mockIncident(),
      mockIncident({
        id: 2,
        line_id: 2,
        line_number: '119',
        machine_id: 'MCH-4119',
        robot_label: 'Droite 8',
        head_number: 1,
        current_product: 'PRODUIT-CIBLE',
      }),
    ]);
  });

  it('ouvre le dossier incident depuis une métadonnée hors du titre', async () => {
    const user = userEvent.setup();
    const { container } = renderDashboard();

    const workbench = container.querySelector('.workshop-results-workbench');
    expect(workbench).toBeDefined();
    expect(workbench?.classList.contains('is-detail-open')).toBe(false);

    await user.click(screen.getByText('aida', { exact: true }));

    await waitFor(() => {
      expect(container.querySelector('.workshop-results-workbench.is-detail-open')).not.toBeNull();
    });

    const inlineDrawer = container.querySelector(
      '.workshop-results-workbench > .incident-detail-drawer'
    );
    expect(inlineDrawer).not.toBeNull();
    expect(inlineDrawer?.getAttribute('aria-label')).toContain("Détail de l'incident ligne 117");
  });

  it("n'exécute aucun recentrage programmatique à l'ouverture d'une carte basse", async () => {
    const user = userEvent.setup();
    mockViewportQuery(false);
    const pageScroll = vi.fn();
    const elementScroll = vi.fn();
    const pageScrollMethod = ['scroll', 'By'].join('');
    const elementScrollMethod = ['scroll', 'IntoView'].join('');
    Object.defineProperty(window, pageScrollMethod, {
      configurable: true,
      value: pageScroll,
    });
    Object.defineProperty(Element.prototype, elementScrollMethod, {
      configurable: true,
      value: elementScroll,
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement
    ) {
      if (this.classList.contains('nav-bar')) {
        return DOMRect.fromRect({ x: 0, y: 0, width: 1440, height: 56 });
      }
      if (this.classList.contains('workshop-results-workbench')) {
        return DOMRect.fromRect({ x: 100, y: 100, width: 1240, height: 1800 });
      }
      if (this.matches('[data-incident-card-id="2"]')) {
        return DOMRect.fromRect({ x: 100, y: 840, width: 780, height: 160 });
      }
      if (this.classList.contains('incident-detail-drawer')) {
        return DOMRect.fromRect({ x: 900, y: 72, width: 440, height: 600 });
      }
      return DOMRect.fromRect();
    });

    const { container } = renderDashboard();

    await user.click(screen.getByText('PRODUIT-CIBLE', { exact: true }));

    await waitFor(() => {
      expect(container.querySelector('.incident-detail-drawer')).not.toBeNull();
    });
    await new Promise<void>((resolve) =>
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()))
    );

    expect(pageScroll).not.toHaveBeenCalled();
    expect(elementScroll).not.toHaveBeenCalled();
  });

  it("n'injecte aucun offset de carte dans le style du dossier", async () => {
    const user = userEvent.setup();
    const { container } = renderDashboard();

    await user.click(screen.getByText('PRODUIT-CIBLE', { exact: true }));

    const drawer = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.incident-detail-drawer');
      expect(element).not.toBeNull();
      return element!;
    });

    const removedOffsetProperty = ['--incident-detail', 'offset-top'].join('-');
    expect(drawer.style.getPropertyValue(removedOffsetProperty)).toBe('');
  });

  it("sépare l'en-tête fixe du corps scrollable dans le dossier", async () => {
    const user = userEvent.setup();
    const { container } = renderDashboard();

    await user.click(screen.getByText('aida', { exact: true }));

    const drawer = await waitFor(() => {
      const element = container.querySelector<HTMLElement>('.incident-detail-drawer');
      expect(element).not.toBeNull();
      return element!;
    });

    expect(drawer.children[0]).toHaveClass('incident-detail-topbar');
    expect(drawer.children[1]).toHaveClass('incident-detail-content');
  });

  it('restaure exactement le focus sur l’activateur après fermeture par la croix', async () => {
    const user = userEvent.setup();
    const { container } = renderDashboard();
    const openActivator = screen.getByLabelText(/Ouvrir incident ligne 117, machine MCH-2117/i);

    await user.click(screen.getByText('aida', { exact: true }));

    await waitFor(() => {
      expect(container.querySelector('.workshop-results-workbench.is-detail-open')).not.toBeNull();
    });

    await user.click(screen.getByRole('button', { name: 'Fermer le détail' }));

    await waitFor(() => {
      expect(container.querySelector('.workshop-results-workbench.is-detail-open')).toBeNull();
      expect(openActivator).toHaveFocus();
    });
  });

  it('restaure exactement le focus sur l’activateur après fermeture par Échap', async () => {
    const user = userEvent.setup();
    const { container } = renderDashboard();
    const openActivator = screen.getByLabelText(/Ouvrir incident ligne 117, machine MCH-2117/i);

    await user.click(screen.getByText('aida', { exact: true }));

    await waitFor(() => {
      expect(container.querySelector('.workshop-results-workbench.is-detail-open')).not.toBeNull();
    });

    expect(screen.getByRole('heading', { name: 'Tableau de bord atelier' })).toBeDefined();
    expect(screen.getByLabelText(/Recherche/i)).toBeDefined();

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(container.querySelector('.workshop-results-workbench.is-detail-open')).toBeNull();
      expect(openActivator).toHaveFocus();
    });
    expect(container.querySelector('.incident-detail-drawer')).toBeNull();
  });

  it("ouvre l'arbitrage depuis la carte sans ouvrir le dossier incident", async () => {
    const user = userEvent.setup();
    mockDashboardData([
      mockIncident({
        id: 4,
        line_id: 4,
        line_number: '119',
        machine_id: 'MCH-4119',
        robot_label: 'Droite 8',
        head_number: 1,
        edit_request: { state: 'ARRET' },
      }),
    ]);

    const { container } = renderDashboard();

    await user.click(screen.getByRole('button', { name: 'Modification à arbitrer' }));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Arbitrage correction' })).toBeDefined();
    });
    expect(container.querySelector('.workshop-results-workbench.is-detail-open')).toBeNull();
    expect(container.querySelector('.incident-detail-drawer')).toBeNull();
  });

  it("pose le dossier sélectionné avant d'ouvrir l'arbitrage automatique", async () => {
    mockDashboardData([
      mockIncident({
        id: 4,
        line_id: 4,
        line_number: '119',
        machine_id: 'MCH-4119',
        robot_label: 'Droite 8',
        head_number: 1,
        cancel_request: true,
        cancel_request_reason: 'doublon',
        arbitration: {
          cancel: {
            caseId: 22,
            requestEventId: 7,
            requestedAt: '2026-06-28T11:00:00.000Z',
            state: 'ACTIVE',
          },
        },
      }),
    ]);

    const { container } = renderDashboard('/workshop/dashboard?incident=4');

    await waitFor(() => {
      expect(container.querySelector('.workshop-results-workbench.is-detail-open')).not.toBeNull();
    });

    expect(screen.queryByRole('dialog', { name: 'Arbitrage annulation' })).toBeNull();

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Arbitrage annulation' })).toBeDefined();
    });

    expect(screen.getAllByRole('dialog', { name: 'Arbitrage annulation' })).toHaveLength(1);
  });

  it("ferme l'arbitrage quand le retour navigateur sort du dossier incident", async () => {
    mockDashboardData([
      mockIncident({
        id: 4,
        line_id: 4,
        line_number: '119',
        machine_id: 'MCH-4119',
        robot_label: 'Droite 8',
        head_number: 1,
        cancel_request: true,
        cancel_request_reason: 'doublon',
        arbitration: {
          cancel: {
            caseId: 22,
            requestEventId: 7,
            requestedAt: '2026-06-28T11:00:00.000Z',
            state: 'ACTIVE',
          },
        },
      }),
    ]);

    const { container } = renderDashboardHistory(
      ['/workshop/dashboard', '/workshop/dashboard?incident=4'],
      1
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Arbitrage annulation' })).toBeDefined();
    });

    expect(screen.getAllByRole('dialog', { name: 'Arbitrage annulation' })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Retour navigateur' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Arbitrage annulation' })).toBeNull();
    });
    expect(container.querySelector('.incident-detail-drawer')).toBeNull();
  });
});
