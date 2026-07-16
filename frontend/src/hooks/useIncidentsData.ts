import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiResponseError } from '../api/client';
import { getIncidentMetrics, listWorkshopIncidents, listWorkshopLines } from '../api/workshop';
import { ProductionLine, WorkshopIncident, WorkshopIncidentMetrics } from '../types';
import { sortIncidents } from '../utils/incidentSort';

const DASHBOARD_REFRESH_INTERVAL_MS = 30_000;

export interface IncidentsDataState {
  lines: ProductionLine[];
  incidents: WorkshopIncident[];
  metrics: WorkshopIncidentMetrics | null;
  metricsLoading: boolean;
  loading: boolean;
  error: string;
  setIncidents: React.Dispatch<React.SetStateAction<WorkshopIncident[]>>;
  refreshMetrics: () => Promise<void>;
  refreshData: (showInitialLoader?: boolean) => Promise<void>;
  upsertIncident: (updated: WorkshopIncident) => void;
}

function dashboardErrorMessage(error: unknown): string {
  return error instanceof ApiResponseError
    ? error.message
    : 'Impossible de charger le tableau de bord.';
}

export function useIncidentsData(): IncidentsDataState {
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [incidents, setIncidents] = useState<WorkshopIncident[]>([]);
  const [metrics, setMetrics] = useState<WorkshopIncidentMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const dashboardControllerRef = useRef<AbortController | null>(null);
  const metricsControllerRef = useRef<AbortController | null>(null);

  const refreshMetrics = useCallback(async () => {
    if (dashboardControllerRef.current) return;
    metricsControllerRef.current?.abort();
    const controller = new AbortController();
    metricsControllerRef.current = controller;
    setMetricsLoading(true);
    try {
      setMetrics(await getIncidentMetrics(controller.signal));
      setError('');
    } catch (requestError) {
      if (!controller.signal.aborted) setError(dashboardErrorMessage(requestError));
    } finally {
      if (metricsControllerRef.current === controller) {
        metricsControllerRef.current = null;
        setMetricsLoading(false);
      }
    }
  }, []);

  const refreshData = useCallback(async (showInitialLoader = false) => {
    dashboardControllerRef.current?.abort();
    const activeMetricsController = metricsControllerRef.current;
    metricsControllerRef.current = null;
    activeMetricsController?.abort();
    const controller = new AbortController();
    dashboardControllerRef.current = controller;
    if (showInitialLoader) setLoading(true);
    setMetricsLoading(true);
    try {
      const [lineData, incidentData, nextMetrics] = await Promise.all([
        listWorkshopLines(controller.signal),
        listWorkshopIncidents(controller.signal),
        getIncidentMetrics(controller.signal),
      ]);
      if (controller.signal.aborted) return;
      setLines(lineData);
      setIncidents(sortIncidents(incidentData));
      setMetrics(nextMetrics);
      setError('');
    } catch (requestError) {
      if (!controller.signal.aborted) setError(dashboardErrorMessage(requestError));
    } finally {
      if (dashboardControllerRef.current === controller) {
        dashboardControllerRef.current = null;
        setLoading(false);
        setMetricsLoading(false);
      }
    }
  }, []);

  const upsertIncident = useCallback((updated: WorkshopIncident) => {
    setIncidents((prev) =>
      sortIncidents(prev.map((item) => (item.id === updated.id ? updated : item)))
    );
  }, []);

  useEffect(() => {
    void refreshData(true);
    const refreshWhenVisible = (): void => {
      if (document.visibilityState === 'visible') void refreshData();
    };
    const interval = window.setInterval(refreshWhenVisible, DASHBOARD_REFRESH_INTERVAL_MS);
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      const dashboardController = dashboardControllerRef.current;
      const metricsController = metricsControllerRef.current;
      dashboardControllerRef.current = null;
      metricsControllerRef.current = null;
      dashboardController?.abort();
      metricsController?.abort();
    };
  }, [refreshData]);

  return {
    lines,
    incidents,
    metrics,
    metricsLoading,
    loading,
    error,
    setIncidents,
    refreshMetrics,
    refreshData,
    upsertIncident,
  };
}
