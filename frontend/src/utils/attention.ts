/**
 * Niveaux d'attention — source unique de la sémantique d'attention de l'app
 * (doctrine §5.1, P1/P4). Toute couleur d'état doit dériver d'ici, pas être
 * recalculée localement.
 */
export type AttentionLevel = 'calm' | 'watch' | 'act' | 'critical';

interface IncidentLike {
  is_priority: boolean;
  is_taken: boolean;
  status: string;
}

/**
 * Niveau d'attention d'un incident actif.
 * - critique : urgent (priorité responsable) ;
 * - à traiter : ouvert et non pris en charge (demande une action) ;
 * - à surveiller : en attente, ou pris en charge mais pas encore résolu ;
 * - calme : tout le reste (résolu, clôturé).
 */
export function incidentAttentionLevel(incident: IncidentLike): AttentionLevel {
  if (
    incident.status === 'CLOSED' ||
    incident.status === 'CANCELED' ||
    incident.status === 'INVALIDATED'
  ) {
    return 'calm';
  }
  if (incident.is_priority) return 'critical';
  if (incident.status === 'OPEN' && !incident.is_taken) return 'act';
  return 'watch';
}
