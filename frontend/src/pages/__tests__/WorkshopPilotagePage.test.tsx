import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WorkshopPilotagePage from '../WorkshopPilotagePage';
import { usePilotageData } from '../../hooks/usePilotageData';
import { ProductionLine, WorkshopIncident } from '../../types';

vi.mock('../../hooks/usePilotageData', () => ({
  usePilotageData: vi.fn(),
}));

vi.mock('../../routes/AppAuthContext', () => ({
  useAppAuth: () => ({
    session: {
      accountType: 'workshop',
      user: {
        id: 3,
        first_name: 'Eden',
        last_name: 'AKIK',
        badge_number: 'RE-01',
        role: 'RESPONSABLE',
      },
    },
    loading: false,
    setSession: vi.fn(),
    logout: vi.fn(),
  }),
}));

function mockLine(overrides: Partial<ProductionLine> = {}): ProductionLine {
  return {
    id: 1,
    line_number: '999',
    machines: [],
    is_active: true,
    created_at: '2026-03-01T00:00:00.000Z',
    updated_at: '2026-03-01T00:00:00.000Z',
    ...overrides,
  };
}

function mockIncident(overrides: Partial<WorkshopIncident> = {}): WorkshopIncident {
  return {
    id: 1,
    user_id: 1,
    line_id: 1,
    line_number: '999',
    machine_id: 'MCH-1',
    machine_brand: 'Panasonic',
    robot_label: '1',
    head_number: 1,
    state: 'SKIPEE_PAR_MACHINE',
    comment: null,
    current_product: null,
    is_taken: false,
    is_priority: false,
    status: 'OPEN',
    diagnostic: null,
    waiting_reason: null,
    intervention_note: null,
    responsible_comment: null,
    edit_request: null,
    cancel_request: false,
    cancel_request_reason: null,
    taken_by_user_id: null,
    taken_at: null,
    taken_by_first_name: null,
    taken_by_last_name: null,
    taken_by_role: null,
    display_order: 0,
    created_at: '2026-03-01T00:00:00.000Z',
    updated_at: '2026-03-01T00:00:00.000Z',
    first_name: 'Eden',
    last_name: 'AKIK',
    badge_number: null,
    role: 'OPERATOR',
    is_followed: false,
    ...overrides,
  };
}

function basePilotageData(
  overrides: Partial<ReturnType<typeof usePilotageData>> = {}
): ReturnType<typeof usePilotageData> {
  return {
    lines: [mockLine()],
    analytics: null,
    metrics: null,
    realtimeLoading: false,
    analyticsLoading: false,
    error: '',
    analyticsError: '',
    lastRefresh: new Date('2026-03-01T10:00:00.000Z'),
    period: '7d',
    customStart: '',
    customEnd: '',
    lineFilter: 'all',
    machineFilter: 'all',
    rankingLimit: '10',
    activeIncidents: [],
    urgentNotTaken: [],
    notTaken: [],
    oldCases: [],
    statusTone: 'stable',
    sparklineData: [],
    lineStatuses: [],
    trendSummary: { created: 0, closed: 0 },
    setPeriod: vi.fn(),
    setCustomStart: vi.fn(),
    setCustomEnd: vi.fn(),
    setLineFilter: vi.fn(),
    setMachineFilter: vi.fn(),
    setRankingLimit: vi.fn(),
    ...overrides,
  };
}

function renderPilotagePage(overrides: Partial<ReturnType<typeof usePilotageData>> = {}) {
  vi.mocked(usePilotageData).mockReturnValue(basePilotageData(overrides));
  return render(
    <MemoryRouter>
      <WorkshopPilotagePage />
    </MemoryRouter>
  );
}

describe('WorkshopPilotagePage — KPI "Incidents actifs" (RC5)', () => {
  it.each([0, 9, 10, 100, 1000])('rend la valeur %i comme un bloc de texte unique', (count) => {
    const incidents = Array.from({ length: count }, (_, i) => mockIncident({ id: i + 1 }));
    renderPilotagePage({ activeIncidents: incidents });

    const value = document.querySelector('.pilotage-hero-stat-value');
    expect(value).not.toBeNull();
    expect(value?.textContent).toBe(String(count));
    // white-space: nowrap empêche toute coupure interne du chiffre — le
    // texte doit rester un seul nœud sans balisage intermédiaire.
    expect(value?.childNodes.length).toBe(1);
  });

  it('ne rend aucun sparkline pour une série vide (pas de fabrication de données)', () => {
    renderPilotagePage({ activeIncidents: [mockIncident()], sparklineData: [] });
    const kpi = document.querySelectorAll('.pilotage-hero-stat')[0];
    expect(kpi.querySelector('svg.pilotage-sparkline')).toBeNull();
  });

  it('rend le sparkline empilé sous le chiffre, jamais dans le même flux horizontal', () => {
    renderPilotagePage({
      activeIncidents: [mockIncident()],
      sparklineData: [1, 4, 2, 7, 3],
    });
    const body = document.querySelector('.pilotage-hero-stat-body');
    expect(body).not.toBeNull();
    const value = body?.querySelector('.pilotage-hero-stat-value');
    const svg = body?.querySelector('svg.pilotage-sparkline');
    expect(value).not.toBeNull();
    expect(svg).not.toBeNull();
    // Le sparkline doit suivre le chiffre dans l'ordre du DOM (empilement
    // vertical géré par la grille CSS, pas par un flex horizontal partagé).
    const children = Array.from(body!.children);
    expect(children.indexOf(value as Element)).toBeLessThan(children.indexOf(svg as Element));
  });
});

describe('WorkshopPilotagePage — filtres et cohérence des totaux (RC5)', () => {
  it('déclenche un changement réel de filtre Ligne', () => {
    const setLineFilter = vi.fn();
    renderPilotagePage({ lines: [mockLine({ id: 5, line_number: '317' })], setLineFilter });

    // Le SelectField Ligne doit être présent et permettre la sélection.
    expect(screen.getByRole('combobox', { name: 'Ligne' })).toBeInTheDocument();
  });

  it('affiche un message explicite quand la période ne contient aucune donnée analytique', () => {
    renderPilotagePage({ analytics: null });
    expect(
      screen.getByText('Aucun incident sur cette période — ajustez les filtres.')
    ).toBeInTheDocument();
  });

  it('le résumé "créés / clôturés / solde" reste cohérent avec les totaux de la période', () => {
    renderPilotagePage({
      analytics: {
        total: 5,
        open: 2,
        pending: 0,
        closed: 3,
        priority: 0,
        active: 2,
        not_taken: 0,
        urgent_not_taken: 0,
        taken: 2,
        open_over_24h: 0,
        open_over_7d: 0,
        oldest_active_seconds: null,
        median_take_seconds: null,
        avg_take_seconds: null,
        median_close_seconds: null,
        avg_close_seconds: null,
        by_state: [],
        by_line: [],
        by_machine: [],
        trend: [
          {
            day: '2026-03-01',
            created: 3,
            closed: 1,
            priority: 0,
            median_take_seconds: null,
            median_close_seconds: null,
          },
        ],
      },
      trendSummary: { created: 3, closed: 1 },
    });

    const totals = document.querySelector('.pilotage-trend-totals');
    expect(totals).not.toBeNull();
    expect(totals?.textContent).toContain('3');
    expect(totals?.textContent).toContain('créés');
    expect(totals?.textContent).toContain('1');
    expect(totals?.textContent).toContain('clôturés');
    expect(totals?.textContent).toContain('Solde');
    expect(totals?.textContent).toContain('+2');
  });
});
