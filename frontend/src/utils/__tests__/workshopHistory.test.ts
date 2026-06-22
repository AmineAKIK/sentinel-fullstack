import { describe, it, expect } from 'vitest';
import { formatEventActor, formatEventDetail } from '../workshopHistory';
import type { WorkshopIncidentEvent } from '../../types';

function event(overrides: Partial<WorkshopIncidentEvent> = {}): WorkshopIncidentEvent {
  return {
    id: 1,
    event_type: 'INCIDENT_CREATED',
    payload: null,
    created_at: '2024-01-01T00:00:00Z',
    first_name: 'Alice',
    last_name: 'Martin',
    badge_number: 'B001',
    role: 'OPERATOR',
    ...overrides,
  };
}

describe('formatEventActor', () => {
  it('retourne "Systeme" si pas de prénom', () => {
    expect(formatEventActor(event({ first_name: null }))).toBe('Systeme');
  });

  it('concatène prénom nom', () => {
    expect(formatEventActor(event({ first_name: 'Alice', last_name: 'Martin', role: null }))).toBe('Alice Martin');
  });

  it('ajoute le rôle si présent', () => {
    const result = formatEventActor(event({ first_name: 'Bob', last_name: 'Smith', role: 'MAINTENANCE' }));
    expect(result).toContain('Bob Smith');
    expect(result).toContain('MAINTENANCE');
  });
});

describe('formatEventDetail', () => {
  it('retourne "" si payload null', () => {
    expect(formatEventDetail(event({ payload: null }))).toBe('');
  });

  it('PRIORITY_CHANGED avec value=true → "Urgent"', () => {
    expect(formatEventDetail(event({ event_type: 'PRIORITY_CHANGED', payload: { value: true } }))).toBe('Urgent');
  });

  it('PRIORITY_CHANGED avec value=false → "Normal"', () => {
    expect(formatEventDetail(event({ event_type: 'PRIORITY_CHANGED', payload: { value: false } }))).toBe('Normal');
  });

  it('PRIORITY_CHANGED avec to=true (nouveau format) → "Urgent"', () => {
    expect(formatEventDetail(event({ event_type: 'PRIORITY_CHANGED', payload: { to: true } }))).toBe('Urgent');
  });

  it('ORDER_CHANGED → "position X → Y"', () => {
    const result = formatEventDetail(event({ event_type: 'ORDER_CHANGED', payload: { from: 2, to: 5 } }));
    expect(result).toBe('position 2 → 5');
  });

  it('INCIDENT_UPDATED avec fields → liste des champs', () => {
    const result = formatEventDetail(event({ event_type: 'INCIDENT_UPDATED', payload: { fields: ['comment', 'state'] } }));
    expect(result).toBe('champs: comment, state');
  });

  it('RESPONSIBLE_COMMENT_UPDATED → texte fixe', () => {
    expect(formatEventDetail(event({ event_type: 'RESPONSIBLE_COMMENT_UPDATED', payload: {} }))).toBe('consigne mise à jour');
  });

  it('INCIDENT_INVALIDATED avec reason', () => {
    const result = formatEventDetail(event({ event_type: 'INCIDENT_INVALIDATED', payload: { reason: 'Fausse alarme' } }));
    expect(result).toBe('Fausse alarme');
  });

  it('INCIDENT_SET_PENDING avec diagnostic tronqué à 60 chars', () => {
    const long = 'A'.repeat(80);
    const result = formatEventDetail(event({ event_type: 'INCIDENT_SET_PENDING', payload: { diagnostic: long } }));
    expect(result).toBe(`diagnostic: ${'A'.repeat(60)}`);
  });

  it('INCIDENT_CLOSED avec interventionNote', () => {
    const result = formatEventDetail(event({ event_type: 'INCIDENT_CLOSED', payload: { interventionNote: 'Réparé' } }));
    expect(result).toBe('note: Réparé');
  });

  it('DELETE_REQUESTED avec reason', () => {
    const result = formatEventDetail(event({ event_type: 'DELETE_REQUESTED', payload: { reason: 'Doublon' } }));
    expect(result).toBe('Doublon');
  });

  it('retourne "" pour type sans traitement', () => {
    expect(formatEventDetail(event({ event_type: 'INCIDENT_CREATED', payload: {} }))).toBe('');
  });
});
