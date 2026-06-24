import { describe, it, expect } from 'vitest';
import { formatIncidentDuration } from '../durationFormat';

describe('formatIncidentDuration', () => {
  it('sans startIso → "—"', () => {
    expect(formatIncidentDuration(undefined, undefined, 'OPEN')).toBe('—');
  });

  it('statut OPEN (non terminal) → "En cours"', () => {
    expect(formatIncidentDuration('2024-01-01T00:00:00Z', undefined, 'OPEN')).toBe('En cours');
  });

  it('statut CLOSED sans endIso → "—"', () => {
    expect(formatIncidentDuration('2024-01-01T00:00:00Z', undefined, 'CLOSED')).toBe('—');
  });

  it('statut CLOSED avec startIso + endIso → durée formatée', () => {
    const start = '2024-01-01T08:00:00Z';
    const end = '2024-01-01T09:00:00Z';
    expect(formatIncidentDuration(start, end, 'CLOSED')).toBe('1 h');
  });

  it('statut CANCELED → durée', () => {
    const start = '2024-01-01T08:00:00Z';
    const end = '2024-01-01T08:20:00Z';
    expect(formatIncidentDuration(start, end, 'CANCELED')).toBe('20 min');
  });

  it('statut INVALIDATED → durée', () => {
    const start = '2024-01-01T08:00:00Z';
    const end = '2024-01-01T10:30:00Z';
    expect(formatIncidentDuration(start, end, 'INVALIDATED')).toBe('2 h');
  });
});
