import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import IncidentDetailPanel from '../IncidentDetailPanel';
import { ModalStateApi } from '../../hooks/useModalState';
import { WorkshopIncident } from '../../types';

const resolvedVoid = () => Promise.resolve();

function mockIncident(overrides: Partial<WorkshopIncident> = {}): WorkshopIncident {
  return {
    id: 1,
    user_id: 1,
    line_id: 1,
    line_number: '117',
    machine_id: 'MCH-2117',
    machine_brand: 'Panasonic',
    robot_label: 'Droite 4',
    head_number: 2,
    state: 'SKIPEE_PAR_MACHINE',
    comment: 'A faire vite',
    current_product: 'aida',
    is_taken: false,
    is_priority: true,
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
    first_name: 'Eden',
    last_name: 'AKIK',
    badge_number: null,
    role: 'RESPONSABLE',
    is_followed: true,
    ...overrides,
  };
}

function mockModal(): ModalStateApi {
  return {
    state: {
      activeModal: null,
      reviewIncident: null,
      reviewType: null,
      reviewError: '',
      reviewLoading: false,
      unfollowConfirmIncident: null,
      deleteResponsibleCommentIncident: null,
    },
    openModal: vi.fn(),
    closeModal: vi.fn(),
    openReview: vi.fn(),
    closeReview: vi.fn(),
    setReviewError: vi.fn(),
    setReviewLoading: vi.fn(),
    setUnfollowConfirm: vi.fn(),
    setDeleteCommentConfirm: vi.fn(),
  };
}

function renderPanel({
  incident = mockIncident(),
  userRole = 'RESPONSABLE',
  userId = 1,
  isResponsable = true,
  isMaintenance = false,
}: {
  incident?: WorkshopIncident;
  userRole?: 'OPERATOR' | 'MAINTENANCE' | 'RESPONSABLE';
  userId?: number;
  isResponsable?: boolean;
  isMaintenance?: boolean;
} = {}) {
  const modal = mockModal();

  render(
    <MemoryRouter>
      <IncidentDetailPanel
        incident={incident}
        lines={[]}
        modal={modal}
        userRole={userRole}
        userId={userId}
        isMaintenance={isMaintenance}
        isResponsable={isResponsable}
        onBack={vi.fn()}
        onToggleFollow={vi.fn(resolvedVoid)}
        onToggleUrgent={vi.fn(resolvedVoid)}
        onConfirmTakeCharge={vi.fn(resolvedVoid)}
        onRequestDelete={vi.fn(resolvedVoid)}
        onSetPending={vi.fn(resolvedVoid)}
        onResumeIncident={vi.fn(resolvedVoid)}
        onCloseIncident={vi.fn(resolvedVoid)}
        onInvalidateIncident={vi.fn(resolvedVoid)}
        onMaintenanceDeleteConfirm={vi.fn(resolvedVoid)}
        onApplyEditRequest={vi.fn(resolvedVoid)}
        onRejectEditRequest={vi.fn(resolvedVoid)}
        onApproveDeleteRequest={vi.fn(resolvedVoid)}
        onRejectDeleteRequest={vi.fn(resolvedVoid)}
        onConsultArbitration={vi.fn()}
        onReportArbitration={vi.fn()}
        onEditSuccess={vi.fn()}
        onDeleteCommentConfirm={vi.fn(resolvedVoid)}
        patchIncident={vi.fn(() => Promise.resolve(incident))}
      />
    </MemoryRouter>
  );

  return { modal };
}

describe('IncidentDetailPanel', () => {
  it('affiche la synthèse, le dossier et les décisions du drawer', () => {
    renderPanel({
      incident: mockIncident({
        edit_request: { state: 'DEGRADEE' },
        cancel_request: true,
      }),
    });

    expect(screen.getByRole('heading', { name: 'Décision requise' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Dossier' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Narratif atelier' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Contexte machine' })).toBeDefined();
    expect(screen.getAllByText('Urgent')).toHaveLength(1);
    expect(screen.getAllByText('Ouvert')).toHaveLength(1);
    expect(screen.queryByText('Suivi')).toBeNull();
    expect(screen.getAllByText('Non pris')).toHaveLength(1);
    expect(screen.getByText('Correction opérateur')).toBeDefined();
    expect(screen.getByText('Annulation opérateur')).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Notes' })).toBeNull();
  });

  it('nomme explicitement l’action destructive responsable', () => {
    renderPanel();

    expect(screen.getByRole('button', { name: "Annuler l'incident" })).toBeDefined();
    expect(screen.queryByRole('button', { name: /^Annuler$/ })).toBeNull();
  });

  it('nomme explicitement une demande opérateur d’annulation', () => {
    renderPanel({
      incident: mockIncident({ role: 'OPERATOR', user_id: 7, is_followed: false }),
      userRole: 'OPERATOR',
      userId: 7,
      isResponsable: false,
    });

    expect(screen.getByRole('button', { name: "Demander l'annulation" })).toBeDefined();
    expect(screen.queryByRole('button', { name: /^Annuler$/ })).toBeNull();
  });

  it("permet de reprendre l'arbitrage depuis le détail après consultation du cas", () => {
    const incident = mockIncident({
      edit_request: { state: 'DEGRADEE' },
      arbitration: {
        edit: {
          requestEventId: 42,
          requestedAt: '2026-06-28T11:00:00.000Z',
          state: 'WAITING',
          consultedAt: '2026-06-28T11:05:00.000Z',
        },
      },
    });
    const { modal } = renderPanel({ incident });

    fireEvent.click(screen.getByRole('button', { name: 'Reprendre' }));

    expect(modal.openReview).toHaveBeenCalledWith(incident, 'edit');
  });

  it('affiche la consigne responsable même sans droit d’édition', () => {
    renderPanel({
      incident: mockIncident({
        responsible_comment: 'Prioriser après contrôle qualité.',
        is_taken: true,
        taken_by_user_id: 9,
        taken_by_first_name: 'Assia',
        taken_by_last_name: 'AKIK',
        taken_by_role: 'MAINTENANCE',
      }),
      userRole: 'MAINTENANCE',
      userId: 9,
      isResponsable: false,
      isMaintenance: true,
    });

    expect(screen.getByRole('heading', { name: 'Consigne responsable' })).toBeDefined();
    expect(screen.getByText('Prioriser après contrôle qualité.')).toBeDefined();
    expect(screen.queryByRole('textbox', { name: 'Consigne responsable' })).toBeNull();
  });
});
