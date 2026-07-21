import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getWorkshopKnowledgeIncident,
  listWorkshopKnowledgeIncidents,
  listWorkshopLines,
} from '../api/workshop';
import { ProductionLine, WorkshopIncident } from '../types';
import {
  buildIncidentWorkspaceParams,
  withWorkshopLineFilter,
  withWorkshopUrlFilter,
} from '../utils/workshopFilters';
import { useDebouncedValue } from './useDebouncedValue';

// Taille de page, pas plafond total : LIST-02 remplace la limite fixe par
// une pagination par curseur (lot 7C).
const KNOWLEDGE_INCIDENTS_PAGE_SIZE = 300;

export function useKnowledgeData() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [incidents, setIncidents] = useState<WorkshopIncident[]>([]);
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const debouncedQuery = useDebouncedValue(query);
  const [lineFilter, setLineFilter] = useState(searchParams.get('line') || 'all');
  const [machineFilter, setMachineFilter] = useState(searchParams.get('machine') || 'all');
  const [stateFilter, setStateFilter] = useState(searchParams.get('state') || 'all');
  const [selectedId, setSelectedId] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void listWorkshopLines(controller.signal)
      .then(setLines)
      .catch(() => {
        if (!controller.signal.aborted) {
          setError('Impossible de charger les référentiels atelier.');
        }
      });
    return () => controller.abort();
  }, []);

  const baseParams = useMemo(
    () => ({
      query: debouncedQuery,
      stateFilter,
      lineFilter,
      machineFilter,
      limit: KNOWLEDGE_INCIDENTS_PAGE_SIZE,
    }),
    [debouncedQuery, stateFilter, lineFilter, machineFilter]
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void listWorkshopKnowledgeIncidents(buildIncidentWorkspaceParams(baseParams), controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return;
        setIncidents(page.items);
        setNextCursor(page.nextCursor);
        setSelectedId((cur) => {
          if (page.items.length === 0) return '';
          return page.items.some((i) => String(i.id) === cur) ? cur : String(page.items[0].id);
        });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setError('Impossible de charger la base de connaissance.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [baseParams]);

  const loadMore = useCallback((): void => {
    if (!nextCursor || loadingMore) return;
    const controller = new AbortController();
    setLoadingMore(true);
    void listWorkshopKnowledgeIncidents(
      buildIncidentWorkspaceParams({ ...baseParams, cursor: nextCursor }),
      controller.signal
    )
      .then((page) => {
        if (controller.signal.aborted) return;
        setIncidents((current) => [...current, ...page.items]);
        setNextCursor(page.nextCursor);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setError('Impossible de charger la suite de la base de connaissance.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingMore(false);
      });
  }, [baseParams, nextCursor, loadingMore]);

  useEffect(() => {
    const requestedId = searchParams.get('incident');
    if (!requestedId) return undefined;
    if (incidents.some((i) => String(i.id) === requestedId)) {
      setSelectedId(requestedId);
      return undefined;
    }
    const parsedId = Number(requestedId);
    if (!Number.isInteger(parsedId) || parsedId <= 0) return undefined;
    const controller = new AbortController();
    void getWorkshopKnowledgeIncident(parsedId, controller.signal)
      .then((incident) => {
        if (controller.signal.aborted) return;
        setIncidents((cur) => (cur.some((i) => i.id === incident.id) ? cur : [incident, ...cur]));
        setSelectedId(String(incident.id));
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError("Cette fiche connaissance n'est pas disponible.");
        }
      });
    return () => controller.abort();
  }, [searchParams, incidents]);

  const machineCount = new Set(incidents.map((i) => i.machine_id)).size;
  const lastItem = incidents[0];
  const selectedIncident = incidents.find((i) => String(i.id) === selectedId);

  // Cas similaires : mêmes équipement ou anomalie que la fiche ouverte (P5).
  // Priorité aux fiches même machine, puis même type d'anomalie ; limité à 4.
  const relatedIncidents = selectedIncident
    ? incidents
        .filter(
          (i) =>
            i.id !== selectedIncident.id &&
            (i.machine_id === selectedIncident.machine_id || i.state === selectedIncident.state)
        )
        .sort((a, b) => {
          const aSame = a.machine_id === selectedIncident.machine_id ? 0 : 1;
          const bSame = b.machine_id === selectedIncident.machine_id ? 0 : 1;
          return aSame - bSame;
        })
        .slice(0, 4)
    : [];

  function selectIncident(id: number): void {
    const next = new URLSearchParams(searchParams);
    next.set('incident', String(id));
    setSearchParams(next);
    setSelectedId(String(id));
  }

  function updateSearchFilter(name: string, value: string, fallback = 'all'): void {
    setSearchParams(withWorkshopUrlFilter(searchParams, name, value, fallback));
  }

  function updateLineFilter(value: string): void {
    setLineFilter(value);
    setMachineFilter('all');
    setSearchParams(withWorkshopLineFilter(searchParams, value));
  }

  function clearFilters(): void {
    setQuery('');
    setLineFilter('all');
    setMachineFilter('all');
    setStateFilter('all');
    const next = new URLSearchParams();
    if (selectedId) next.set('incident', selectedId);
    setSearchParams(next);
  }

  return {
    incidents,
    lines,
    loading,
    loadingMore,
    hasMore: nextCursor !== null,
    loadMore,
    error,
    query,
    lineFilter,
    machineFilter,
    stateFilter,
    selectedId,
    selectedIncident,
    relatedIncidents,
    machineCount,
    lastItem,
    setQuery,
    setMachineFilter,
    setStateFilter,
    updateSearchFilter,
    updateLineFilter,
    selectIncident,
    clearFilters,
  };
}
