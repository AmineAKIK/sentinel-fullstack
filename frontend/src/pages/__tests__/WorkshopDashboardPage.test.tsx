import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
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
    upsertIncident: vi.fn(),
  });
}

function renderDashboard(initialPath = '/workshop/dashboard') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <WorkshopDashboardPage />
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
      <DashboardWithBackControl />
    </MemoryRouter>
  );
}

describe('WorkshopDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDashboardData([
      mockIncident(),
      mockIncident({
        id: 2,
        line_id: 2,
        line_number: '119',
        machine_id: 'MCH-4119',
        robot_label: 'Droite 8',
        head_number: 1,
      }),
    ]);
  });

  it('ouvre le dossier incident dans le workbench sous les filtres', async () => {
    const { container } = renderDashboard();

    const workbench = container.querySelector('.workshop-results-workbench');
    expect(workbench).toBeDefined();
    expect(workbench?.classList.contains('is-detail-open')).toBe(false);

    fireEvent.click(
      screen.getByRole('button', {
        name: /Ouvrir incident ligne 117, machine MCH-2117/i,
      })
    );

    await waitFor(() => {
      expect(container.querySelector('.workshop-results-workbench.is-detail-open')).not.toBeNull();
    });

    const inlineDrawer = container.querySelector(
      '.workshop-results-workbench > .incident-detail-drawer'
    );
    expect(inlineDrawer).not.toBeNull();
    expect(inlineDrawer?.getAttribute('aria-label')).toContain("Détail de l'incident ligne 117");
  });

  it('ferme le dossier depuis Escape sans modifier la zone dashboard', async () => {
    const { container } = renderDashboard('/workshop/dashboard?incident=2');

    await waitFor(() => {
      expect(container.querySelector('.workshop-results-workbench.is-detail-open')).not.toBeNull();
    });

    expect(screen.getByRole('heading', { name: 'Tableau de bord atelier' })).toBeDefined();
    expect(screen.getByLabelText(/Recherche/i)).toBeDefined();

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(container.querySelector('.workshop-results-workbench.is-detail-open')).toBeNull();
    });
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
