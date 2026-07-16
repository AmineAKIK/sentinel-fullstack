import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import IncidentCard from '../IncidentCard';
import { WorkshopIncident } from '../../types';

function mockIncident(overrides: Partial<WorkshopIncident> = {}): WorkshopIncident {
  return {
    id: 1,
    user_id: 1,
    line_id: 1,
    line_number: 'L01',
    machine_id: 'M01',
    machine_brand: 'Fanuc',
    robot_label: 'R01',
    head_number: 1,
    state: 'DEGRADEE',
    comment: null,
    current_product: null,
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
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    first_name: 'Jean',
    last_name: 'Dupont',
    badge_number: null,
    role: 'OPERATOR',
    ...overrides,
  };
}

const defaultProps = {
  isResponsable: false,
  isMaintenance: false,
  onClick: vi.fn(),
  onReviewEdit: vi.fn(),
  onReviewDelete: vi.fn(),
};

describe('IncidentCard – rendu', () => {
  it("affiche le numéro de ligne et l'identifiant machine", () => {
    render(<IncidentCard incident={mockIncident()} {...defaultProps} />);
    expect(screen.getByText(/L01/)).toBeDefined();
    expect(screen.getByText(/M01/)).toBeDefined();
  });

  it('affiche le badge "Non pris" si is_taken est faux', () => {
    render(<IncidentCard incident={mockIncident({ is_taken: false })} {...defaultProps} />);
    expect(screen.getByText('Non pris')).toBeDefined();
  });

  it('affiche le badge "Pris en charge" si is_taken est vrai', () => {
    render(<IncidentCard incident={mockIncident({ is_taken: true })} {...defaultProps} />);
    expect(screen.getByText('Pris en charge')).toBeDefined();
  });

  it('affiche le badge "Urgent" si is_priority est vrai', () => {
    render(<IncidentCard incident={mockIncident({ is_priority: true })} {...defaultProps} />);
    expect(screen.getByText('Urgent')).toBeDefined();
    expect(screen.queryByText(/action prioritaire/i)).toBeNull();
  });

  it("n'affiche pas le badge urgent si is_priority est faux", () => {
    render(<IncidentCard incident={mockIncident({ is_priority: false })} {...defaultProps} />);
    expect(screen.queryByText('Urgent')).toBeNull();
  });

  it('ne présente pas un incident résolu suivi comme une urgence active', () => {
    render(
      <IncidentCard
        incident={mockIncident({ is_priority: true, is_followed: true, status: 'CLOSED' })}
        {...defaultProps}
      />
    );
    expect(screen.queryByText('Urgent')).toBeNull();
    expect(screen.getByText('Incident clôturé')).toBeDefined();
  });

  it('identifie clairement la consigne responsable', () => {
    render(
      <IncidentCard
        incident={mockIncident({ responsible_comment: 'Sécuriser la zone avant intervention.' })}
        {...defaultProps}
      />
    );
    expect(screen.getByText('Consigne responsable')).toBeDefined();
    expect(screen.getByText('Sécuriser la zone avant intervention.')).toBeDefined();
  });

  it('conserve le produit en cours dans la ligne méta de la carte', () => {
    render(
      <IncidentCard incident={mockIncident({ current_product: 'PRODUIT X45' })} {...defaultProps} />
    );
    expect(screen.getByText('PRODUIT X45')).toBeDefined();
  });

  it('signale un produit non renseigné dans la ligne méta', () => {
    render(<IncidentCard incident={mockIncident({ current_product: '' })} {...defaultProps} />);
    expect(screen.getByText('Produit non renseigné')).toBeDefined();
  });

  it('affiche le bouton "Correction demandée" si responsable et edit_request présent', () => {
    render(
      <IncidentCard
        incident={mockIncident({ edit_request: { state: 'ARRET' } })}
        {...defaultProps}
        isResponsable
      />
    );
    expect(screen.getByText('Correction demandée')).toBeDefined();
  });

  it('signale une correction déjà prise en consultation', () => {
    render(
      <IncidentCard
        incident={mockIncident({
          edit_request: { state: 'ARRET' },
          arbitration: {
            edit: {
              caseId: 21,
              requestEventId: 11,
              requestedAt: new Date().toISOString(),
              state: 'WAITING',
            },
          },
        })}
        {...defaultProps}
        isResponsable
      />
    );
    expect(screen.getByText('Correction en attente')).toBeDefined();
  });

  it("n'affiche pas le bouton correction si non responsable", () => {
    render(
      <IncidentCard
        incident={mockIncident({ edit_request: { state: 'ARRET' } })}
        {...defaultProps}
        isResponsable={false}
      />
    );
    expect(screen.queryByText('Correction demandée')).toBeNull();
  });

  it('affiche le bouton "Annulation demandée" si responsable et cancel_request', () => {
    render(
      <IncidentCard
        incident={mockIncident({ cancel_request: true })}
        {...defaultProps}
        isResponsable
      />
    );
    expect(screen.getByText('Annulation demandée')).toBeDefined();
  });

  it('présente le suivi responsable comme une action compacte, pas comme une rangée de tags', () => {
    render(
      <IncidentCard
        incident={mockIncident({ is_followed: true })}
        {...defaultProps}
        isResponsable
      />
    );

    expect(screen.getByText('Suivi')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Retirer du suivi' })).toBeDefined();
    expect(document.querySelector('.incident-card-actions')).toBeNull();
  });
});

describe('IncidentCard – interactions', () => {
  it('appelle onClick quand on clique sur la carte', () => {
    const onClick = vi.fn();
    const incident = mockIncident();
    render(<IncidentCard incident={incident} {...defaultProps} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: /ouvrir incident/i }));
    expect(onClick).toHaveBeenCalledWith(incident);
  });

  it('appelle onClick avec Entrée quand la carte est focalisée', () => {
    const onClick = vi.fn();
    const incident = mockIncident();
    render(<IncidentCard incident={incident} {...defaultProps} onClick={onClick} />);
    fireEvent.keyDown(screen.getByRole('button', { name: /ouvrir incident/i }), { key: 'Enter' });
    expect(onClick).toHaveBeenCalledWith(incident);
  });

  it('appelle onReviewEdit sans propager le click au parent', () => {
    const onReviewEdit = vi.fn();
    const onClick = vi.fn();
    const incident = mockIncident({ edit_request: { state: 'ARRET' } });
    render(
      <IncidentCard
        incident={incident}
        {...defaultProps}
        onClick={onClick}
        onReviewEdit={onReviewEdit}
        isResponsable
      />
    );
    fireEvent.click(screen.getByText('Correction demandée'));
    expect(onReviewEdit).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('appelle onToggleFollow sans propager le click au parent', () => {
    const onToggleFollow = vi.fn();
    const onClick = vi.fn();
    const incident = mockIncident();
    render(
      <IncidentCard
        incident={incident}
        {...defaultProps}
        onClick={onClick}
        onToggleFollow={onToggleFollow}
        isResponsable
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Suivre cet incident' }));

    expect(onToggleFollow).toHaveBeenCalledWith(incident);
    expect(onClick).not.toHaveBeenCalled();
  });
});
