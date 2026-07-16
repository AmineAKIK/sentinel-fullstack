import { describe, it, expect } from 'vitest';
import {
  formatDate,
  formatShortDate,
  formatDateTime,
  formatSeconds,
  formatElapsed,
} from '../../utils/date';

// Use a fixed ISO string that is unambiguous in fr-FR locale
// 2024-06-15T14:30:00.000Z → 15/06/2024 in fr-FR
const ISO = '2024-06-15T14:30:00.000Z';

describe('formatDate', () => {
  it('formats a date as DD/MM/YYYY', () => {
    // We cannot assume exact TZ offset in CI, so verify the format shape and month/year
    const result = formatDate(ISO);
    expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(result).toContain('2024');
  });
});

describe('formatShortDate', () => {
  it('formats a date as DD/MM (no year)', () => {
    const result = formatShortDate(ISO);
    expect(result).toMatch(/^\d{2}\/\d{2}$/);
  });
});

describe('formatDateTime', () => {
  it('contains date and time parts', () => {
    const result = formatDateTime(ISO);
    // Should at least contain the year and a colon for time
    expect(result).toContain('2024');
    expect(result).toMatch(/\d{2}:\d{2}/);
  });
});

describe('formatSeconds', () => {
  it('returns "-" for null', () => {
    expect(formatSeconds(null)).toBe('-');
  });

  it('returns "-" for 0', () => {
    expect(formatSeconds(0)).toBe('-');
  });

  it('returns "-" for negative values', () => {
    expect(formatSeconds(-60)).toBe('-');
  });

  it('converts seconds < 3600 to minutes', () => {
    // 90 seconds → 2 min (rounded)
    expect(formatSeconds(90)).toBe('2 min');
    // 3000 seconds → 50 min
    expect(formatSeconds(3000)).toBe('50 min');
  });

  it('converts seconds >= 3600 to hours', () => {
    // 3600 seconds = 60 min → 1 h
    expect(formatSeconds(3600)).toBe('1 h');
    // 7200 seconds = 120 min → 2 h
    expect(formatSeconds(7200)).toBe('2 h');
  });
});

describe('formatElapsed', () => {
  it("moins d'une heure → minutes", () => {
    const from = new Date(Date.now() - 1000 * 60 * 30).toISOString();
    expect(formatElapsed(from)).toBe('30 min');
  });

  it('quelques heures → "3 h"', () => {
    const from = new Date(Date.now() - 1000 * 3600 * 3).toISOString();
    expect(formatElapsed(from)).toBe('3 h');
  });

  it('jours pile → "2 j"', () => {
    const from = new Date(Date.now() - 1000 * 3600 * 24 * 2).toISOString();
    expect(formatElapsed(from)).toBe('2 j');
  });

  it('jours et heures → "2 j 17 h"', () => {
    const from = new Date(Date.now() - 1000 * 3600 * (24 * 2 + 17)).toISOString();
    expect(formatElapsed(from)).toBe('2 j 17 h');
  });

  it('entre deux dates explicites', () => {
    const start = '2024-01-01T08:00:00Z';
    const end = '2024-01-01T08:45:00Z';
    expect(formatElapsed(start, end)).toBe('45 min');
  });

  it('durée nulle ou négative → "—"', () => {
    const now = new Date().toISOString();
    expect(formatElapsed(now, now)).toBe('—');
  });

  it('date invalide → "—" (jamais "NaN j")', () => {
    expect(formatElapsed('pas-une-date')).toBe('—');
    expect(formatElapsed('2024-01-01T00:00:00Z', 'invalide')).toBe('—');
  });
});
