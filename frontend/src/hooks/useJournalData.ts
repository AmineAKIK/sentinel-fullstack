import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { listWorkshopHistoryEvents, listWorkshopLines } from '../api/workshop';
import { ProductionLine, WorkshopHistoryEvent } from '../types';
import { formatEventActor, formatEventLabel } from '../utils/workshopHistory';
import {
  buildIncidentWorkspaceParams,
  withWorkshopLineFilter,
  withWorkshopUrlFilter,
} from '../utils/workshopFilters';
import { dayEndIso, dayStartIso, isCanonicalCivilDate } from '../utils/workshopAnalytics';
import { readHistoryStatusFilter, HistoryStatusFilter } from './useHistoryData';
import { useDebouncedValue } from './useDebouncedValue';

export type SortCol = 'date' | 'action' | 'incident' | 'actor';
export type SortDir = 'asc' | 'desc';

// Taille de page, pas plafond total : LIST-03 remplace la limite fixe par
// une pagination par curseur (lot 7).
const JOURNAL_EVENTS_PAGE_SIZE = 80;

type CanonicalJournalDates = {
  start: string;
  end: string;
  params: URLSearchParams;
  changed: boolean;
};

type JournalResultScope = {
  request: string;
};

function canonicalizeJournalDates(searchParams: URLSearchParams): CanonicalJournalDates {
  const params = new URLSearchParams(searchParams);
  const startValues = searchParams.getAll('start');
  const endValues = searchParams.getAll('end');
  let start =
    startValues.length === 1 && isCanonicalCivilDate(startValues[0]) ? startValues[0] : '';
  let end = endValues.length === 1 && isCanonicalCivilDate(endValues[0]) ? endValues[0] : '';

  if (start && end && start > end) {
    start = '';
    end = '';
  }
  if (!start) params.delete('start');
  if (!end) params.delete('end');

  return {
    start,
    end,
    params,
    changed: params.toString() !== searchParams.toString(),
  };
}

export function useJournalData() {
  const [searchParams, setSearchParams] = useSearchParams();
  const canonicalDates = useMemo(() => canonicalizeJournalDates(searchParams), [searchParams]);

  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [historyEvents, setHistoryEvents] = useState<WorkshopHistoryEvent[]>([]);
  const [historyEventsLoading, setHistoryEventsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loadedResultScope, setLoadedResultScope] = useState<JournalResultScope | null>(null);
  const loadMoreControllerRef = useRef<AbortController | null>(null);
  const requestGenerationRef = useRef(0);

  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const debouncedQuery = useDebouncedValue(query);
  const [statusFilter, setStatusFilter] = useState<HistoryStatusFilter>(
    readHistoryStatusFilter(searchParams.get('status'))
  );
  const [lineFilter, setLineFilter] = useState(searchParams.get('line') ?? 'all');
  const [machineFilter, setMachineFilter] = useState(searchParams.get('machine') ?? 'all');
  const [stateFilter, setStateFilter] = useState(searchParams.get('state') ?? 'all');
  const [eventTypeFilter, setEventTypeFilter] = useState(searchParams.get('event') ?? 'all');
  const [startFilter, setStartFilter] = useState(canonicalDates.start);
  const [endFilter, setEndFilter] = useState(canonicalDates.end);
  const [periodError, setPeriodError] = useState('');
  const [sortCol, setSortCol] = useState<SortCol>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  useEffect(() => {
    setQuery(searchParams.get('q') ?? '');
    setStatusFilter(readHistoryStatusFilter(searchParams.get('status')));
    setLineFilter(searchParams.get('line') ?? 'all');
    setMachineFilter(searchParams.get('machine') ?? 'all');
    setStateFilter(searchParams.get('state') ?? 'all');
    setEventTypeFilter(searchParams.get('event') ?? 'all');
    setStartFilter(canonicalDates.start);
    setEndFilter(canonicalDates.end);
    if (canonicalDates.changed) {
      setSearchParams(canonicalDates.params, { replace: true });
    }
  }, [canonicalDates, searchParams, setSearchParams]);

  useEffect(() => {
    const controller = new AbortController();
    void listWorkshopLines(controller.signal)
      .then((nextLines) => {
        if (!controller.signal.aborted) setLines(nextLines);
      })
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
  const requestScopeKey = useMemo(() => JSON.stringify(baseParams), [baseParams]);

  useEffect(() => {
    // Un changement de filtre repart de la première page : le curseur d'une
    // page précédente n'a plus de sens sous un nouveau périmètre de données.
    loadMoreControllerRef.current?.abort();
    loadMoreControllerRef.current = null;
    const requestGeneration = requestGenerationRef.current + 1;
    requestGenerationRef.current = requestGeneration;
    const resultScope = { request: requestScopeKey };
    setHistoryEvents([]);
    setNextCursor(null);
    setLoadingMore(false);
    setError('');

    if (query !== debouncedQuery) {
      setHistoryEventsLoading(true);
      setPeriodError('');
      return undefined;
    }
    if (startFilter && endFilter && startFilter > endFilter) {
      setHistoryEventsLoading(false);
      setPeriodError('La date de début doit être antérieure à la date de fin.');
      return undefined;
    }
    setPeriodError('');

    const controller = new AbortController();
    setHistoryEventsLoading(true);
    void listWorkshopHistoryEvents(buildIncidentWorkspaceParams(baseParams), controller.signal)
      .then((page) => {
        if (controller.signal.aborted || requestGeneration !== requestGenerationRef.current) return;
        setHistoryEvents(page.items);
        setNextCursor(page.nextCursor);
        setLoadedResultScope(resultScope);
      })
      .catch(() => {
        if (controller.signal.aborted || requestGeneration !== requestGenerationRef.current) return;
        setLoadedResultScope(resultScope);
        setError('Impossible de charger le journal atelier.');
      })
      .finally(() => {
        if (!controller.signal.aborted && requestGeneration === requestGenerationRef.current) {
          setHistoryEventsLoading(false);
        }
      });
    return () => {
      controller.abort();
      loadMoreControllerRef.current?.abort();
      loadMoreControllerRef.current = null;
    };
  }, [baseParams, requestScopeKey, query, debouncedQuery, startFilter, endFilter]);

  const urlFiltersMatch =
    (canonicalDates.params.get('q') ?? '') === query &&
    readHistoryStatusFilter(canonicalDates.params.get('status')) === statusFilter &&
    (canonicalDates.params.get('line') ?? 'all') === lineFilter &&
    (canonicalDates.params.get('machine') ?? 'all') === machineFilter &&
    (canonicalDates.params.get('state') ?? 'all') === stateFilter &&
    (canonicalDates.params.get('event') ?? 'all') === eventTypeFilter &&
    canonicalDates.start === startFilter &&
    canonicalDates.end === endFilter;
  const resultsAreCurrent =
    loadedResultScope?.request === requestScopeKey && query === debouncedQuery && urlFiltersMatch;

  const loadMore = useCallback((): void => {
    if (!resultsAreCurrent || !nextCursor || loadingMore) return;
    const controller = new AbortController();
    const requestGeneration = requestGenerationRef.current;
    loadMoreControllerRef.current = controller;
    setLoadingMore(true);
    setError('');
    void listWorkshopHistoryEvents(
      buildIncidentWorkspaceParams({ ...baseParams, cursor: nextCursor }),
      controller.signal
    )
      .then((page) => {
        if (
          controller.signal.aborted ||
          requestGeneration !== requestGenerationRef.current ||
          loadMoreControllerRef.current !== controller
        )
          return;
        setHistoryEvents((current) => [...current, ...page.items]);
        setNextCursor(page.nextCursor);
      })
      .catch(() => {
        if (
          controller.signal.aborted ||
          requestGeneration !== requestGenerationRef.current ||
          loadMoreControllerRef.current !== controller
        )
          return;
        setError('Impossible de charger la suite du journal atelier.');
      })
      .finally(() => {
        if (loadMoreControllerRef.current !== controller) return;
        loadMoreControllerRef.current = null;
        if (!controller.signal.aborted && requestGeneration === requestGenerationRef.current) {
          setLoadingMore(false);
        }
      });
  }, [baseParams, nextCursor, loadingMore, resultsAreCurrent]);

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
    if ((value && !isCanonicalCivilDate(value)) || (value && endFilter && value > endFilter)) {
      return;
    }
    const nextParams = new URLSearchParams(searchParams);
    if (value) nextParams.set('start', value);
    else nextParams.delete('start');
    if (endFilter) nextParams.set('end', endFilter);
    else nextParams.delete('end');
    setSearchParams(nextParams);
  }

  function updateEndFilter(value: string): void {
    setEndFilter(value);
    if ((value && !isCanonicalCivilDate(value)) || (startFilter && value && startFilter > value)) {
      return;
    }
    const nextParams = new URLSearchParams(searchParams);
    if (startFilter) nextParams.set('start', startFilter);
    else nextParams.delete('start');
    if (value) nextParams.set('end', value);
    else nextParams.delete('end');
    setSearchParams(nextParams);
  }

  function clearPeriodFilter(): void {
    setStartFilter('');
    setEndFilter('');
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('start');
    nextParams.delete('end');
    setSearchParams(nextParams);
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

  const visibleHistoryEvents = useMemo(
    () => (resultsAreCurrent ? historyEvents : []),
    [historyEvents, resultsAreCurrent]
  );
  const visibleLoadingMore = resultsAreCurrent ? loadingMore : false;
  const hasInvalidPeriod = Boolean(startFilter && endFilter && startFilter > endFilter);
  const visibleHistoryEventsLoading =
    !hasInvalidPeriod && (historyEventsLoading || !resultsAreCurrent);

  const sortedEvents = useMemo(() => {
    const copy = [...visibleHistoryEvents];
    const dir = sortDir === 'asc' ? 1 : -1;
    copy.sort((a, b) => {
      switch (sortCol) {
        case 'date':
          return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        case 'action':
          return (
            dir * formatEventLabel(a.event_type).localeCompare(formatEventLabel(b.event_type), 'fr')
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
  }, [visibleHistoryEvents, sortCol, sortDir]);

  return {
    lines,
    historyEvents: visibleHistoryEvents,
    sortedEvents,
    historyEventsLoading: visibleHistoryEventsLoading,
    loadingMore: visibleLoadingMore,
    hasMore: resultsAreCurrent && nextCursor !== null,
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
    clearPeriodFilter,
    clearFilters,
    handleSort,
  };
}
