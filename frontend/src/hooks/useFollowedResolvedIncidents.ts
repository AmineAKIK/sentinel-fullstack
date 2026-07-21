import { useCallback, useEffect, useState } from 'react';
import { listWorkshopFollowedResolvedIncidents } from '../api/workshop';
import { WorkshopIncident } from '../types';

const FOLLOWED_RESOLVED_PAGE_SIZE = 100;

/**
 * Suivis résolus (CLOSED/CANCELED/INVALIDATED) — chargés séparément de la
 * projection active du Dashboard (DR-12, lot 7D). `enabled` contrôle le
 * chargement à la demande : n'appelle l'API que quand le filtre « Suivis »
 * est actif, pour ne jamais alourdir le rafraîchissement périodique du
 * Dashboard avec une liste que l'utilisateur n'a pas demandée.
 */
export function useFollowedResolvedIncidents(enabled: boolean) {
  const [incidents, setIncidents] = useState<WorkshopIncident[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!enabled) {
      setIncidents([]);
      setNextCursor(null);
      setError('');
      return undefined;
    }
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void listWorkshopFollowedResolvedIncidents(
      { limit: FOLLOWED_RESOLVED_PAGE_SIZE },
      controller.signal
    )
      .then((page) => {
        if (controller.signal.aborted) return;
        setIncidents(page.items);
        setNextCursor(page.nextCursor);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setError('Impossible de charger les suivis résolus.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [enabled]);

  const loadMore = useCallback((): void => {
    if (!nextCursor || loadingMore) return;
    const controller = new AbortController();
    setLoadingMore(true);
    void listWorkshopFollowedResolvedIncidents(
      { limit: FOLLOWED_RESOLVED_PAGE_SIZE, cursor: nextCursor },
      controller.signal
    )
      .then((page) => {
        if (controller.signal.aborted) return;
        setIncidents((current) => [...current, ...page.items]);
        setNextCursor(page.nextCursor);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setError('Impossible de charger la suite des suivis résolus.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingMore(false);
      });
  }, [nextCursor, loadingMore]);

  return {
    followedResolvedIncidents: incidents,
    followedResolvedLoading: loading,
    followedResolvedLoadingMore: loadingMore,
    followedResolvedHasMore: nextCursor !== null,
    followedResolvedError: error,
    loadMoreFollowedResolved: loadMore,
  };
}
