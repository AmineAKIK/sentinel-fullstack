import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getIncidentMetrics,
  getWorkshopAnalytics,
  listWorkshopIncidents,
  listWorkshopLines,
} from '../api/workshop';
import {
  ProductionLine,
  WorkshopAnalytics,
  WorkshopIncident,
  WorkshopIncidentMetrics,
} from '../types';
import { isOlderThanDays } from '../utils/date';
import { buildAnalyticsParams, presetDateRange } from '../utils/workshopAnalytics';
import { HistoryPeriod } from '../utils/workshopHistory';

export type StatusTone = 'stable' | 'watch' | 'tension';
export type RankingLimit = '5' | '10' | '20' | 'all';

export type LineStatus = {
  line: ProductionLine;
  incidents: WorkshopIncident[];
  urgentNotTaken: number;
  notTaken: number;
  oldCases: number;
  tone: StatusTone;
};

export function usePilotageData() {
  const [incidents, setIncidents] = useState<WorkshopIncident[]>([]);
  const [metrics, setMetrics] = useState<WorkshopIncidentMetrics | null>(null);
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [analytics, setAnalytics] = useState<WorkshopAnalytics | null>(null);

  const [realtimeLoading, setRealtimeLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [error, setError] = useState('');
  const [analyticsError, setAnalyticsError] = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const [period, setPeriodState] = useState<HistoryPeriod>('7d');
  const initialRange = presetDateRange('7d');
  const [customStart, setCustomStartState] = useState(initialRange?.start ?? '');
  const [customEnd, setCustomEndState] = useState(initialRange?.end ?? '');
  const [lineFilter, setLineFilter] = useState('all');
  const [machineFilter, setMachineFilter] = useState('all');
  const [rankingLimit, setRankingLimit] = useState<RankingLimit>('10');
  // Distingue une transition programmatique (preset → dates recalculées) d'une
  // vraie saisie utilisateur, pour ne jamais faire régresser 'custom' vers un
  // preset lors du recalcul déclenché par un changement de période explicite.
  const applyingPresetRef = useRef(false);

  /** Choix explicite d'un preset (ou "Personnalisée") dans le sélecteur. */
  function setPeriod(next: HistoryPeriod): void {
    setPeriodState(next);
    const range = presetDateRange(next);
    if (range) {
      applyingPresetRef.current = true;
      setCustomStart(range.start);
      setCustomEnd(range.end);
      applyingPresetRef.current = false;
    }
    // Sélection explicite de "Personnalisée" : les bornes actuellement
    // affichées (dernier preset ou dernière saisie) sont conservées telles
    // quelles, aucun recalcul ni réinitialisation.
  }

  /** Modification directe d'une borne : bascule sur "Personnalisée" sauf si le
   * changement est provoqué par l'application d'un preset (voir setPeriod). */
  function setCustomStart(next: string): void {
    if (!applyingPresetRef.current && period !== 'custom') setPeriodState('custom');
    setCustomStartState(next);
  }

  function setCustomEnd(next: string): void {
    if (!applyingPresetRef.current && period !== 'custom') setPeriodState('custom');
    setCustomEndState(next);
  }

  useEffect(() => {
    let active = true;
    let refreshing = false;
    let controller: AbortController | null = null;

    async function refreshRealtime(initial = false): Promise<void> {
      if (refreshing || document.visibilityState === 'hidden') return;
      refreshing = true;
      controller = new AbortController();
      if (initial) setRealtimeLoading(true);
      try {
        const signal = controller.signal;
        if (initial) {
          const [lineData, incidentData, metricData] = await Promise.all([
            listWorkshopLines(signal),
            listWorkshopIncidents(signal),
            getIncidentMetrics(signal),
          ]);
          if (!active || signal.aborted) return;
          setLines(lineData);
          setIncidents(incidentData);
          setMetrics(metricData);
        } else {
          const [incidentData, metricData] = await Promise.all([
            listWorkshopIncidents(signal),
            getIncidentMetrics(signal),
          ]);
          if (!active || signal.aborted) return;
          setIncidents(incidentData);
          setMetrics(metricData);
        }
        setLastRefresh(new Date());
        setError('');
      } catch {
        if (active && !controller.signal.aborted) {
          setError('Impossible de charger la situation temps réel.');
        }
      } finally {
        if (active) {
          refreshing = false;
          if (initial) setRealtimeLoading(false);
        }
      }
    }

    void refreshRealtime(true);
    const refreshWhenVisible = (): void => {
      if (document.visibilityState === 'visible') void refreshRealtime();
    };
    const intervalId = window.setInterval(refreshWhenVisible, 60_000);
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, []);

  useEffect(() => {
    if (period === 'custom') {
      if (customStart && customEnd && customStart > customEnd) {
        setAnalyticsLoading(false);
        setAnalyticsError('La date de début doit être antérieure à la date de fin.');
        return undefined;
      }
      // Fenêtre maximale contractuelle du backend (ANALYTICS_MAX_WINDOW_DAYS,
      // DR-10) : vérifiée côté client pour éviter un aller-retour réseau inutile.
      if (customStart && customEnd) {
        const spanDays =
          (new Date(customEnd).getTime() - new Date(customStart).getTime()) / 86_400_000;
        if (spanDays > 366) {
          setAnalyticsLoading(false);
          setAnalyticsError('La période personnalisée est limitée à 366 jours.');
          return undefined;
        }
      }
      // Plage personnalisée incomplète (une seule borne saisie, ou aucune) :
      // pas de requête tant qu'elle ne redevient pas complète — les derniers
      // résultats valides restent affichés, sans erreur ni transition visible.
      if (Boolean(customStart) !== Boolean(customEnd)) {
        setAnalyticsLoading(false);
        setAnalyticsError('');
        return undefined;
      }
    }
    const controller = new AbortController();
    setAnalyticsLoading(true);
    setAnalyticsError('');
    void getWorkshopAnalytics(
      buildAnalyticsParams(period, customStart, customEnd, lineFilter, machineFilter),
      controller.signal
    )
      .then((analyticsData) => {
        if (!controller.signal.aborted) setAnalytics(analyticsData);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setAnalyticsError('Impossible de charger les indicateurs.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setAnalyticsLoading(false);
      });
    return () => controller.abort();
  }, [period, customStart, customEnd, lineFilter, machineFilter]);

  const activeIncidents = useMemo(
    () => incidents.filter((i) => i.status === 'OPEN' || i.status === 'PENDING'),
    [incidents]
  );

  const urgentNotTaken = useMemo(
    () => activeIncidents.filter((i) => i.is_priority && !i.is_taken),
    [activeIncidents]
  );

  const notTaken = useMemo(() => activeIncidents.filter((i) => !i.is_taken), [activeIncidents]);

  const oldCases = useMemo(
    () => activeIncidents.filter((i) => isOlderThanDays(i.created_at, 7)),
    [activeIncidents]
  );

  const statusTone: StatusTone =
    urgentNotTaken.length > 0 || oldCases.length > 0
      ? 'tension'
      : notTaken.length > 0 || activeIncidents.length > 0
        ? 'watch'
        : 'stable';

  const sparklineData = useMemo(() => {
    const trend = analytics?.trend ?? [];
    if (trend.length < 2) return [];
    return trend.slice(-7).map((d) => d.created);
  }, [analytics]);

  const lineStatuses = useMemo((): LineStatus[] => {
    return lines
      .map((line) => {
        const li = activeIncidents.filter((i) => i.line_id === line.id);
        const unt = li.filter((i) => i.is_priority && !i.is_taken).length;
        const nt = li.filter((i) => !i.is_taken).length;
        const old = li.filter((i) => isOlderThanDays(i.created_at, 7)).length;
        const tone: StatusTone = unt > 0 || old > 0 ? 'tension' : nt > 0 ? 'watch' : 'stable';
        return { line, incidents: li, urgentNotTaken: unt, notTaken: nt, oldCases: old, tone };
      })
      .filter((ls) => ls.incidents.length > 0)
      .sort((a, b) => {
        const order = { tension: 0, watch: 1, stable: 2 };
        return order[a.tone] - order[b.tone] || b.incidents.length - a.incidents.length;
      });
  }, [lines, activeIncidents]);

  const trendSummary = useMemo(() => {
    const trend = analytics?.trend ?? [];
    return {
      created: trend.reduce((s, d) => s + d.created, 0),
      closed: trend.reduce((s, d) => s + d.closed, 0),
    };
  }, [analytics]);

  return {
    lines,
    analytics,
    metrics,
    realtimeLoading,
    analyticsLoading,
    error,
    analyticsError,
    lastRefresh,
    period,
    customStart,
    customEnd,
    lineFilter,
    machineFilter,
    rankingLimit,
    activeIncidents,
    urgentNotTaken,
    notTaken,
    oldCases,
    statusTone,
    sparklineData,
    lineStatuses,
    trendSummary,
    setPeriod,
    setCustomStart,
    setCustomEnd,
    setLineFilter: (v: string) => {
      setLineFilter(v);
      setMachineFilter('all');
    },
    setMachineFilter,
    setRankingLimit,
  };
}
