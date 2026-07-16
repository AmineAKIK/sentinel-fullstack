import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAnalyticsParams } from '../workshopAnalytics';

describe('buildAnalyticsParams', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-16T10:30:00.000Z'));
  });

  afterEach(() => vi.useRealTimers());

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

  it('uses inclusive local-day boundaries for a custom interval', () => {
    expect(buildAnalyticsParams('custom', '2026-07-01', '2026-07-02', 'all', 'all')).toEqual({
      start: new Date('2026-07-01').toISOString(),
      end: new Date('2026-07-02T23:59:59.999').toISOString(),
    });
  });

  it('omits absent custom dates and all-value filters', () => {
    expect(buildAnalyticsParams('custom', '', '', 'all', 'all')).toEqual({});
  });
});
