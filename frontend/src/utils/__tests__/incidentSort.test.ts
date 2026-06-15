import { describe, it, expect } from 'vitest';
import { sortIncidents } from '../incidentSort';

type Incident = { is_priority: boolean; display_order: number; is_taken: boolean; created_at: string };

function inc(overrides: Partial<Incident> = {}): Incident {
  return { is_priority: false, display_order: 0, is_taken: false, created_at: '2024-01-01T00:00:00Z', ...overrides };
}

describe('sortIncidents', () => {
  it('ne mute pas le tableau source', () => {
    const items = [inc(), inc()];
    const original = [...items];
    sortIncidents(items);
    expect(items).toEqual(original);
  });

  it('prioritaires avant non-prioritaires', () => {
    const a = inc({ is_priority: false });
    const b = inc({ is_priority: true });
    const result = sortIncidents([a, b]);
    expect(result[0]).toBe(b);
  });

  it('display_order décroissant (plus grand = plus haut)', () => {
    const a = inc({ display_order: 10 });
    const b = inc({ display_order: 20 });
    const result = sortIncidents([a, b]);
    expect(result[0]).toBe(b);
  });

  it('non-pris avant pris (à display_order égal)', () => {
    const taken = inc({ is_taken: true });
    const notTaken = inc({ is_taken: false });
    const result = sortIncidents([taken, notTaken]);
    expect(result[0]).toBe(notTaken);
  });

  it('plus récent en premier (fallback created_at)', () => {
    const old = inc({ created_at: '2024-01-01T00:00:00Z' });
    const recent = inc({ created_at: '2024-06-01T00:00:00Z' });
    const result = sortIncidents([old, recent]);
    expect(result[0]).toBe(recent);
  });

  it('priorité prime sur display_order', () => {
    const highOrder = inc({ display_order: 99 });
    const priority = inc({ is_priority: true, display_order: 1 });
    const result = sortIncidents([highOrder, priority]);
    expect(result[0]).toBe(priority);
  });

  it('tableau vide → tableau vide', () => {
    expect(sortIncidents([])).toEqual([]);
  });
});
