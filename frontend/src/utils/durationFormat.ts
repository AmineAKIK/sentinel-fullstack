const TERMINAL_STATUSES = new Set(['CLOSED', 'CANCELED', 'INVALIDATED']);

export function formatDuration(startIso: string, endIso: string): string {
  const diffMs = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (diffMs <= 0) return '—';
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} j`;
}

export function formatIncidentDuration(startIso?: string, endIso?: string, status?: string): string {
  if (!startIso) return '—';
  if (!TERMINAL_STATUSES.has(status ?? '')) return 'En cours';
  if (!endIso) return '—';
  return formatDuration(startIso, endIso);
}
