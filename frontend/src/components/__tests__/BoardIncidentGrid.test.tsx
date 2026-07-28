// Vitest s'exécute sous Node, tandis que le bundle navigateur n'inclut pas ses
// déclarations de types. Ces imports lisent la vraie feuille plutôt que le
// `?raw` vide dans cette configuration.
// @ts-expect-error — module Node présent à l'exécution du test.
import { readFileSync } from 'node:fs';
// @ts-expect-error — module Node présent à l'exécution du test.
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import BoardIncidentGrid, { BoardWaitingReason } from '../board/BoardIncidentGrid';
import type { IncidentStatus, WorkshopBoardIncident } from '../../types';

const boardStyles = readFileSync(resolve('src/styles/pages/board.css'), 'utf8');

function mockIncident(overrides: Partial<WorkshopBoardIncident> = {}): WorkshopBoardIncident {
  return {
    id: 1,
    line_id: 1,
    line_number: 'JE-L1',
    machine_id: 'JE-M1',
    robot_label: 'R01',
    head_number: 4,
    state: 'DEGRADEE',
    current_product: 'PRODUIT X45',
    is_taken: false,
    is_priority: true,
    responsible_comment: 'Sécuriser la zone avant intervention.',
    waiting_reason: null,
    status: 'OPEN',
    display_order: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function renderGrid(items: WorkshopBoardIncident[]) {
  return render(
    <BoardIncidentGrid items={items} activeView="alerts" boardModeLabel="Alerte atelier" />
  );
}

describe('BoardIncidentGrid', () => {
  it('met en avant urgence, produit et consigne responsable', () => {
    renderGrid([mockIncident()]);

    expect(screen.getByText('Urgent')).toBeDefined();
    expect(screen.queryByText(/action prioritaire/i)).toBeNull();
    expect(screen.getByText('PRODUIT X45')).toBeDefined();
    expect(screen.getByText('Consigne')).toBeDefined();
    expect(screen.getByText('Sécuriser la zone avant intervention.')).toBeDefined();
    expect(screen.getByText('Non pris')).toBeDefined();
  });

  it('atténue uniquement la valeur produit lorsqu’elle est absente', () => {
    const { container } = renderGrid([mockIncident({ current_product: null })]);

    expect(screen.getByText('Non renseigné')).toBeDefined();
    expect(container.querySelector('.board-incident-product.is-missing')).not.toBeNull();
  });

  it('réserve la même zone de consigne lorsqu’aucune consigne n’existe', () => {
    const { container } = renderGrid([
      mockIncident(),
      mockIncident({ id: 2, is_priority: false, responsible_comment: null }),
    ]);

    expect(container.querySelectorAll('.board-incident-card')).toHaveLength(2);
    expect(container.querySelectorAll('.board-incident-instruction')).toHaveLength(2);
    expect(screen.getByLabelText('Aucune consigne responsable')).toBeDefined();
  });

  it('regroupe les détails équipement sur une ligne de valeur dédiée', () => {
    const { container } = renderGrid([mockIncident()]);
    const equipmentValue = container.querySelector('.board-incident-equipment-value');

    expect(equipmentValue).not.toBeNull();
    expect(equipmentValue?.textContent).toContain('JE-M1');
    expect(equipmentValue?.textContent).toContain('R01 · Tête 4');
  });

  it('conserve la consigne longue intégralement sans mécanisme de troncature', () => {
    const instruction = 'Consigne responsable détaillée. '.repeat(16).slice(0, 500);
    const { container } = renderGrid([mockIncident({ responsible_comment: instruction })]);
    const instructionBlock = container.querySelector('.board-incident-instruction');

    expect(instructionBlock?.hasAttribute('title')).toBe(false);
    expect(screen.getByText(instruction)).toBeDefined();
  });

  it('interdit les ellipses dans les informations du board', () => {
    expect(boardStyles.length).toBeGreaterThan(1000);
    expect(boardStyles).not.toContain('text-overflow: ellipsis');
  });

  it('affiche le motif courant exact sur une vraie carte Board PENDING', () => {
    const pendingWithReason = {
      ...mockIncident({ status: 'PENDING' }),
      waiting_reason: 'Attente pièce détachée RC4',
    };

    renderGrid([pendingWithReason]);

    expect(screen.getByText('Motif de mise en attente : Attente pièce détachée RC4')).toBeDefined();
  });

  it('n’affiche aucune ligne vide pour un motif PENDING nul ou composé d’espaces', () => {
    const pendingWithoutReason = {
      ...mockIncident({ status: 'PENDING' }),
      waiting_reason: null,
    };
    const pendingWithBlankReason = {
      ...mockIncident({ id: 2, status: 'PENDING' }),
      waiting_reason: '     ',
    };

    renderGrid([pendingWithoutReason, pendingWithBlankReason]);

    expect(screen.queryByText(/Motif de mise en attente/)).toBeNull();
  });

  it('masque un motif périmé sur une carte OPEN', () => {
    const openWithStaleReason = {
      ...mockIncident({ status: 'OPEN' }),
      waiting_reason: 'Motif périmé à masquer',
    };

    renderGrid([openWithStaleReason]);

    expect(screen.queryByText(/Motif de mise en attente/)).toBeNull();
    expect(screen.queryByText('Motif périmé à masquer')).toBeNull();
  });

  it.each<IncidentStatus>(['CLOSED', 'CANCELED', 'INVALIDATED'])(
    'masque le motif pour le statut non actif %s',
    (status) => {
      render(<BoardWaitingReason status={status} waitingReason="Motif à masquer" />);

      expect(screen.queryByText(/Motif de mise en attente/)).toBeNull();
      expect(screen.queryByText('Motif à masquer')).toBeNull();
    }
  );

  it('conserve un motif long intégralement accessible tout en bornant sa géométrie', () => {
    const longReason = 'RC4-motif-long-'.padEnd(1000, 'x');
    const pendingWithLongReason = {
      ...mockIncident({ status: 'PENDING' }),
      waiting_reason: longReason,
    };
    const { container } = renderGrid([pendingWithLongReason]);

    const reasonBlock = container.querySelector('.board-incident-waiting-reason');
    expect(reasonBlock).not.toBeNull();
    expect(reasonBlock?.textContent).toBe(`Motif de mise en attente : ${longReason}`);
    expect(reasonBlock?.hasAttribute('title')).toBe(false);
    expect(reasonBlock?.getAttribute('aria-hidden')).not.toBe('true');
    expect(boardStyles).toMatch(
      /\.board-incident-waiting-reason\s*\{[^}]*overflow-wrap:\s*anywhere;[^}]*\}/s
    );
    expect(boardStyles).toMatch(
      /\.board-incident-waiting-reason p\s*\{[^}]*overflow:\s*hidden;[^}]*-webkit-line-clamp:\s*2;[^}]*\}/s
    );
  });

  it('affiche « Annulation à arbitrer » en lecture seule, sans commande ni identité', () => {
    const { container } = renderGrid([mockIncident({ has_cancel_arbitration: true })]);

    const chip = screen.getByLabelText('Annulation à arbitrer');
    expect(chip).toBeDefined();
    // Libellé court identique à la carte atelier et au panneau.
    expect(chip.textContent).toBe('Annulation à arbitrer');
    // Aucune commande d'arbitrage : jamais de bouton sur le Board.
    expect(container.querySelector('button')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('affiche « Modification à arbitrer » en lecture seule', () => {
    const { container } = renderGrid([mockIncident({ has_edit_arbitration: true })]);

    const chip = screen.getByLabelText('Modification à arbitrer');
    expect(chip).toBeDefined();
    expect(chip.textContent).toBe('Modification à arbitrer');
    expect(container.querySelector('button')).toBeNull();
  });

  it('n’affiche aucun indicateur d’arbitrage sans demande en attente', () => {
    renderGrid([mockIncident()]);

    expect(screen.queryByLabelText('Annulation à arbitrer')).toBeNull();
    expect(screen.queryByLabelText('Modification à arbitrer')).toBeNull();
  });

  it('reste en lecture seule et ne rend aucune donnée privée injectée dans la source', () => {
    const adversarialIncident = {
      ...mockIncident({ status: 'PENDING' }),
      waiting_reason: 'Motif Board autorisé',
      comment: 'COMMENTAIRE-PRIVE-RC4',
      diagnostic: 'DIAGNOSTIC-PRIVE-RC4',
      first_name: 'IDENTITE-PRIVEE-RC4',
      last_name: 'NOM-PRIVE-RC4',
      badge_number: 'BADGE-PRIVE-RC4',
      taken_by_first_name: 'TECHNICIEN-PRIVE-RC4',
      role: 'ROLE-PRIVE-RC4',
      decision_reason: 'ARBITRAGE-PRIVE-RC4',
      permissions: ['MUTATION-PRIVEE-RC4'],
    };
    const { container } = renderGrid([adversarialIncident]);

    expect(screen.getByText('Motif de mise en attente : Motif Board autorisé')).toBeDefined();
    expect(screen.queryByText(/Diagnostic/i)).toBeNull();
    for (const sentinel of [
      'COMMENTAIRE-PRIVE-RC4',
      'DIAGNOSTIC-PRIVE-RC4',
      'IDENTITE-PRIVEE-RC4',
      'NOM-PRIVE-RC4',
      'BADGE-PRIVE-RC4',
      'TECHNICIEN-PRIVE-RC4',
      'ROLE-PRIVE-RC4',
      'ARBITRAGE-PRIVE-RC4',
      'MUTATION-PRIVEE-RC4',
    ]) {
      expect(container.textContent).not.toContain(sentinel);
    }
    expect(
      container.querySelector('button, a, input, textarea, select, form, [role="button"]')
    ).toBe(null);
  });
});
