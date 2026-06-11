import { describe, it, expect, vi } from 'vitest';
import {
  buildIncidentWorkspaceParams,
  withWorkshopUrlFilter,
  withWorkshopLineFilter,
  getWorkshopMachineOptions,
  searchFilterChip,
  lineFilterChip,
  machineFilterChip,
  stateFilterChip,
} from '../../utils/workshopFilters';
import type { ProductionLine } from '../../types';

// ─── fixtures ─────────────────────────────────────────────────────────────────

const lines: ProductionLine[] = [
  {
    id: 1,
    line_number: 'L01',
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    machines: [
      {
        machineId: 'M01',
        brand: 'Fanuc',
        hasDoubleRobot: false,
        robotNumber: 'R1',
        robotHeads: 2,
      },
      {
        machineId: 'M02',
        brand: 'KUKA',
        hasDoubleRobot: false,
        robotNumber: 'R2',
        robotHeads: 3,
      },
    ],
  },
];

// ─── getWorkshopMachineOptions ────────────────────────────────────────────────

describe('getWorkshopMachineOptions', () => {
  it('returns machine options for a matching line', () => {
    const options = getWorkshopMachineOptions(lines, '1');
    expect(options).toHaveLength(2);
    expect(options[0]).toMatchObject({ id: 'M01', label: 'M01' });
    expect(options[1]).toMatchObject({ id: 'M02', label: 'M02' });
  });

  it('returns empty array when lineFilter does not match any line', () => {
    expect(getWorkshopMachineOptions(lines, '99')).toHaveLength(0);
  });

  it('returns empty array when lines list is empty', () => {
    expect(getWorkshopMachineOptions([], '1')).toHaveLength(0);
  });
});

// ─── withWorkshopUrlFilter ────────────────────────────────────────────────────

describe('withWorkshopUrlFilter', () => {
  it('sets a param value', () => {
    const base = new URLSearchParams();
    const result = withWorkshopUrlFilter(base, 'status', 'OPEN');
    expect(result.get('status')).toBe('OPEN');
  });

  it('removes the param when value equals the fallback', () => {
    const base = new URLSearchParams('status=OPEN');
    const result = withWorkshopUrlFilter(base, 'status', 'all');
    expect(result.has('status')).toBe(false);
  });

  it('removes the param when value is empty', () => {
    const base = new URLSearchParams('status=OPEN');
    const result = withWorkshopUrlFilter(base, 'status', '');
    expect(result.has('status')).toBe(false);
  });

  it('does not mutate the original URLSearchParams', () => {
    const base = new URLSearchParams('status=OPEN');
    withWorkshopUrlFilter(base, 'status', 'CLOSED');
    expect(base.get('status')).toBe('OPEN');
  });
});

// ─── withWorkshopLineFilter ───────────────────────────────────────────────────

describe('withWorkshopLineFilter', () => {
  it('sets the line param and removes machine', () => {
    const base = new URLSearchParams('line=1&machine=M01');
    const result = withWorkshopLineFilter(base, '2');
    expect(result.get('line')).toBe('2');
    expect(result.has('machine')).toBe(false);
  });

  it('removes line param when value is "all"', () => {
    const base = new URLSearchParams('line=1');
    const result = withWorkshopLineFilter(base, 'all');
    expect(result.has('line')).toBe(false);
  });
});

// ─── buildIncidentWorkspaceParams ────────────────────────────────────────────

describe('buildIncidentWorkspaceParams', () => {
  const baseFilters = {
    query: '',
    limit: 100,
    stateFilter: 'all',
    lineFilter: 'all',
    machineFilter: 'all',
  };

  it('returns only limit when all filters are "all" and query is empty', () => {
    const result = buildIncidentWorkspaceParams(baseFilters);
    expect(result).toEqual({ limit: 100 });
  });

  it('includes q when query is non-empty', () => {
    const result = buildIncidentWorkspaceParams({ ...baseFilters, query: '  robot  ' });
    expect(result.q).toBe('robot');
  });

  it('excludes q for whitespace-only query', () => {
    const result = buildIncidentWorkspaceParams({ ...baseFilters, query: '   ' });
    expect(result.q).toBeUndefined();
  });

  it('includes status when statusFilter is not "all"', () => {
    const result = buildIncidentWorkspaceParams({ ...baseFilters, statusFilter: 'OPEN' });
    expect(result.status).toBe('OPEN');
  });

  it('excludes status when statusFilter is "all"', () => {
    const result = buildIncidentWorkspaceParams({ ...baseFilters, statusFilter: 'all' });
    expect(result.status).toBeUndefined();
  });

  it('includes lineId as number when lineFilter is not "all"', () => {
    const result = buildIncidentWorkspaceParams({ ...baseFilters, lineFilter: '3' });
    expect(result.lineId).toBe(3);
  });

  it('includes machineId when machineFilter is not "all"', () => {
    const result = buildIncidentWorkspaceParams({ ...baseFilters, machineFilter: 'M01' });
    expect(result.machineId).toBe('M01');
  });

  it('includes state when stateFilter is not "all"', () => {
    const result = buildIncidentWorkspaceParams({ ...baseFilters, stateFilter: 'DEGRADEE' });
    expect(result.state).toBe('DEGRADEE');
  });
});

// ─── filter chip helpers ──────────────────────────────────────────────────────

describe('searchFilterChip', () => {
  it('returns a chip when query is non-empty', () => {
    const noop = vi.fn();
    const chips = searchFilterChip('robot', noop);
    expect(chips).toHaveLength(1);
    expect(chips[0].label).toContain('robot');
    expect(chips[0].key).toBe('search');
  });

  it('returns empty array for whitespace query', () => {
    expect(searchFilterChip('  ', vi.fn())).toHaveLength(0);
  });

  it('returns empty array for empty query', () => {
    expect(searchFilterChip('', vi.fn())).toHaveLength(0);
  });
});

describe('lineFilterChip', () => {
  it('returns a chip with the line number label', () => {
    const noop = vi.fn();
    const chips = lineFilterChip(lines, '1', noop);
    expect(chips).toHaveLength(1);
    expect(chips[0].label).toContain('L01');
  });

  it('returns empty array when lineFilter is "all"', () => {
    expect(lineFilterChip(lines, 'all', vi.fn())).toHaveLength(0);
  });
});

describe('machineFilterChip', () => {
  it('returns a chip with the machine id', () => {
    const chips = machineFilterChip('M01', vi.fn());
    expect(chips).toHaveLength(1);
    expect(chips[0].label).toContain('M01');
  });

  it('returns empty array when machineFilter is "all"', () => {
    expect(machineFilterChip('all', vi.fn())).toHaveLength(0);
  });
});

describe('stateFilterChip', () => {
  it('returns a chip with the french state label', () => {
    const chips = stateFilterChip('DEGRADEE', vi.fn());
    expect(chips).toHaveLength(1);
    expect(chips[0].label).toContain('Dégradée');
  });

  it('returns empty array when stateFilter is "all"', () => {
    expect(stateFilterChip('all', vi.fn())).toHaveLength(0);
  });
});
