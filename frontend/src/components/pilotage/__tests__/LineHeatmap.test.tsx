import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import LineHeatmap from '../LineHeatmap';
import { LineStatus } from '../../../hooks/usePilotageData';
import { ProductionLine, WorkshopIncident } from '../../../types';

function mockLine(overrides: Partial<ProductionLine> = {}): ProductionLine {
  return {
    id: 1,
    line_number: '999',
    machines: [],
    is_active: true,
    created_at: '2026-03-01T00:00:00.000Z',
    updated_at: '2026-03-01T00:00:00.000Z',
    ...overrides,
  };
}

function mockIncident(overrides: Partial<WorkshopIncident> = {}): WorkshopIncident {
  return {
    id: 1,
    user_id: 1,
    line_id: 1,
    line_number: '999',
    machine_id: 'MCH-1',
    machine_brand: 'Panasonic',
    robot_label: '1',
    head_number: 1,
    state: 'SKIPEE_PAR_MACHINE',
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
    created_at: '2026-03-01T00:00:00.000Z',
    updated_at: '2026-03-01T00:00:00.000Z',
    first_name: 'Eden',
    last_name: 'AKIK',
    badge_number: null,
    role: 'OPERATOR',
    is_followed: false,
    ...overrides,
  };
}

function mockLineStatus(overrides: Partial<LineStatus> = {}): LineStatus {
  return {
    line: mockLine(),
    incidents: [mockIncident()],
    urgentNotTaken: 0,
    notTaken: 0,
    oldCases: 0,
    tone: 'stable',
    ...overrides,
  };
}

describe('LineHeatmap — état des lignes accessible (RC5)', () => {
  it('affiche un état vide explicite quand aucune ligne ne remonte d’incident', () => {
    render(<LineHeatmap lineStatuses={[]} onOpenLine={vi.fn()} />);
    expect(screen.getByText('Toutes les lignes opérationnelles')).toBeInTheDocument();
    expect(document.querySelector('.pilotage-heatmap-row')).toBeNull();
  });

  it('expose un libellé accessible complet par ligne, pas seulement les abréviations visuelles', () => {
    render(
      <LineHeatmap
        lineStatuses={[
          mockLineStatus({
            urgentNotTaken: 2,
            notTaken: 3,
            tone: 'tension',
          }),
        ]}
        onOpenLine={vi.fn()}
      />
    );
    const row = screen.getByRole('button');
    const label = row.getAttribute('aria-label') ?? '';
    expect(label).toContain('Ligne 999');
    expect(label).toContain('Sous tension');
    expect(label).toContain('urgent');
    expect(label).toContain('sans technicien');
    // Les abréviations visuelles ne doivent pas être l'unique porteur
    // d'information pour l'assistance : le contenu visuel est aria-hidden.
    for (const cell of Array.from(document.querySelectorAll('.pilotage-heatmap-cell'))) {
      expect(cell.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('ne communique pas l’état uniquement par la couleur : le point est aria-hidden mais doublé par le libellé du bouton', () => {
    render(<LineHeatmap lineStatuses={[mockLineStatus({ tone: 'watch' })]} onOpenLine={vi.fn()} />);
    const dot = document.querySelector('.pilotage-status-dot');
    expect(dot?.parentElement?.getAttribute('aria-hidden')).toBe('true');
    const row = screen.getByRole('button');
    expect(row.getAttribute('aria-label')).toContain('À surveiller');
  });

  it('déclenche onOpenLine avec l’identifiant correct au clic', () => {
    const onOpenLine = vi.fn();
    render(
      <LineHeatmap
        lineStatuses={[mockLineStatus({ line: mockLine({ id: 42, line_number: '317' }) })]}
        onOpenLine={onOpenLine}
      />
    );
    screen.getByRole('button').click();
    expect(onOpenLine).toHaveBeenCalledWith(42);
  });

  it('rend plusieurs lignes de statuts différents sans perdre de données', () => {
    render(
      <LineHeatmap
        lineStatuses={[
          mockLineStatus({ line: mockLine({ id: 1, line_number: '100' }), tone: 'tension' }),
          mockLineStatus({ line: mockLine({ id: 2, line_number: '200' }), tone: 'watch' }),
          mockLineStatus({ line: mockLine({ id: 3, line_number: '300' }), tone: 'stable' }),
        ]}
        onOpenLine={vi.fn()}
      />
    );
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });
});
