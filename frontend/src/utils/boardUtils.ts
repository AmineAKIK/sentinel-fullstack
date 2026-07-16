import { WorkshopBoardIncident } from '../types';
import { isOlderThanDays } from './date';

export const BOARD_SESSION_SCREEN_KEY = 'sentinel.board.sessionScreenId.v1';

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatClock(date: Date): string {
  return date.toLocaleString('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function statusLabel(incident: WorkshopBoardIncident): string {
  if (incident.status === 'PENDING') return 'En attente';
  return incident.is_taken ? 'Pris en charge' : 'Non pris';
}

export function isOpenOverSevenDays(incident: WorkshopBoardIncident): boolean {
  return incident.status === 'OPEN' && isOlderThanDays(incident.created_at, 7);
}

export function formatStaleDuration(since: Date, now: Date): string {
  const diffMs = now.getTime() - since.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "moins d'1 min";
  if (diffMin === 1) return '1 min';
  if (diffMin < 60) return `${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  return diffH === 1 ? '1 h' : `${diffH} h`;
}

export function paginate<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [[]];
  const pageSize = Number.isFinite(size) ? Math.max(1, Math.floor(size)) : 1;
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += pageSize) {
    pages.push(items.slice(index, index + pageSize));
  }
  return pages;
}

export function normalizeScreenId(value: string | null): string {
  const normalized = (value || 'default')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .slice(0, 64);
  return normalized || 'default';
}

export function getOrCreateSessionScreenId(): string {
  try {
    const existing = window.sessionStorage.getItem(BOARD_SESSION_SCREEN_KEY);
    if (existing) return existing;
    const generated = `ecran-${Math.random().toString(36).slice(2, 8)}`;
    window.sessionStorage.setItem(BOARD_SESSION_SCREEN_KEY, generated);
    return generated;
  } catch {
    return 'ecran-local';
  }
}
