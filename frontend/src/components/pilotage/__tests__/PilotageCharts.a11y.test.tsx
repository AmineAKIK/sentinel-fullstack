import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { TrendChart } from '../PilotageCharts';
import { WorkshopAnalytics } from '../../../types/workshop';

function trendItem(
  overrides: Partial<WorkshopAnalytics['trend'][number]> = {}
): WorkshopAnalytics['trend'][number] {
  return {
    day: '2026-03-01',
    created: 4,
    closed: 2,
    priority: 0,
    median_take_seconds: null,
    median_close_seconds: null,
    ...overrides,
  };
}

describe('TrendChart — valeurs accessibles au-delà du survol (lot 8, A11Y-05)', () => {
  it('expose la valeur "Créés" en texte accessible, pas seulement via title', () => {
    const { container } = render(<TrendChart trend={[trendItem({ created: 7, closed: 3 })]} />);

    expect(container.textContent).toContain('Créés : 7');
    expect(container.textContent).toContain('Clôturés : 3');
  });

  it('masque les barres décoratives aux technologies d’assistance', () => {
    const { container } = render(<TrendChart trend={[trendItem()]} />);

    const bars = container.querySelectorAll(
      '.pilotage-trend-bar-created, .pilotage-trend-bar-closed'
    );
    expect(bars.length).toBe(2);
    for (const bar of bars) {
      expect(bar.getAttribute('aria-hidden')).toBe('true');
    }
  });
});
