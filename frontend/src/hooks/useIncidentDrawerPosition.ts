import { useLayoutEffect, useState, type RefObject } from 'react';

const STACKED_DETAIL_LAYOUT_QUERY = '(max-width: 1180px)';

function getFocusViewport() {
  const nav = document.querySelector<HTMLElement>('.nav-bar');
  const navBottom = nav?.getBoundingClientRect().bottom ?? 0;
  const top = Math.max(72, Math.round(navBottom + 16));
  const bottom = Math.min(window.innerHeight - 16, Math.max(top + 180, window.innerHeight - 24));
  const height = Math.max(180, bottom - top);
  return {
    top,
    bottom,
    height,
    center: top + height / 2,
  };
}

function prefersReducedMotion(): boolean {
  return Boolean(
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function usesStackedDetailLayout(): boolean {
  return Boolean(
    typeof window.matchMedia === 'function' &&
    window.matchMedia(STACKED_DETAIL_LAYOUT_QUERY).matches
  );
}

/**
 * Positionne le drawer de détail incident au niveau de la carte
 * sélectionnée dans la liste (desktop), et gère le scroll/focus
 * automatique vers cette carte à l'ouverture. Bascule en position fixe
 * (offset 0, pas de scroll programmatique) sur layout empilé (mobile).
 *
 * focusedIncidentId reste piloté par l'appelant (setFocusedIncidentId en
 * paramètre) car plusieurs autres actions de la page (sélection depuis
 * l'URL, navigation, ouverture d'arbitrage) le réinitialisent aussi.
 */
export function useIncidentDrawerPosition({
  workbenchRef,
  detailDrawerRef,
  selectedIncidentId,
  selectedIncidentUpdatedAt,
  sortedIncidentPositionKey,
  loading,
  sortOrder,
  setFocusedIncidentId,
}: {
  workbenchRef: RefObject<HTMLDivElement | null>;
  detailDrawerRef: RefObject<HTMLElement | null>;
  selectedIncidentId: number | null;
  selectedIncidentUpdatedAt: string | null;
  sortedIncidentPositionKey: string;
  loading: boolean;
  sortOrder: string;
  setFocusedIncidentId: (id: number | null) => void;
}) {
  const [detailOffsetTop, setDetailOffsetTop] = useState(0);

  useLayoutEffect(() => {
    if (selectedIncidentId === null) {
      setDetailOffsetTop(0);
      return;
    }

    function updateDetailOffset() {
      if (usesStackedDetailLayout()) {
        setDetailOffsetTop(0);
        return;
      }

      const workbenchElement = workbenchRef.current;
      if (!workbenchElement) return;

      const selectedCard = workbenchElement.querySelector<HTMLElement>(
        `[data-incident-card-id="${selectedIncidentId}"]`
      );
      if (!selectedCard) {
        setDetailOffsetTop(0);
        return;
      }

      const workbenchTop = workbenchElement.getBoundingClientRect().top;
      const cardRect = selectedCard.getBoundingClientRect();
      const drawerRect = detailDrawerRef.current?.getBoundingClientRect();
      const focusViewport = getFocusViewport();
      const visualDrawerHeight = Math.min(
        drawerRect?.height ?? cardRect.height,
        Math.max(320, focusViewport.height)
      );
      const cardCenter = cardRect.top - workbenchTop + cardRect.height / 2;
      const nextOffset = Math.max(0, Math.round(cardCenter - visualDrawerHeight / 2));
      setDetailOffsetTop((currentOffset) =>
        currentOffset === nextOffset ? currentOffset : nextOffset
      );
    }

    updateDetailOffset();
    const frameId = window.requestAnimationFrame(updateDetailOffset);
    window.addEventListener('resize', updateDetailOffset);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', updateDetailOffset);
    };
  }, [
    workbenchRef,
    detailDrawerRef,
    selectedIncidentId,
    selectedIncidentUpdatedAt,
    sortedIncidentPositionKey,
    loading,
    sortOrder,
  ]);

  useLayoutEffect(() => {
    if (selectedIncidentId === null || loading) {
      setFocusedIncidentId(null);
      return;
    }

    setFocusedIncidentId(null);

    function focusSelectedIncident() {
      if (usesStackedDetailLayout()) {
        const detailDrawer = detailDrawerRef.current;
        if (!detailDrawer) return false;
        detailDrawer.scrollIntoView({
          block: 'start',
          behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        });
        return true;
      }

      const workbenchElement = workbenchRef.current;
      if (!workbenchElement) return false;

      const selectedCard = workbenchElement.querySelector<HTMLElement>(
        `[data-incident-card-id="${selectedIncidentId}"]`
      );
      if (!selectedCard) return false;

      const cardRect = selectedCard.getBoundingClientRect();
      if (cardRect.width === 0 && cardRect.height === 0) return true;

      const focusViewport = getFocusViewport();
      const cardCenter = cardRect.top + cardRect.height / 2;
      const delta = cardCenter - focusViewport.center;
      if (Math.abs(delta) > 8) {
        window.scrollBy({
          top: delta,
          behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        });
      }
      return true;
    }

    let settleTimer: number | undefined;
    const frameId = window.requestAnimationFrame(() => {
      const didResolveFocus = focusSelectedIncident();
      settleTimer = window.setTimeout(
        () => {
          if (didResolveFocus) setFocusedIncidentId(selectedIncidentId);
        },
        prefersReducedMotion() ? 0 : 220
      );
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      if (settleTimer !== undefined) window.clearTimeout(settleTimer);
    };
  }, [
    workbenchRef,
    detailDrawerRef,
    selectedIncidentId,
    loading,
    sortedIncidentPositionKey,
    setFocusedIncidentId,
  ]);

  return { detailOffsetTop };
}
