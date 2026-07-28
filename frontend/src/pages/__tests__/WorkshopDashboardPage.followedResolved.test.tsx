import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WorkshopDashboardPage from '../WorkshopDashboardPage';
import { useIncidentsData } from '../../hooks/useIncidentsData';
import { listWorkshopFollowedResolvedIncidents } from '../../api/workshop';
import { WorkshopIncident, WorkshopIncidentMetrics } from '../../types';
import { MutationFeedbackProvider } from '../../components/ui/MutationFeedback';

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
  listWorkshopFollowedResolvedIncidents: vi.fn(),
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
    is_followed: true,
    ...overrides,
  };
}

const metrics: WorkshopIncidentMetrics = {
  total: 1,
  open: 1,
  pending: 0,
  priority: 0,
  taken: 0,
  not_taken: 1,
  open_over_7d: 0,
  closed_today: 0,
  followed: 1,
  followed_resolved: 1,
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

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={['/workshop/dashboard']}>
      <MutationFeedbackProvider>
        <WorkshopDashboardPage />
      </MutationFeedbackProvider>
    </MemoryRouter>
  );
}

describe('WorkshopDashboardPage — suivis résolus séparés (lot 7D, LIST-04, DR-12)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ne déclenche aucun appel de suivis résolus tant que le scope « Suivis » n’est pas actif', () => {
    mockDashboardData([mockIncident()]);
    renderDashboard();

    expect(listWorkshopFollowedResolvedIncidents).not.toHaveBeenCalled();
  });

  it('affiche l’incident actif suivi et le suivi résolu une fois le scope « Suivis » activé', async () => {
    mockDashboardData([mockIncident({ id: 1, status: 'OPEN', is_followed: true })]);
    vi.mocked(listWorkshopFollowedResolvedIncidents).mockResolvedValue({
      items: [
        mockIncident({
          id: 2,
          status: 'CLOSED',
          is_followed: true,
          line_number: '221',
          machine_id: 'MCH-2221',
        }),
      ],
      nextCursor: null,
    });

    renderDashboard();

    fireEvent.click(screen.getByText(/^Suivis$/));

    await waitFor(() => expect(listWorkshopFollowedResolvedIncidents).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(/Ligne 221/)).toBeInTheDocument());
    expect(screen.getAllByText(/Ligne 117/).length).toBeGreaterThan(0);
  });

  it('affiche un bouton "Charger la suite" quand une page suivante de suivis résolus existe', async () => {
    mockDashboardData([mockIncident({ id: 1, status: 'OPEN', is_followed: true })]);
    vi.mocked(listWorkshopFollowedResolvedIncidents).mockResolvedValue({
      items: [mockIncident({ id: 2, status: 'CLOSED', is_followed: true })],
      nextCursor: 'opaque-cursor-token',
    });

    renderDashboard();
    fireEvent.click(screen.getByText(/^Suivis$/));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /charger la suite/i })).toBeInTheDocument()
    );
  });
});
