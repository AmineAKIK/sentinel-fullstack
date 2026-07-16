import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import IncidentMetricsBar from '../IncidentMetricsBar';
import { WorkshopIncidentMetrics } from '../../types';

function mockMetrics(overrides: Partial<WorkshopIncidentMetrics> = {}): WorkshopIncidentMetrics {
  return {
    total: 10,
    open: 5,
    pending: 3,
    priority: 2,
    taken: 4,
    not_taken: 6,
    open_over_7d: 1,
    closed_today: 0,
    arbitration_unread: 0,
    ...overrides,
  };
}

const defaultFilters = {
  lineId: 'all',
  status: 'all',
  aging: 'all',
  priority: 'all',
  taken: 'all',
  scope: 'all',
  query: '',
};

function metricLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.workshop-metric-label')).map(
    (node) => node.textContent ?? ''
  );
}

describe('IncidentMetricsBar – rendu', () => {
  it('affiche un spinner quand metricsLoading est vrai', () => {
    const { container } = render(
      <IncidentMetricsBar
        metricsLoading
        metrics={null}
        filters={defaultFilters}
        onSetFilters={vi.fn()}
      />
    );
    expect(container.querySelector('.spinner')).toBeDefined();
  });

  it('affiche les compteurs quand les métriques sont disponibles', () => {
    render(
      <IncidentMetricsBar
        metricsLoading={false}
        metrics={mockMetrics()}
        filters={defaultFilters}
        onSetFilters={vi.fn()}
      />
    );
    expect(screen.getByText('10')).toBeDefined();
    expect(screen.getByText('5')).toBeDefined();
    expect(screen.getByText('3')).toBeDefined();
  });

  it('affiche "KPI indisponibles" quand metrics est null et non loading', () => {
    render(
      <IncidentMetricsBar
        metricsLoading={false}
        metrics={null}
        filters={defaultFilters}
        onSetFilters={vi.fn()}
      />
    );
    expect(screen.getByText('KPI indisponibles')).toBeDefined();
  });
});

describe('IncidentMetricsBar – ordre métier', () => {
  it('place les tuiles opérateur dans l’ordre de suivi déclarant', () => {
    const { container } = render(
      <IncidentMetricsBar
        metricsLoading={false}
        metrics={mockMetrics()}
        filters={defaultFilters}
        role="OPERATOR"
        createdByMeCount={4}
        onSetFilters={vi.fn()}
      />
    );

    expect(metricLabels(container)).toEqual([
      'Créés par moi',
      'En attente',
      'Non pris',
      'Urgents',
      'Ouverts > 7j',
      'Ouverts',
      'Total',
    ]);
  });

  it('place les tuiles maintenance dans l’ordre d’intervention', () => {
    const { container } = render(
      <IncidentMetricsBar
        metricsLoading={false}
        metrics={mockMetrics({ assigned_to_me: 2 })}
        filters={defaultFilters}
        role="MAINTENANCE"
        onSetFilters={vi.fn()}
      />
    );

    expect(metricLabels(container)).toEqual([
      'Urgents',
      'Non pris',
      'Pris par moi',
      'En attente',
      'Ouverts > 7j',
      'Ouverts',
      'Total',
    ]);
  });

  it('place les tuiles responsable dans l’ordre de décision et pilotage', () => {
    const { container } = render(
      <IncidentMetricsBar
        metricsLoading={false}
        metrics={mockMetrics({ followed: 6, followed_resolved: 2 })}
        filters={defaultFilters}
        role="RESPONSABLE"
        requestsCount={3}
        onSetFilters={vi.fn()}
      />
    );

    expect(metricLabels(container)).toEqual([
      'À arbitrer',
      'Urgents',
      'Non pris',
      'Ouverts > 7j',
      'En attente',
      'Suivis',
      'Ouverts',
      'Total',
    ]);
  });

  it('affiche une pastille de nouveaux arbitrages sur la tuile responsable', () => {
    render(
      <IncidentMetricsBar
        metricsLoading={false}
        metrics={mockMetrics({ arbitration_unread: 2 })}
        filters={defaultFilters}
        role="RESPONSABLE"
        requestsCount={5}
        onSetFilters={vi.fn()}
      />
    );

    const arbitrationTile = screen.getByRole('button', {
      name: /À arbitrer, 2 nouveaux cas non consultés/i,
    });
    expect(arbitrationTile).toBeDefined();
    expect(arbitrationTile.textContent).toContain('5');
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);
  });

  it('plafonne la pastille d’arbitrage à 99+', () => {
    render(
      <IncidentMetricsBar
        metricsLoading={false}
        metrics={mockMetrics({ arbitration_unread: 120 })}
        filters={defaultFilters}
        role="RESPONSABLE"
        requestsCount={120}
        onSetFilters={vi.fn()}
      />
    );

    expect(screen.getByText('99+')).toBeDefined();
  });

  it("place les clôtures du jour juste avant Total lorsqu'elles sont affichées", () => {
    const { container } = render(
      <IncidentMetricsBar
        metricsLoading={false}
        metrics={mockMetrics({ closed_today: 2 })}
        filters={defaultFilters}
        role="MAINTENANCE"
        onSetFilters={vi.fn()}
      />
    );

    expect(metricLabels(container)).toEqual([
      'Urgents',
      'Non pris',
      'Pris par moi',
      'En attente',
      'Ouverts > 7j',
      'Ouverts',
      "Clôturés aujourd'hui",
      'Total',
    ]);
  });
});

describe('IncidentMetricsBar – filtres', () => {
  it('clic "Total" remet status, aging, priority, taken à all', () => {
    const onSetFilters = vi.fn();
    const filters = { ...defaultFilters, status: 'OPEN', priority: 'urgent', taken: 'not_taken' };
    render(
      <IncidentMetricsBar
        metricsLoading={false}
        metrics={mockMetrics()}
        filters={filters}
        onSetFilters={onSetFilters}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Total/i }));
    expect(onSetFilters).toHaveBeenCalledTimes(1);
    const updater = onSetFilters.mock.calls[0][0];
    const result = updater(filters);
    expect(result.status).toBe('all');
    expect(result.priority).toBe('all');
    expect(result.taken).toBe('all');
    expect(result.aging).toBe('all');
  });

  it('clic "Ouverts" remet priority et taken à all', () => {
    const onSetFilters = vi.fn();
    const filters = { ...defaultFilters, priority: 'urgent', taken: 'not_taken' };
    render(
      <IncidentMetricsBar
        metricsLoading={false}
        metrics={mockMetrics()}
        filters={filters}
        onSetFilters={onSetFilters}
      />
    );
    const btns = screen.getAllByRole('button');
    const ouverts = btns.find(
      (b) => b.textContent?.includes('Ouverts') && !b.textContent?.includes('7j')
    );
    if (!ouverts) throw new Error('Bouton Ouverts introuvable');
    fireEvent.click(ouverts);
    const updater = onSetFilters.mock.calls[0][0];
    const result = updater(filters);
    expect(result.status).toBe('OPEN');
    expect(result.priority).toBe('all');
    expect(result.taken).toBe('all');
  });

  it('clic "En attente" remet priority et taken à all', () => {
    const onSetFilters = vi.fn();
    const filters = { ...defaultFilters, priority: 'urgent' };
    render(
      <IncidentMetricsBar
        metricsLoading={false}
        metrics={mockMetrics()}
        filters={filters}
        onSetFilters={onSetFilters}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /En attente/i }));
    const updater = onSetFilters.mock.calls[0][0];
    const result = updater(filters);
    expect(result.status).toBe('PENDING');
    expect(result.priority).toBe('all');
    expect(result.taken).toBe('all');
  });

  it('clic "Ouverts > 7j" remet priority et taken à all', () => {
    const onSetFilters = vi.fn();
    const filters = { ...defaultFilters, priority: 'urgent', taken: 'not_taken' };
    render(
      <IncidentMetricsBar
        metricsLoading={false}
        metrics={mockMetrics()}
        filters={filters}
        onSetFilters={onSetFilters}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /7j/i }));
    const updater = onSetFilters.mock.calls[0][0];
    const result = updater(filters);
    expect(result.aging).toBe('over_7d');
    expect(result.priority).toBe('all');
    expect(result.taken).toBe('all');
  });

  it('le bouton "Ouverts" est actif quand status === OPEN', () => {
    const filters = { ...defaultFilters, status: 'OPEN' };
    render(
      <IncidentMetricsBar
        metricsLoading={false}
        metrics={mockMetrics()}
        filters={filters}
        onSetFilters={vi.fn()}
      />
    );
    const btns = screen.getAllByRole('button');
    const ouverts = btns.find(
      (b) => b.textContent?.includes('Ouverts') && !b.textContent?.includes('7j')
    );
    if (!ouverts) throw new Error('Bouton Ouverts introuvable');
    expect(ouverts.className).toContain('active');
  });

  it('affiche le filtre "Créés par moi" pour un opérateur', () => {
    const onSetFilters = vi.fn();
    const filters = { ...defaultFilters, scope: 'all' };
    render(
      <IncidentMetricsBar
        metricsLoading={false}
        metrics={mockMetrics()}
        filters={filters}
        role="OPERATOR"
        createdByMeCount={4}
        onSetFilters={onSetFilters}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Créés par moi/i }));
    const updater = onSetFilters.mock.calls[0][0];
    const result = updater(filters);
    expect(screen.getByText('4')).toBeDefined();
    expect(result.scope).toBe('created_by_me');
    expect(result.status).toBe('all');
    expect(result.priority).toBe('all');
    expect(result.taken).toBe('all');
  });
});
