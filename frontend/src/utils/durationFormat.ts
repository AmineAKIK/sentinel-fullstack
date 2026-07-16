import { formatElapsed } from './date';

const TERMINAL_STATUSES = new Set(['CLOSED', 'CANCELED', 'INVALIDATED']);

/**
 * Durée d'un incident pour l'historique / la connaissance : « En cours » tant
 * qu'il n'est pas dans un état terminal, sinon la durée écoulée entre création
 * et clôture. Le formatage de la durée est délégué à formatElapsed (source
 * unique, §5.6) — cette fonction ne porte que la logique métier du statut.
 */
export function formatIncidentDuration(
  startIso?: string,
  endIso?: string,
  status?: string
): string {
  if (!startIso) return '—';
  if (!TERMINAL_STATUSES.has(status ?? '')) return 'En cours';
  if (!endIso) return '—';
  return formatElapsed(startIso, endIso);
}
