import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ReviewIncidentRequestModal from '../ReviewIncidentRequestModal';
import { WorkshopIncident } from '../../types';

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
    is_priority: true,
    status: 'OPEN',
    diagnostic: null,
    intervention_note: null,
    responsible_comment: 'Prioriser si la ligne bloque.',
    edit_request: { state: 'DEGRADEE' },
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
    role: 'OPERATOR',
    arbitration: {
      edit: {
        requestEventId: 42,
        requestedAt: '2026-06-28T11:00:00.000Z',
        state: 'ACTIVE',
      },
    },
    ...overrides,
  };
}

describe('ReviewIncidentRequestModal', () => {
  it('sépare reporter et consultation explicite du dossier', () => {
    const onReport = vi.fn();
    const onConsult = vi.fn();

    render(
      <ReviewIncidentRequestModal
        incident={mockIncident()}
        lines={[]}
        type="edit"
        loading={false}
        error=""
        onClose={vi.fn()}
        onReport={onReport}
        onConsult={onConsult}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reporter' }));
    expect(onReport).toHaveBeenCalledTimes(1);
    expect(onConsult).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Consulter le dossier' }));
    expect(onConsult).toHaveBeenCalledTimes(1);
  });

  it('ne propose plus la consultation quand le dossier est déjà en attente', () => {
    render(
      <ReviewIncidentRequestModal
        incident={mockIncident({
          arbitration: {
            edit: {
              requestEventId: 42,
              requestedAt: '2026-06-28T11:00:00.000Z',
              state: 'WAITING',
              consultedAt: '2026-06-28T11:05:00.000Z',
              consultedByUserId: 3,
            },
          },
        })}
        lines={[]}
        type="edit"
        loading={false}
        error=""
        onClose={vi.fn()}
        onReport={vi.fn()}
        onConsult={vi.fn()}
      />
    );

    expect(screen.getByText(/Correction · Consultée/)).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Consulter le dossier' })).toBeNull();
  });

  it('présente une correction comme une décision lisible sans table brute', () => {
    render(
      <ReviewIncidentRequestModal
        incident={mockIncident()}
        lines={[]}
        type="edit"
        loading={false}
        error=""
        onClose={vi.fn()}
        onReport={vi.fn()}
        onConsult={vi.fn()}
      />
    );

    expect(screen.getByText('Arbitrage correction')).toBeDefined();
    expect(screen.getByText('Correction demandée')).toBeDefined();
    expect(screen.getAllByText('État').length).toBeGreaterThan(1);
    expect(screen.getByText('Dégradée')).toBeDefined();
    expect(screen.getAllByText('Demandé').length).toBeGreaterThan(0);
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('button', { name: 'Appliquer la correction' })).toBeDefined();
  });

  it('présente une demande d’annulation avec le motif et une action destructive explicite', () => {
    render(
      <ReviewIncidentRequestModal
        incident={mockIncident({
          edit_request: null,
          cancel_request: true,
          cancel_request_reason: 'doublon',
          arbitration: {
            cancel: {
              requestEventId: 43,
              requestedAt: '2026-06-28T11:10:00.000Z',
              state: 'ACTIVE',
            },
          },
        })}
        lines={[]}
        type="delete"
        loading={false}
        error=""
        onClose={vi.fn()}
        onReport={vi.fn()}
        onConsult={vi.fn()}
      />
    );

    expect(screen.getByText('Arbitrage annulation')).toBeDefined();
    expect(screen.getByText('Annulation opérateur')).toBeDefined();
    expect(screen.getByText('Motif opérateur')).toBeDefined();
    expect(screen.getByText('doublon')).toBeDefined();
    expect(screen.getByRole('button', { name: "Annuler l'incident" })).toBeDefined();
  });

  it('adapte la consultation quand deux demandes sont ouvertes sur le même incident', () => {
    const onConsult = vi.fn();

    render(
      <ReviewIncidentRequestModal
        incident={mockIncident({
          cancel_request: true,
          cancel_request_reason: 'doublon',
          arbitration: {
            edit: {
              requestEventId: 42,
              requestedAt: '2026-06-28T11:00:00.000Z',
              state: 'ACTIVE',
            },
            cancel: {
              requestEventId: 43,
              requestedAt: '2026-06-28T11:10:00.000Z',
              state: 'ACTIVE',
            },
          },
        })}
        lines={[]}
        type="edit"
        loading={false}
        error=""
        onClose={vi.fn()}
        onReport={vi.fn()}
        onConsult={onConsult}
      />
    );

    expect(screen.getByText(/Deux demandes sont ouvertes/)).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Consulter le dossier' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Consulter les demandes' }));
    expect(onConsult).toHaveBeenCalledTimes(1);
  });
});
