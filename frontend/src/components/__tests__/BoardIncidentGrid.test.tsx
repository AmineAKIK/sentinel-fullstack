import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import BoardIncidentGrid from '../board/BoardIncidentGrid';
import type { WorkshopBoardIncident } from '../../types';
import boardStyles from '../../styles/pages/board.css?raw';

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
    expect(boardStyles).not.toContain('text-overflow: ellipsis');
  });
});
