import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getWorkshopHistoryIncident,
  listIncidentEvents,
  listWorkshopHistoryIncidents,
  listWorkshopLines,
} from '../api/workshop';
import { ProductionLine, WorkshopIncident, WorkshopIncidentEvent } from '../types';
import {
  buildIncidentWorkspaceParams,
  withWorkshopLineFilter,
  withWorkshopUrlFilter,
} from '../utils/workshopFilters';
import { useDebouncedValue } from './useDebouncedValue';

export type HistoryStatusFilter =
  | 'all'
  | 'OPEN'
  | 'PENDING'
  | 'CLOSED'
  | 'CANCELED'
  | 'INVALIDATED';

export function readHistoryStatusFilter(value: string | null): HistoryStatusFilter {
  return value === 'OPEN' ||
    value === 'PENDING' ||
    value === 'CLOSED' ||
    value === 'CANCELED' ||
    value === 'INVALIDATED'
    ? value
    : 'all';
}

export function useHistoryData() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [incidents, setIncidents] = useState<WorkshopIncident[]>([]);
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [events, setEvents] = useState<WorkshopIncidentEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [highlightedEventId, setHighlightedEventId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const debouncedQuery = useDebouncedValue(query);
  const [statusFilter, setStatusFilter] = useState<HistoryStatusFilter>(
    readHistoryStatusFilter(searchParams.get('status'))
  );
  const [lineFilter, setLineFilter] = useState(searchParams.get('line') ?? 'all');
  const [machineFilter, setMachineFilter] = useState(searchParams.get('machine') ?? 'all');
  const [stateFilter, setStateFilter] = useState(searchParams.get('state') ?? 'all');

  const incidentDetailRef = useRef<HTMLDivElement | null>(null);
  const activeItemRef = useRef<HTMLButtonElement | null>(null);
  const isMobileRef = useRef(false);

  useEffect(() => {
    isMobileRef.current = window.matchMedia('(max-width: 820px)').matches;
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const timer = window.setTimeout(() => {
      activeItemRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [selectedId]);

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

  useEffect(() => {
    const controller = new AbortController();
    const params = buildIncidentWorkspaceParams({
      query: debouncedQuery,
      statusFilter,
      stateFilter,
      lineFilter,
      machineFilter,
      limit: 250,
    });
    setLoading(true);
    setError('');
    void listWorkshopHistoryIncidents(params, controller.signal)
      .then((incidentData) => {
        if (controller.signal.aborted) return;
        setIncidents(incidentData);
        setSelectedId((currentId) => {
          if (incidentData.length === 0) return '';
          return incidentData.some((inc) => String(inc.id) === currentId)
            ? currentId
            : String(incidentData[0].id);
        });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setError("Impossible de charger l'historique atelier.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [debouncedQuery, statusFilter, stateFilter, lineFilter, machineFilter]);

  useEffect(() => {
    const requestedId = searchParams.get('incident');
    if (!requestedId) return undefined;
    const requestedEventId = searchParams.get('event');
    const parsedEventId = requestedEventId ? Number(requestedEventId) : NaN;
    if (Number.isInteger(parsedEventId) && parsedEventId > 0) {
      setHighlightedEventId(parsedEventId);
    }
    if (incidents.some((incident) => String(incident.id) === requestedId)) {
      setSelectedId(requestedId);
      return undefined;
    }
    const parsedId = Number(requestedId);
    if (!Number.isInteger(parsedId) || parsedId <= 0) return undefined;

    const controller = new AbortController();
    void getWorkshopHistoryIncident(parsedId, controller.signal)
      .then((incident) => {
        if (controller.signal.aborted) return;
        setIncidents((current) =>
          current.some((item) => item.id === incident.id) ? current : [incident, ...current]
        );
        setSelectedId(String(incident.id));
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("Impossible de charger l'incident demandé.");
      });
    return () => controller.abort();
  }, [searchParams, incidents]);

  useEffect(() => {
    if (!selectedId) {
      setEvents([]);
      return undefined;
    }
    const controller = new AbortController();
    setEventsLoading(true);
    void listIncidentEvents(Number(selectedId), controller.signal)
      .then((eventData) => {
        if (!controller.signal.aborted) setEvents(eventData);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setEvents([]);
          setError("Impossible de charger les événements de l'incident.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setEventsLoading(false);
      });
    return () => controller.abort();
  }, [selectedId]);

  function updateSearchFilter(name: string, value: string, fallback = 'all'): void {
    setSearchParams(withWorkshopUrlFilter(searchParams, name, value, fallback));
  }

  function updateLineFilter(value: string): void {
    setLineFilter(value);
    setMachineFilter('all');
    setSearchParams(withWorkshopLineFilter(searchParams, value));
  }

  const selectIncident = useCallback(
    (id: number, eventId?: number): void => {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set('incident', String(id));
      setSearchParams(nextParams);
      setSelectedId(String(id));
      setHighlightedEventId(eventId ?? null);
      if (isMobileRef.current) {
        window.setTimeout(() => {
          incidentDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 80);
      }
    },
    [searchParams, setSearchParams]
  );

  function clearFilters(): void {
    setQuery('');
    setStatusFilter('all');
    setLineFilter('all');
    setMachineFilter('all');
    setStateFilter('all');
    const nextParams = new URLSearchParams();
    if (selectedId) nextParams.set('incident', selectedId);
    setSearchParams(nextParams);
  }

  const selectedIncident = incidents.find((inc) => String(inc.id) === selectedId);

  return {
    incidents,
    lines,
    selectedId,
    selectedIncident,
    events,
    loading,
    eventsLoading,
    highlightedEventId,
    error,
    query,
    statusFilter,
    lineFilter,
    machineFilter,
    stateFilter,
    incidentDetailRef,
    activeItemRef,
    setQuery,
    setStatusFilter,
    setMachineFilter,
    setStateFilter,
    updateSearchFilter,
    updateLineFilter,
    selectIncident,
    clearFilters,
  };
}
