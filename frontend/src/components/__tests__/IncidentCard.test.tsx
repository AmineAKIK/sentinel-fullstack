import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('affiche le motif de mise en attente d’un incident suspendu (C-05)', () => {
    render(
      <IncidentCard
        incident={mockIncident({ status: 'PENDING', waiting_reason: 'Attente pièce détachée' })}
        {...defaultProps}
      />
    );
    // Le libellé métier est « Motif de mise en attente », jamais « Diagnostic ».
    expect(screen.getByText(/Motif de mise en attente : Attente pièce détachée/)).toBeDefined();
    expect(screen.queryByText(/Suspension justifiée/)).toBeNull();
  });

  it('affiche le bouton « Modification à arbitrer » si responsable et edit_request présent', () => {
    render(
      <IncidentCard
        incident={mockIncident({ edit_request: { state: 'ARRET' } })}
        {...defaultProps}
        isResponsable
      />
    );
    expect(screen.getByRole('button', { name: 'Modification à arbitrer' })).toBeDefined();
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

  it('affiche le bouton « Annulation à arbitrer » si responsable et cancel_request', () => {
    render(
      <IncidentCard
        incident={mockIncident({ cancel_request: true })}
        {...defaultProps}
        isResponsable
      />
    );
    expect(screen.getByRole('button', { name: 'Annulation à arbitrer' })).toBeDefined();
  });

  it('rend l’indicateur d’arbitrage cliquable pour le responsable (commande)', () => {
    render(
      <IncidentCard
        incident={mockIncident({ cancel_request: true, edit_request: { state: 'ARRET' } })}
        {...defaultProps}
        isResponsable
      />
    );
    // Le responsable dispose d'une commande d'arbitrage : de vrais boutons.
    expect(screen.getByRole('button', { name: 'Annulation à arbitrer' }).tagName).toBe('BUTTON');
    expect(screen.getByRole('button', { name: 'Modification à arbitrer' }).tagName).toBe('BUTTON');
  });

  it('rend l’indicateur d’arbitrage EN LECTURE SEULE pour les rôles non responsables', () => {
    const { container } = render(
      <IncidentCard
        incident={mockIncident({ cancel_request: true, edit_request: { state: 'ARRET' } })}
        {...defaultProps}
        isResponsable={false}
      />
    );
    // Même libellé court — parité carte/panneau/Board — mais aucune commande.
    const cancelIndicator = screen.getByLabelText('Annulation à arbitrer');
    const editIndicator = screen.getByLabelText('Modification à arbitrer');
    expect(cancelIndicator.tagName).toBe('SPAN');
    expect(editIndicator.tagName).toBe('SPAN');
    expect(cancelIndicator.className).toContain('incident-request-action--readonly');
    // Aucun bouton d'arbitrage exposé : les seuls boutons éventuels ne portent
    // pas de commande d'arbitrage.
    expect(container.querySelector('.incident-request-action button')).toBeNull();
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
  it('ouvre le dossier quand le titre visible est cliqué', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const incident = mockIncident();
    render(<IncidentCard incident={incident} {...defaultProps} onClick={onClick} />);

    await user.click(screen.getByRole('heading', { name: 'Ligne L01 · M01' }));

    expect(onClick).toHaveBeenCalledWith(incident);
  });

  it('ouvre le dossier quand la métadonnée produit est cliquée hors du titre', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const incident = mockIncident({ current_product: 'PRODUIT X45' });
    render(<IncidentCard incident={incident} {...defaultProps} onClick={onClick} />);

    await user.click(screen.getByText('PRODUIT X45'));

    expect(onClick).toHaveBeenCalledWith(incident);
  });

  it('ouvre le dossier quand la consigne est cliquée hors du titre', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const incident = mockIncident({
      responsible_comment: 'Sécuriser la zone avant intervention.',
    });
    render(<IncidentCard incident={incident} {...defaultProps} onClick={onClick} />);

    await user.click(screen.getByText('Sécuriser la zone avant intervention.'));

    expect(onClick).toHaveBeenCalledWith(incident);
  });

  it('ouvre le dossier quand le motif de mise en attente est cliqué hors du titre', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const incident = mockIncident({
      status: 'PENDING',
      waiting_reason: 'Attente pièce détachée',
    });
    render(<IncidentCard incident={incident} {...defaultProps} onClick={onClick} />);

    await user.click(
      screen.getByText('Motif de mise en attente : Attente pièce détachée', { exact: true })
    );

    expect(onClick).toHaveBeenCalledWith(incident);
  });

  it('ouvre le dossier quand le pied de carte est cliqué hors du titre', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const incident = mockIncident();
    render(<IncidentCard incident={incident} {...defaultProps} onClick={onClick} />);

    await user.click(screen.getByText('Créé par Jean Dupont · Opérateur', { exact: true }));

    expect(onClick).toHaveBeenCalledWith(incident);
  });

  it('active réellement l’ouverture avec la touche Entrée', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const incident = mockIncident();
    render(<IncidentCard incident={incident} {...defaultProps} onClick={onClick} />);

    const openActivator = screen.getByLabelText(/ouvrir incident ligne L01, machine M01/i);
    await user.tab();
    expect(openActivator).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(onClick).toHaveBeenCalledWith(incident);
  });

  it('active réellement l’ouverture avec la touche Espace', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const incident = mockIncident();
    render(<IncidentCard incident={incident} {...defaultProps} onClick={onClick} />);

    const openActivator = screen.getByLabelText(/ouvrir incident ligne L01, machine M01/i);
    await user.tab();
    expect(openActivator).toHaveFocus();
    await user.keyboard('[Space]');

    expect(onClick).toHaveBeenCalledWith(incident);
  });

  it('appelle onReviewEdit sans ouvrir le dossier', async () => {
    const user = userEvent.setup();
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

    await user.click(screen.getByRole('button', { name: 'Modification à arbitrer' }));

    expect(onReviewEdit).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('appelle onReviewDelete sans ouvrir le dossier', async () => {
    const user = userEvent.setup();
    const onReviewDelete = vi.fn();
    const onClick = vi.fn();
    const incident = mockIncident({ cancel_request: true });
    render(
      <IncidentCard
        incident={incident}
        {...defaultProps}
        onClick={onClick}
        onReviewDelete={onReviewDelete}
        isResponsable
      />
    );

    await user.click(screen.getByRole('button', { name: 'Annulation à arbitrer' }));

    expect(onReviewDelete).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('appelle onToggleFollow sans ouvrir le dossier', async () => {
    const user = userEvent.setup();
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

    await user.click(screen.getByRole('button', { name: 'Suivre cet incident' }));

    expect(onToggleFollow).toHaveBeenCalledWith(incident);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("conserve l'article et un lien d'ouverture unique sans interaction imbriquée", () => {
    const incident = mockIncident({
      is_followed: true,
      edit_request: { state: 'ARRET' },
      cancel_request: true,
    });
    const { container } = render(
      <IncidentCard incident={incident} {...defaultProps} isResponsable />
    );

    const article = container.querySelector('article[data-incident-card-id="1"]');
    expect(article).not.toBeNull();
    expect(article?.getAttribute('role')).toBeNull();
    expect(article?.getAttribute('tabindex')).toBeNull();

    const openLink = screen.getByRole('link', {
      name: /ouvrir incident ligne L01, machine M01/i,
    });
    expect(openLink.tagName).toBe('A');
    expect(openLink).toHaveAttribute('href', '/workshop/dashboard?incident=1');
    expect(article?.querySelectorAll('a.incident-card-open')).toHaveLength(1);
    expect(
      article?.querySelector('a[href] a[href], a[href] button, button a[href], button button')
    ).toBeNull();

    for (const independentAction of [
      screen.getByRole('button', { name: 'Retirer du suivi' }),
      screen.getByRole('button', { name: 'Modification à arbitrer' }),
      screen.getByRole('button', { name: 'Annulation à arbitrer' }),
    ]) {
      expect(openLink.contains(independentAction)).toBe(false);
    }
  });
});
