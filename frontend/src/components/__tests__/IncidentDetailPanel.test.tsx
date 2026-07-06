import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
        onEditSuccess={vi.fn()}
        onDeleteCommentConfirm={vi.fn(resolvedVoid)}
        patchIncident={vi.fn(() => Promise.resolve(incident))}
      />
    </MemoryRouter>
  );

  return { modal };
}

describe('IncidentDetailPanel', () => {
  it('affiche les badges et sections métier du drawer', () => {
    renderPanel({
      incident: mockIncident({
        edit_request: { state: 'DEGRADEE' },
        cancel_request: true,
      }),
    });

    expect(screen.getByRole('heading', { name: 'Équipement' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Traitement' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Origine' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Contexte machine' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Notes' })).toBeDefined();
    expect(screen.getAllByText('Urgent').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Ouvert').length).toBeGreaterThan(0);
    expect(screen.getByText('Suivi')).toBeDefined();
    expect(screen.getAllByText('Non pris').length).toBeGreaterThan(0);
    expect(screen.getByText("Correction opérateur en attente d'arbitrage.")).toBeDefined();
    expect(screen.getByText("Annulation opérateur en attente d'arbitrage.")).toBeDefined();
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
});
