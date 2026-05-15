import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DashboardFilters from '../DashboardFilters';
import { ProductionLine } from '../../types';

function mockLine(id: number, line_number: string): ProductionLine {
  return {
    id,
    line_number,
    is_active: true,
    machines: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

const defaultFilters = {
  lineId: 'all',
  status: 'all',
  priority: 'all',
  taken: 'all',
  query: '',
  aging: 'all',
};

function renderFilters(overrides = {}) {
  const onSetFilters = vi.fn();
  const onClose = vi.fn();
  render(
    <DashboardFilters
      lines={[mockLine(1, 'L01'), mockLine(2, 'L02')]}
      filters={{ ...defaultFilters, ...overrides }}
      onSetFilters={onSetFilters}
      onClose={onClose}
      filteredCount={5}
      filterChips={[]}
    />
  );
  return { onSetFilters, onClose };
}

describe('DashboardFilters – rendu', () => {
  it('affiche le titre "Filtres"', () => {
    renderFilters();
    expect(screen.getByText('Filtres')).toBeDefined();
  });

  it('affiche les lignes disponibles', () => {
    renderFilters();
    expect(screen.getByText('Ligne L01')).toBeDefined();
    expect(screen.getByText('Ligne L02')).toBeDefined();
  });

  it('affiche le bouton Appliquer', () => {
    renderFilters();
    expect(screen.getByRole('button', { name: /Appliquer/i })).toBeDefined();
  });

  it('affiche le bouton Tout effacer', () => {
    renderFilters();
    expect(screen.getByRole('button', { name: /Tout effacer/i })).toBeDefined();
  });
});

describe('DashboardFilters – interactions', () => {
  it('clic Appliquer appelle onClose', () => {
    const { onClose } = renderFilters();
    fireEvent.click(screen.getByRole('button', { name: /Appliquer/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clic Tout effacer remet tous les filtres à all et query à vide', () => {
    const { onSetFilters } = renderFilters({ lineId: '1', status: 'OPEN', priority: 'urgent' });
    fireEvent.click(screen.getByRole('button', { name: /Tout effacer/i }));
    expect(onSetFilters).toHaveBeenCalledTimes(1);
    const updater = onSetFilters.mock.calls[0][0];
    const result = updater({ lineId: '1', status: 'OPEN', priority: 'urgent', taken: 'not_taken', query: 'test', aging: 'over_7d' });
    expect(result.lineId).toBe('all');
    expect(result.status).toBe('all');
    expect(result.priority).toBe('all');
    expect(result.taken).toBe('all');
    expect(result.aging).toBe('all');
    expect(result.query).toBe('');
  });

  it('sélectionner une ligne appelle onSetFilters', () => {
    const { onSetFilters } = renderFilters();
    // Click on the L01 chip label
    const l01Label = screen.getByText('Ligne L01').closest('label');
    if (!l01Label) throw new Error('Label L01 introuvable');
    fireEvent.click(l01Label);
    expect(onSetFilters).toHaveBeenCalled();
  });
});
