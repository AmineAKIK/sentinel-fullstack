import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAnalyticsParams, dayEndIso, dayStartIso } from '../workshopAnalytics';

describe('buildAnalyticsParams', () => {
  beforeEach(() => {
    vi.stubEnv('TZ', 'Europe/Paris');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-16T10:30:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('builds the current-day interval and optional filters', () => {
    const params = buildAnalyticsParams('today', '', '', '12', 'MCH-12');
    const expectedStart = new Date('2026-07-16T10:30:00.000Z');
    expectedStart.setHours(0, 0, 0, 0);

    expect(params.start).toBe(expectedStart.toISOString());
    expect(params.end).toBe('2026-07-16T10:30:00.000Z');
    expect(params.lineId).toBe(12);
    expect(params.machineId).toBe('MCH-12');
  });

  it.each([
    ['7d', '2026-07-09T10:30:00.000Z'],
    ['30d', '2026-06-16T10:30:00.000Z'],
  ] as const)('builds the %s rolling interval', (period, expectedStart) => {
    expect(buildAnalyticsParams(period, '', '', 'all', 'all')).toEqual({
      start: expectedStart,
      end: '2026-07-16T10:30:00.000Z',
    });
  });

  it('transmet à Pilotage les bornes locales inclusives d’une période personnalisée estivale', () => {
    expect(buildAnalyticsParams('custom', '2026-07-01', '2026-07-02', 'all', 'all')).toEqual({
      start: '2026-06-30T22:00:00.000Z',
      end: '2026-07-02T21:59:59.999Z',
    });
  });

  it('omits absent custom dates and all-value filters', () => {
    expect(buildAnalyticsParams('custom', '', '', 'all', 'all')).toEqual({});
  });

  it('builds an explicit 90-day rolling interval for "lifetime" (RC5)', () => {
    const expectedStart = new Date('2026-07-16T10:30:00.000Z');
    expectedStart.setDate(expectedStart.getDate() - 90);
    expect(buildAnalyticsParams('lifetime', '', '', 'all', 'all')).toEqual({
      start: expectedStart.toISOString(),
      end: '2026-07-16T10:30:00.000Z',
    });
  });
});

describe('dayStartIso / dayEndIso (réutilisés par le filtre période du Journal, ANA-03)', () => {
  beforeEach(() => {
    vi.stubEnv('TZ', 'Europe/Paris');
  });

  afterEach(() => vi.unstubAllEnvs());

  it.each([
    {
      saison: 'été',
      input: '2026-07-15',
      start: '2026-07-14T22:00:00.000Z',
      end: '2026-07-15T21:59:59.999Z',
    },
    {
      saison: 'hiver',
      input: '2026-01-15',
      start: '2026-01-14T23:00:00.000Z',
      end: '2026-01-15T22:59:59.999Z',
    },
  ])(
    'interprète le jour civil local Europe/Paris en $saison sans décalage de date',
    ({ input, start, end }) => {
      expect(dayStartIso(input)).toBe(start);
      expect(dayEndIso(input)).toBe(end);
    }
  );
});
