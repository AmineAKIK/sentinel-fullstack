import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { listWorkshopHistoryEvents, listWorkshopLines } from '../api/workshop';
import { ProductionLine, WorkshopHistoryEvent } from '../types';
import { EVENT_LABELS, formatEventActor } from '../utils/workshopHistory';
import {
  buildIncidentWorkspaceParams,
  withWorkshopLineFilter,
  withWorkshopUrlFilter,
} from '../utils/workshopFilters';
import { dayEndIso, dayStartIso } from '../utils/workshopAnalytics';
import { readHistoryStatusFilter, HistoryStatusFilter } from './useHistoryData';
import { useDebouncedValue } from './useDebouncedValue';

export type SortCol = 'date' | 'action' | 'incident' | 'actor';
export type SortDir = 'asc' | 'desc';

// Taille de page, pas plafond total : LIST-03 remplace la limite fixe par
// une pagination par curseur (lot 7).
const JOURNAL_EVENTS_PAGE_SIZE = 80;

export function useJournalData() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [historyEvents, setHistoryEvents] = useState<WorkshopHistoryEvent[]>([]);
  const [historyEventsLoading, setHistoryEventsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState('');
  const loadMoreControllerRef = useRef<AbortController | null>(null);

  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const debouncedQuery = useDebouncedValue(query);
  const [statusFilter, setStatusFilter] = useState<HistoryStatusFilter>(
    readHistoryStatusFilter(searchParams.get('status'))
  );
  const [lineFilter, setLineFilter] = useState(searchParams.get('line') ?? 'all');
  const [machineFilter, setMachineFilter] = useState(searchParams.get('machine') ?? 'all');
  const [stateFilter, setStateFilter] = useState(searchParams.get('state') ?? 'all');
  const [eventTypeFilter, setEventTypeFilter] = useState(searchParams.get('event') ?? 'all');
  const [startFilter, setStartFilter] = useState(searchParams.get('start') ?? '');
  const [endFilter, setEndFilter] = useState(searchParams.get('end') ?? '');
  const [periodError, setPeriodError] = useState('');
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

  const baseParams = useMemo(
    () => ({
      query: debouncedQuery,
      statusFilter,
      stateFilter,
      lineFilter,
      machineFilter,
      eventTypeFilter,
      startFilter: startFilter ? dayStartIso(startFilter) : undefined,
      endFilter: endFilter ? dayEndIso(endFilter) : undefined,
      limit: JOURNAL_EVENTS_PAGE_SIZE,
    }),
    [
      debouncedQuery,
      statusFilter,
      stateFilter,
      lineFilter,
      machineFilter,
      eventTypeFilter,
      startFilter,
      endFilter,
    ]
  );

  useEffect(() => {
    // Un changement de filtre repart de la première page : le curseur d'une
    // page précédente n'a plus de sens sous un nouveau périmètre de données.
    loadMoreControllerRef.current?.abort();
    if (startFilter && endFilter && startFilter > endFilter) {
      setHistoryEventsLoading(false);
      setPeriodError('La date de début doit être antérieure à la date de fin.');
      return undefined;
    }
    setPeriodError('');

    const controller = new AbortController();
    setHistoryEventsLoading(true);
    setError('');
    void listWorkshopHistoryEvents(buildIncidentWorkspaceParams(baseParams), controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return;
        setHistoryEvents(page.items);
        setNextCursor(page.nextCursor);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setError('Impossible de charger le journal atelier.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setHistoryEventsLoading(false);
      });
    return () => controller.abort();
  }, [baseParams, startFilter, endFilter]);

  const loadMore = useCallback((): void => {
    if (!nextCursor || loadingMore) return;
    const controller = new AbortController();
    loadMoreControllerRef.current = controller;
    setLoadingMore(true);
    void listWorkshopHistoryEvents(
      buildIncidentWorkspaceParams({ ...baseParams, cursor: nextCursor }),
      controller.signal
    )
      .then((page) => {
        if (controller.signal.aborted) return;
        setHistoryEvents((current) => [...current, ...page.items]);
        setNextCursor(page.nextCursor);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setError('Impossible de charger la suite du journal atelier.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingMore(false);
      });
  }, [baseParams, nextCursor, loadingMore]);

  function updateSearchFilter(name: string, value: string, fallback = 'all'): void {
    setSearchParams(withWorkshopUrlFilter(searchParams, name, value, fallback));
  }

  function updateLineFilter(value: string): void {
    setLineFilter(value);
    setMachineFilter('all');
    setSearchParams(withWorkshopLineFilter(searchParams, value));
  }

  function updateStartFilter(value: string): void {
    setStartFilter(value);
    setSearchParams(withWorkshopUrlFilter(searchParams, 'start', value, ''));
  }

  function updateEndFilter(value: string): void {
    setEndFilter(value);
    setSearchParams(withWorkshopUrlFilter(searchParams, 'end', value, ''));
  }

  function clearFilters(): void {
    setQuery('');
    setStatusFilter('all');
    setLineFilter('all');
    setMachineFilter('all');
    setStateFilter('all');
    setEventTypeFilter('all');
    setStartFilter('');
    setEndFilter('');
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
    loadingMore,
    hasMore: nextCursor !== null,
    loadMore,
    error,
    query,
    statusFilter,
    lineFilter,
    machineFilter,
    stateFilter,
    eventTypeFilter,
    startFilter,
    endFilter,
    periodError,
    sortCol,
    sortDir,
    setQuery,
    setStatusFilter,
    setMachineFilter,
    setStateFilter,
    setEventTypeFilter,
    updateSearchFilter,
    updateLineFilter,
    updateStartFilter,
    updateEndFilter,
    clearFilters,
    handleSort,
  };
}
