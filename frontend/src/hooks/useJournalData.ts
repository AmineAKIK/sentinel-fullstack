import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { listWorkshopHistoryEvents, listWorkshopLines } from '../api/workshop';
import { ProductionLine, WorkshopHistoryEvent } from '../types';
import { EVENT_LABELS, formatEventActor } from '../utils/workshopHistory';
import {
  buildIncidentWorkspaceParams,
  withWorkshopLineFilter,
  withWorkshopUrlFilter,
} from '../utils/workshopFilters';
import { readHistoryStatusFilter, HistoryStatusFilter } from './useHistoryData';
import { useDebouncedValue } from './useDebouncedValue';

export type SortCol = 'date' | 'action' | 'incident' | 'actor';
export type SortDir = 'asc' | 'desc';

const JOURNAL_EVENTS_LIMIT = 80;

export function useJournalData() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [historyEvents, setHistoryEvents] = useState<WorkshopHistoryEvent[]>([]);
  const [historyEventsLoading, setHistoryEventsLoading] = useState(true);
  const [error, setError] = useState('');

  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const debouncedQuery = useDebouncedValue(query);
  const [statusFilter, setStatusFilter] = useState<HistoryStatusFilter>(
    readHistoryStatusFilter(searchParams.get('status'))
  );
  const [lineFilter, setLineFilter] = useState(searchParams.get('line') ?? 'all');
  const [machineFilter, setMachineFilter] = useState(searchParams.get('machine') ?? 'all');
  const [stateFilter, setStateFilter] = useState(searchParams.get('state') ?? 'all');
  const [eventTypeFilter, setEventTypeFilter] = useState(searchParams.get('event') ?? 'all');
  const [sortCol, setSortCol] = useState<SortCol>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

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
      eventTypeFilter,
      limit: JOURNAL_EVENTS_LIMIT,
    });
    setHistoryEventsLoading(true);
    setError('');
    void listWorkshopHistoryEvents(params, controller.signal)
      .then((eventData) => {
        if (!controller.signal.aborted) setHistoryEvents(eventData);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setError('Impossible de charger le journal atelier.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setHistoryEventsLoading(false);
      });
    return () => controller.abort();
  }, [debouncedQuery, statusFilter, stateFilter, lineFilter, machineFilter, eventTypeFilter]);

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
    setStatusFilter('all');
    setLineFilter('all');
    setMachineFilter('all');
    setStateFilter('all');
    setEventTypeFilter('all');
    setSearchParams(new URLSearchParams());
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

  return {
    lines,
    historyEvents,
    sortedEvents,
    historyEventsLoading,
    error,
    query,
    statusFilter,
    lineFilter,
    machineFilter,
    stateFilter,
    eventTypeFilter,
    sortCol,
    sortDir,
    historyEventsLimit: JOURNAL_EVENTS_LIMIT,
    setQuery,
    setStatusFilter,
    setMachineFilter,
    setStateFilter,
    setEventTypeFilter,
    updateSearchFilter,
    updateLineFilter,
    clearFilters,
    handleSort,
  };
}
