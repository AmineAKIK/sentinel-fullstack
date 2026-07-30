import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  getIncidentMetrics,
  getWorkshopAnalytics,
  listWorkshopIncidents,
  listWorkshopLines,
} from '../../api/workshop';
import { WorkshopAnalytics } from '../../types';
import { usePilotageData } from '../usePilotageData';

vi.mock('../../api/workshop', () => ({
  getIncidentMetrics: vi.fn(),
  getWorkshopAnalytics: vi.fn(),
  listWorkshopIncidents: vi.fn(),
  listWorkshopLines: vi.fn(),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(React.Fragment, null, children);
}

function mockAnalytics(overrides: Partial<WorkshopAnalytics> = {}): WorkshopAnalytics {
  return {
    total: 0,
    open: 0,
    pending: 0,
    closed: 0,
    priority: 0,
    active: 0,
    not_taken: 0,
    urgent_not_taken: 0,
    taken: 0,
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
    trend: [],
    ...overrides,
  };
}

describe('usePilotageData — filtre de période bidirectionnel (RC5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listWorkshopLines).mockResolvedValue([]);
    vi.mocked(listWorkshopIncidents).mockResolvedValue([]);
    vi.mocked(getIncidentMetrics).mockResolvedValue({
      total: 0,
      open: 0,
      pending: 0,
      closed: 0,
      priority: 0,
      not_taken: 0,
      open_over_7d: 0,
      line_number: null,
      machine_id: null,
    } as never);
    vi.mocked(getWorkshopAnalytics).mockResolvedValue(mockAnalytics());
  });

  async function renderPilotage() {
    const view = renderHook(() => usePilotageData(), { wrapper });
    await waitFor(() => expect(view.result.current.analyticsLoading).toBe(false));
    return view;
  }

  it('modifier customStart depuis un preset bascule automatiquement sur "custom"', async () => {
    const { result } = await renderPilotage();
    expect(result.current.period).toBe('7d');
    vi.mocked(getWorkshopAnalytics).mockClear();

    act(() => {
      result.current.setCustomStart('2026-07-01');
    });

    await waitFor(() => expect(result.current.analyticsLoading).toBe(false));
    expect(result.current.period).toBe('custom');
    expect(result.current.customStart).toBe('2026-07-01');
  });

  it('modifier customEnd depuis un preset bascule automatiquement sur "custom"', async () => {
    const { result } = await renderPilotage();
    vi.mocked(getWorkshopAnalytics).mockClear();

    act(() => {
      result.current.setCustomEnd('2026-07-10');
    });

    await waitFor(() => expect(result.current.analyticsLoading).toBe(false));
    expect(result.current.period).toBe('custom');
    expect(result.current.customEnd).toBe('2026-07-10');
  });

  it('conserve l’autre borne déjà affichée lors du passage automatique en "custom"', async () => {
    const { result } = await renderPilotage();

    act(() => {
      result.current.setCustomStart('2026-07-01');
    });
    await waitFor(() => expect(result.current.period).toBe('custom'));

    act(() => {
      result.current.setCustomEnd('2026-07-05');
    });
    await waitFor(() => expect(result.current.customEnd).toBe('2026-07-05'));

    expect(result.current.customStart).toBe('2026-07-01');
  });

  it('sélectionner explicitement "custom" conserve les bornes déjà affichées par le preset actif', async () => {
    const { result } = await renderPilotage();
    act(() => {
      result.current.setPeriod('30d');
    });
    await waitFor(() => expect(result.current.period).toBe('30d'));
    const displayedStart = result.current.customStart;
    const displayedEnd = result.current.customEnd;
    expect(displayedStart).not.toBe('');
    expect(displayedEnd).not.toBe('');

    act(() => {
      result.current.setPeriod('custom');
    });

    expect(result.current.customStart).toBe(displayedStart);
    expect(result.current.customEnd).toBe(displayedEnd);
  });

  it.each(['today', '7d', '30d', 'lifetime'] as const)(
    'le preset %s affiche des bornes effectives non vides dans customStart/customEnd',
    async (period) => {
      const { result } = await renderPilotage();
      act(() => {
        result.current.setPeriod(period);
      });
      await waitFor(() => expect(result.current.period).toBe(period));
      expect(result.current.customStart).not.toBe('');
      expect(result.current.customEnd).not.toBe('');
    }
  );

  it('un changement de preset ne déclenche qu’une seule requête analytics', async () => {
    const { result } = await renderPilotage();
    vi.mocked(getWorkshopAnalytics).mockClear();

    act(() => {
      result.current.setPeriod('30d');
    });
    await waitFor(() => expect(result.current.analyticsLoading).toBe(false));

    expect(getWorkshopAnalytics).toHaveBeenCalledTimes(1);
  });

  it('modifier une date personnalisée ne déclenche qu’une seule requête analytics (pas de double appel preset+date)', async () => {
    const { result } = await renderPilotage();
    vi.mocked(getWorkshopAnalytics).mockClear();

    act(() => {
      result.current.setCustomStart('2026-07-01');
    });
    await waitFor(() => expect(result.current.analyticsLoading).toBe(false));

    expect(getWorkshopAnalytics).toHaveBeenCalledTimes(1);
    expect(getWorkshopAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({ start: expect.any(String) }),
      expect.anything()
    );
  });

  it('un retour vers un preset depuis "custom" recalcule les bornes effectives', async () => {
    const { result } = await renderPilotage();
    act(() => {
      result.current.setCustomStart('2020-01-01');
      result.current.setCustomEnd('2020-01-05');
    });
    await waitFor(() => expect(result.current.period).toBe('custom'));
    expect(result.current.customStart).toBe('2020-01-01');

    act(() => {
      result.current.setPeriod('7d');
    });
    await waitFor(() => expect(result.current.period).toBe('7d'));

    expect(result.current.customStart).not.toBe('2020-01-01');
    expect(result.current.customEnd).not.toBe('2020-01-05');
  });

  it('une plage personnalisée incomplète (une seule borne) n’envoie pas de requête incohérente et conserve les derniers résultats', async () => {
    vi.mocked(getWorkshopAnalytics).mockResolvedValueOnce(mockAnalytics({ total: 42 }));
    const { result } = await renderPilotage();
    await waitFor(() => expect(result.current.analytics?.total).toBe(42));

    act(() => {
      result.current.setPeriod('custom');
      result.current.setCustomStart('2026-07-01');
      result.current.setCustomEnd('');
    });

    await waitFor(() => expect(result.current.analyticsLoading).toBe(false));
    expect(result.current.analytics?.total).toBe(42);
  });

  it('début postérieur à la fin affiche une erreur locale et n’envoie aucune requête', async () => {
    const { result } = await renderPilotage();
    vi.mocked(getWorkshopAnalytics).mockClear();

    act(() => {
      result.current.setPeriod('custom');
      result.current.setCustomStart('2026-07-10');
      result.current.setCustomEnd('2026-07-01');
    });

    await waitFor(() => expect(result.current.analyticsError).not.toBe(''));
    expect(getWorkshopAnalytics).not.toHaveBeenCalled();
  });

  it('aucune erreur de date autour d’un changement de mois/année pour les presets glissants', async () => {
    // Le calcul de bornes en dates réelles (buildAnalyticsParams) est déjà
    // couvert de façon déterministe dans workshopAnalytics.test.ts (horloge
    // figée). Ici on vérifie, en conditions réelles, que le hook ne produit
    // aucune erreur de date quel que soit le jour du mois/année en cours —
    // notamment aux frontières où `setDate(jour - 30)` change de mois/année.
    const { result } = await renderPilotage();
    act(() => {
      result.current.setPeriod('30d');
    });
    await waitFor(() => expect(result.current.period).toBe('30d'));
    expect(result.current.analyticsError).toBe('');
    expect(result.current.customStart).not.toBe('');
    expect(Number.isNaN(new Date(result.current.customStart).getTime())).toBe(false);
    expect(Number.isNaN(new Date(result.current.customEnd).getTime())).toBe(false);
  });
});
