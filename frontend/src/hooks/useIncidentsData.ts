import { useCallback, useEffect, useState } from 'react';
import { getIncidentMetrics, listWorkshopIncidents, listWorkshopLines } from '../api/workshop';
import { ProductionLine, WorkshopIncident, WorkshopIncidentMetrics } from '../types';
import { sortIncidents } from '../utils/incidentSort';

export interface IncidentsDataState {
  lines: ProductionLine[];
  incidents: WorkshopIncident[];
  metrics: WorkshopIncidentMetrics | null;
  metricsLoading: boolean;
  loading: boolean;
  error: string;
  setIncidents: React.Dispatch<React.SetStateAction<WorkshopIncident[]>>;
  refreshMetrics: () => Promise<void>;
  upsertIncident: (updated: WorkshopIncident) => void;
}

export function useIncidentsData(): IncidentsDataState {
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [incidents, setIncidents] = useState<WorkshopIncident[]>([]);
  const [metrics, setMetrics] = useState<WorkshopIncidentMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refreshMetrics = useCallback(async () => {
    setMetricsLoading(true);
    try {
      const nextMetrics = await getIncidentMetrics();
      setMetrics(nextMetrics);
    } catch {
      setMetrics(null);
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  const upsertIncident = useCallback((updated: WorkshopIncident) => {
    setIncidents((prev) =>
      sortIncidents(prev.map((item) => (item.id === updated.id ? updated : item)))
    );
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([listWorkshopLines(), listWorkshopIncidents()])
      .then(([lineData, incidentData]) => {
        setLines(lineData);
        setIncidents(sortIncidents(incidentData));
      })
      .catch(() => setError('Impossible de charger le tableau de bord.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void refreshMetrics();
  }, [refreshMetrics]);

  return {
    lines,
    incidents,
    metrics,
    metricsLoading,
    loading,
    error,
    setIncidents,
    refreshMetrics,
    upsertIncident,
  };
}
