import { describe, it, expect } from 'vitest';
import { computeIncidentDiff } from '../incidentDiff';
import type { WorkshopIncident, ProductionLine } from '../../types';

const lines: ProductionLine[] = [
  {
    id: 1,
    line_number: 'L01',
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    machines: [{ machineId: 'M1', brand: 'Fanuc', hasDoubleRobot: false, robotNumber: 'R1', robotHeads: 1 }],
  },
  {
    id: 2,
    line_number: 'L02',
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    machines: [{ machineId: 'M2', brand: 'ABB', hasDoubleRobot: false, robotNumber: 'R2', robotHeads: 1 }],
  },
];

function incident(overrides: Partial<WorkshopIncident> = {}): WorkshopIncident {
  return {
    id: 1,
    user_id: 1,
    shift: 'MATIN',
    line_id: 1,
    line_number: 'L01',
    machine_id: 'M1',
    machine_brand: 'Fanuc',
    robot_label: 'R1',
    head_number: 1,
    state: 'DEGRADEE',
    comment: null,
    current_product: null,
    is_taken: false,
    is_priority: false,
    status: 'OPEN',
    diagnostic: null,
    intervention_note: null,
    responsible_comment: null,
    edit_request: null,
    taken_by_user_id: null,
    taken_at: null,
    taken_by_first_name: null,
    taken_by_last_name: null,
    taken_by_role: null,
    display_order: 0,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    first_name: 'Alice',
    last_name: 'Martin',
    role: 'OPERATOR',
    ...overrides,
  };
}

describe('computeIncidentDiff', () => {
  it('retourne tableau vide si rien ne change', () => {
    expect(computeIncidentDiff(incident(), {}, lines)).toEqual([]);
  });

  it('détecte un changement de shift', () => {
    const rows = computeIncidentDiff(incident(), { shift: 'NUIT' }, lines);
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe('Équipe');
    expect(rows[0].current).toBe('Matin');
    expect(rows[0].requested).toBe('Nuit');
  });

  it('détecte un changement de ligne', () => {
    const rows = computeIncidentDiff(incident(), { lineId: 2 }, lines);
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe('Ligne');
    expect(rows[0].current).toBe('L01');
    expect(rows[0].requested).toBe('L02');
  });

  it('détecte un changement de machine', () => {
    const rows = computeIncidentDiff(incident(), { machineId: 'M2' }, lines);
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe('Machine');
    expect(rows[0].current).toBe('M1 · Fanuc');
  });

  it('détecte un changement de commentaire (null → texte)', () => {
    const rows = computeIncidentDiff(incident({ comment: null }), { comment: 'nouveau' }, lines);
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe('Commentaire');
    expect(rows[0].current).toBe('-');
    expect(rows[0].requested).toBe('nouveau');
  });

  it('détecte un changement de produit', () => {
    const rows = computeIncidentDiff(incident(), { currentProduct: 'ProdX' }, lines);
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe('Produit en cours');
  });

  it('plusieurs changements simultanés → plusieurs lignes', () => {
    const rows = computeIncidentDiff(incident(), { shift: 'NUIT', lineId: 2 }, lines);
    expect(rows).toHaveLength(2);
  });

  it('ignore le shift si identique', () => {
    const rows = computeIncidentDiff(incident({ shift: 'MATIN' }), { shift: 'MATIN' }, lines);
    expect(rows).toHaveLength(0);
  });
});
