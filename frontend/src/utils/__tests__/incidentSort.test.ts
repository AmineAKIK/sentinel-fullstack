import { describe, it, expect } from 'vitest';
import { sortIncidents, groupIncidentsByLine } from '../incidentSort';

type Incident = {
  is_priority: boolean;
  display_order: number;
  is_taken: boolean;
  created_at: string;
};

function inc(overrides: Partial<Incident> = {}): Incident {
  return {
    is_priority: false,
    display_order: 0,
    is_taken: false,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

type LineIncident = { line_id: number; line_number: string };

function lineInc(overrides: Partial<LineIncident> = {}): LineIncident {
  return { line_id: 1, line_number: '1', ...overrides };
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

describe('groupIncidentsByLine', () => {
  it('regroupe les incidents par line_id', () => {
    const a = lineInc({ line_id: 1, line_number: '1' });
    const b = lineInc({ line_id: 2, line_number: '2' });
    const c = lineInc({ line_id: 1, line_number: '1' });
    const groups = groupIncidentsByLine([a, b, c]);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.lineId === 1)?.incidents).toEqual([a, c]);
    expect(groups.find((g) => g.lineId === 2)?.incidents).toEqual([b]);
  });

  it("préserve l'ordre relatif des incidents à l'intérieur d'un groupe", () => {
    const first = lineInc({ line_id: 1, line_number: '1' });
    const second = lineInc({ line_id: 1, line_number: '1' });
    const third = lineInc({ line_id: 1, line_number: '1' });
    // Ordre volontairement non trié : simule un tableau déjà trié/filtré en amont
    // (priorité, non-pris...) dont l'ordre ne doit pas être perturbé par le groupBy.
    const groups = groupIncidentsByLine([third, first, second]);
    expect(groups[0].incidents).toEqual([third, first, second]);
  });

  it('trie les groupes en ordre numérique 1-9, pas lexicographique', () => {
    const line2 = lineInc({ line_id: 2, line_number: '2' });
    const line10 = lineInc({ line_id: 10, line_number: '10' });
    const line1 = lineInc({ line_id: 1, line_number: '1' });
    const groups = groupIncidentsByLine([line10, line2, line1]);
    expect(groups.map((g) => g.lineNumber)).toEqual(['1', '2', '10']);
  });

  it('trie les groupes A-Z quand line_number est alphabétique', () => {
    const lineB = lineInc({ line_id: 2, line_number: 'B' });
    const lineA = lineInc({ line_id: 1, line_number: 'A' });
    const groups = groupIncidentsByLine([lineB, lineA]);
    expect(groups.map((g) => g.lineNumber)).toEqual(['A', 'B']);
  });

  it("ordre des groupes indépendant du contenu (pas influencé par l'urgence ou le volume)", () => {
    // La ligne 1 n'a qu'un incident normal, la ligne 2 en a deux dont un urgent :
    // l'ordre des groupes doit rester 1 puis 2, jamais réordonné par priorité.
    const line1 = lineInc({ line_id: 1, line_number: '1' });
    const line2a = lineInc({ line_id: 2, line_number: '2' });
    const line2b = lineInc({ line_id: 2, line_number: '2' });
    const groups = groupIncidentsByLine([line2a, line2b, line1]);
    expect(groups.map((g) => g.lineNumber)).toEqual(['1', '2']);
  });

  it('tableau vide → aucun groupe', () => {
    expect(groupIncidentsByLine([])).toEqual([]);
  });
});
