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
    ...overrides,
  };
}

const defaultFilters = {
  lineId: 'all',
  status: 'all',
  aging: 'all',
  priority: 'all',
  taken: 'all',
  query: '',
};

describe('IncidentMetricsBar – rendu', () => {
  it('affiche un spinner quand metricsLoading est vrai', () => {
    const { container } = render(
      <IncidentMetricsBar metricsLoading metrics={null} filters={defaultFilters} onSetFilters={vi.fn()} />
    );
    expect(container.querySelector('.spinner')).toBeDefined();
  });

  it('affiche les compteurs quand les métriques sont disponibles', () => {
    render(
      <IncidentMetricsBar metricsLoading={false} metrics={mockMetrics()} filters={defaultFilters} onSetFilters={vi.fn()} />
    );
    expect(screen.getByText('10')).toBeDefined();
    expect(screen.getByText('5')).toBeDefined();
    expect(screen.getByText('3')).toBeDefined();
  });

  it('affiche "KPI indisponibles" quand metrics est null et non loading', () => {
    render(
      <IncidentMetricsBar metricsLoading={false} metrics={null} filters={defaultFilters} onSetFilters={vi.fn()} />
    );
    expect(screen.getByText('KPI indisponibles')).toBeDefined();
  });
});

describe('IncidentMetricsBar – filtres', () => {
  it('clic "Total" remet status, aging, priority, taken à all', () => {
    const onSetFilters = vi.fn();
    const filters = { ...defaultFilters, status: 'OPEN', priority: 'urgent', taken: 'not_taken' };
    render(
      <IncidentMetricsBar metricsLoading={false} metrics={mockMetrics()} filters={filters} onSetFilters={onSetFilters} />
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
      <IncidentMetricsBar metricsLoading={false} metrics={mockMetrics()} filters={filters} onSetFilters={onSetFilters} />
    );
    const btns = screen.getAllByRole('button');
    const ouverts = btns.find((b) => b.textContent?.includes('Ouverts') && !b.textContent?.includes('7j'));
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
      <IncidentMetricsBar metricsLoading={false} metrics={mockMetrics()} filters={filters} onSetFilters={onSetFilters} />
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
      <IncidentMetricsBar metricsLoading={false} metrics={mockMetrics()} filters={filters} onSetFilters={onSetFilters} />
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
      <IncidentMetricsBar metricsLoading={false} metrics={mockMetrics()} filters={filters} onSetFilters={vi.fn()} />
    );
    const btns = screen.getAllByRole('button');
    const ouverts = btns.find((b) => b.textContent?.includes('Ouverts') && !b.textContent?.includes('7j'));
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
