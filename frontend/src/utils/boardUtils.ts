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

export function ageLabel(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const hours = Math.max(0, Math.floor(diffMs / 3600000));
  if (hours < 1) return '< 1h';
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}j`;
}

export function isOpenOverSevenDays(incident: WorkshopBoardIncident): boolean {
  return incident.status === 'OPEN' && isOlderThanDays(incident.created_at, 7);
}

export function paginate<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [[]];
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    pages.push(items.slice(index, index + size));
  }
  return pages;
}

export function normalizeScreenId(value: string | null): string {
  const normalized = (value || 'default').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
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
