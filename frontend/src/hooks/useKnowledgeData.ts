import { useEffect, useState } from 'react';
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

const KNOWLEDGE_INCIDENTS_LIMIT = 300;

export function useKnowledgeData() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [incidents, setIncidents] = useState<WorkshopIncident[]>([]);
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const debouncedQuery = useDebouncedValue(query);
  const [lineFilter, setLineFilter] = useState(searchParams.get('line') || 'all');
  const [machineFilter, setMachineFilter] = useState(searchParams.get('machine') || 'all');
  const [stateFilter, setStateFilter] = useState(searchParams.get('state') || 'all');
  const [selectedId, setSelectedId] = useState('');

  useEffect(() => {
    listWorkshopLines()
      .then(setLines)
      .catch(() => setError('Impossible de charger les référentiels atelier.'));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const params = buildIncidentWorkspaceParams({
      query: debouncedQuery,
      stateFilter,
      lineFilter,
      machineFilter,
      limit: KNOWLEDGE_INCIDENTS_LIMIT,
    });

    setLoading(true);
    setError('');
    listWorkshopKnowledgeIncidents(params, controller.signal)
      .then((data) => {
        setIncidents(data);
        setSelectedId((cur) => {
          if (data.length === 0) return '';
          return data.some((i) => String(i.id) === cur) ? cur : String(data[0].id);
        });
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError('Impossible de charger la base de connaissance.');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [debouncedQuery, stateFilter, lineFilter, machineFilter]);

  useEffect(() => {
    const requestedId = searchParams.get('incident');
    if (!requestedId) return;
    if (incidents.some((i) => String(i.id) === requestedId)) {
      setSelectedId(requestedId);
      return;
    }
    const parsedId = Number(requestedId);
    if (!Number.isInteger(parsedId) || parsedId <= 0) return;
    getWorkshopKnowledgeIncident(parsedId)
      .then((incident) => {
        setIncidents((cur) => (cur.some((i) => i.id === incident.id) ? cur : [incident, ...cur]));
        setSelectedId(String(incident.id));
      })
      .catch(() => setError("Cette fiche connaissance n'est pas disponible."));
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
