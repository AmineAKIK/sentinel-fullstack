import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getWorkshopHistoryIncident,
  listIncidentEvents,
  listWorkshopHistoryEvents,
  listWorkshopHistoryIncidents,
  listWorkshopLines,
} from '../api/workshop';
import { ProductionLine, WorkshopHistoryEvent, WorkshopIncident, WorkshopIncidentEvent } from '../types';
import { EVENT_LABELS, formatEventActor } from '../utils/workshopHistory';
import { buildIncidentWorkspaceParams, withWorkshopLineFilter, withWorkshopUrlFilter } from '../utils/workshopFilters';

export type HistoryStatusFilter = 'all' | 'OPEN' | 'PENDING' | 'CLOSED' | 'CANCELED' | 'INVALIDATED';
export type SortCol = 'date' | 'action' | 'incident' | 'actor';
export type SortDir = 'asc' | 'desc';

const HISTORY_EVENTS_LIMIT = 80;

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
  const [historyEvents, setHistoryEvents] = useState<WorkshopHistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [historyEventsLoading, setHistoryEventsLoading] = useState(true);
  const [highlightedEventId, setHighlightedEventId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [statusFilter, setStatusFilter] = useState<HistoryStatusFilter>(
    readHistoryStatusFilter(searchParams.get('status'))
  );
  const [lineFilter, setLineFilter] = useState(searchParams.get('line') ?? 'all');
  const [machineFilter, setMachineFilter] = useState(searchParams.get('machine') ?? 'all');
  const [stateFilter, setStateFilter] = useState(searchParams.get('state') ?? 'all');
  const [eventTypeFilter, setEventTypeFilter] = useState(searchParams.get('event') ?? 'all');
  const [sortCol, setSortCol] = useState<SortCol>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const incidentDetailRef = useRef<HTMLDivElement | null>(null);
  const activeItemRef = useRef<HTMLButtonElement | null>(null);
  const isMobileRef = useRef(false);

  useEffect(() => {
    isMobileRef.current = window.matchMedia('(max-width: 820px)').matches;
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    window.setTimeout(() => {
      activeItemRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 80);
  }, [selectedId]);

  useEffect(() => {
    listWorkshopLines()
      .then(setLines)
      .catch(() => setError('Impossible de charger les référentiels atelier.'));
  }, []);

  useEffect(() => {
    const params = buildIncidentWorkspaceParams({
      query,
      statusFilter,
      stateFilter,
      lineFilter,
      machineFilter,
      limit: 250,
    });
    setLoading(true);
    setError('');
    listWorkshopHistoryIncidents(params)
      .then((incidentData) => {
        setIncidents(incidentData);
        setSelectedId((currentId) => {
          if (incidentData.length === 0) return '';
          return incidentData.some((inc) => String(inc.id) === currentId)
            ? currentId
            : String(incidentData[0].id);
        });
      })
      .catch(() => setError("Impossible de charger l'historique atelier."))
      .finally(() => setLoading(false));
  }, [query, statusFilter, stateFilter, lineFilter, machineFilter]);

  useEffect(() => {
    const requestedId = searchParams.get('incident');
    if (!requestedId) return;
    setIncidents((current) => {
      if (current.some((inc) => String(inc.id) === requestedId)) {
        setSelectedId(requestedId);
        return current;
      }
      const parsedId = Number(requestedId);
      if (!Number.isInteger(parsedId) || parsedId <= 0) return current;
      getWorkshopHistoryIncident(parsedId)
        .then((incident) => {
          setIncidents((prev) => (prev.some((i) => i.id === incident.id) ? prev : [incident, ...prev]));
          setSelectedId(String(incident.id));
        })
        .catch(() => setError("Impossible de charger l'incident demandé."));
      return current;
    });
  }, [searchParams]);

  useEffect(() => {
    const params = buildIncidentWorkspaceParams({
      query,
      statusFilter,
      stateFilter,
      lineFilter,
      machineFilter,
      eventTypeFilter,
      limit: HISTORY_EVENTS_LIMIT,
    });
    setHistoryEventsLoading(true);
    listWorkshopHistoryEvents(params)
      .then(setHistoryEvents)
      .catch(() => setHistoryEvents([]))
      .finally(() => setHistoryEventsLoading(false));
  }, [query, statusFilter, stateFilter, lineFilter, machineFilter, eventTypeFilter]);

  useEffect(() => {
    if (!selectedId) {
      setEvents([]);
      return;
    }
    setEventsLoading(true);
    listIncidentEvents(Number(selectedId))
      .then(setEvents)
      .catch(() => setEvents([]))
      .finally(() => setEventsLoading(false));
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
    if (eventTypeFilter !== 'all') nextParams.set('event', eventTypeFilter);
    setSearchParams(nextParams);
  }

  function handleSort(col: SortCol): void {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir(col === 'date' ? 'desc' : 'asc');
    }
  }

  const sortedEvents = useMemo(() => {
    const copy = [...historyEvents];
    const dir = sortDir === 'asc' ? 1 : -1;
    copy.sort((a, b) => {
      switch (sortCol) {
        case 'date':
          return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        case 'action':
          return (
            dir *
            (EVENT_LABELS[a.event_type] ?? a.event_type).localeCompare(
              EVENT_LABELS[b.event_type] ?? b.event_type,
              'fr'
            )
          );
        case 'incident':
          return (
            dir *
            `${a.line_number}${a.machine_id}`.localeCompare(`${b.line_number}${b.machine_id}`, 'fr')
          );
        case 'actor':
          return dir * formatEventActor(a).localeCompare(formatEventActor(b), 'fr');
        default:
          return 0;
      }
    });
    return copy;
  }, [historyEvents, sortCol, sortDir]);

  const selectedIncident = incidents.find((inc) => String(inc.id) === selectedId);

  return {
    incidents,
    lines,
    selectedId,
    selectedIncident,
    events,
    historyEvents,
    sortedEvents,
    loading,
    eventsLoading,
    historyEventsLoading,
    highlightedEventId,
    error,
    query,
    statusFilter,
    lineFilter,
    machineFilter,
    stateFilter,
    eventTypeFilter,
    sortCol,
    sortDir,
    incidentDetailRef,
    activeItemRef,
    historyEventsLimit: HISTORY_EVENTS_LIMIT,
    setQuery,
    setStatusFilter,
    setMachineFilter,
    setStateFilter,
    setEventTypeFilter,
    updateSearchFilter,
    updateLineFilter,
    selectIncident,
    clearFilters,
    handleSort,
  };
}
