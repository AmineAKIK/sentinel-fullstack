import { useEffect, useRef, useState } from 'react';

export interface UseDragDropReturn {
  draggedIncidentId: number | null;
  dragOverIncidentId: number | null;
  setDraggedIncidentId: React.Dispatch<React.SetStateAction<number | null>>;
  scheduleAutoScroll: (clientY: number) => void;
  setDropTarget: (id: number) => void;
  clearDropTarget: (id: number) => void;
  resetDragState: () => void;
}

export function useDragDrop(): UseDragDropReturn {
  const [draggedIncidentId, setDraggedIncidentId] = useState<number | null>(null);
  const [dragOverIncidentId, setDragOverIncidentId] = useState<number | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const scrollSpeedRef = useRef(0);

  function stopAutoScroll() {
    scrollSpeedRef.current = 0;
    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = null;
    }
  }

  function scheduleAutoScroll(clientY: number) {
    const edgeSize = 120;
    const maxStep = 16;
    const viewportHeight = window.innerHeight;
    let nextSpeed = 0;

    if (clientY < edgeSize) {
      const intensity = (edgeSize - clientY) / edgeSize;
      nextSpeed = -Math.ceil(maxStep * intensity);
    } else if (clientY > viewportHeight - edgeSize) {
      const intensity = (clientY - (viewportHeight - edgeSize)) / edgeSize;
      nextSpeed = Math.ceil(maxStep * intensity);
    }

    scrollSpeedRef.current = nextSpeed;
    if (nextSpeed === 0) {
      stopAutoScroll();
      return;
    }

    if (scrollFrameRef.current !== null) return;
    const tick = () => {
      if (scrollSpeedRef.current === 0) {
        scrollFrameRef.current = null;
        return;
      }
      window.scrollBy(0, scrollSpeedRef.current);
      scrollFrameRef.current = window.requestAnimationFrame(tick);
    };
    scrollFrameRef.current = window.requestAnimationFrame(tick);
  }

  useEffect(() => {
    return () => {
      stopAutoScroll();
    };
  }, []);

  function resetDragState() {
    setDraggedIncidentId(null);
    setDragOverIncidentId(null);
    stopAutoScroll();
  }

  function setDropTarget(id: number) {
    if (dragOverIncidentId !== id) {
      setDragOverIncidentId(id);
    }
  }

  function clearDropTarget(id: number) {
    if (dragOverIncidentId === id) {
      setDragOverIncidentId(null);
    }
  }

  return {
    draggedIncidentId,
    dragOverIncidentId,
    setDraggedIncidentId,
    scheduleAutoScroll,
    setDropTarget,
    clearDropTarget,
    resetDragState,
  };
}
