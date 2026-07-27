import { WorkshopIncidentEvent } from '../types';
import { STATE_LABELS as STATE_LABELS_MAP } from './labels';
export { formatDateTime, formatSeconds } from './date';
export { STATE_LABELS, STATUS_LABELS } from './labels';
export { WORKSHOP_EVENT_LABELS as EVENT_LABELS } from './labels';

export type HistoryPeriod = 'today' | '7d' | '30d' | 'lifetime' | 'custom';

// Événements de correction dont le payload versionné (schemaVersion 2) porte un
// diff avant/après. Un événement de correction ANTÉRIEUR à la RC3 n'a pas ce
// format : on ne recompose alors aucun avant/après (on ne l'invente pas).
const CORRECTION_EVENT_TYPES = new Set(['EDIT_REQUESTED', 'EDIT_APPLIED', 'EDIT_REJECTED']);

const CORRECTION_FIELD_LABELS: Record<string, string> = {
  lineId: 'Ligne',
  machineId: 'Machine',
  robotLabel: 'Robot',
  headNumber: 'Tête',
  state: 'État',
  comment: 'Commentaire',
  currentProduct: 'Produit en cours',
};

function asString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

// Traduit une valeur métier pour l'affichage (les états ont un libellé français).
const STATE_LABEL_LOOKUP: Record<string, string> = STATE_LABELS_MAP;

function displayCorrectionValue(field: string, value: unknown): string {
  const raw = asString(value);
  if (raw === '') return '∅';
  if (field === 'state') return STATE_LABEL_LOOKUP[raw] ?? raw;
  return raw;
}

/**
 * Rend un payload de correction versionné en libellés « Champ : avant → après ».
 * Renvoie null si le payload n'est pas au format versionné (before/after absents)
 * — l'appelant affichera alors une formulation honnête sans inventer de valeurs.
 */
export function formatVersionedCorrection(payload: Record<string, unknown>): string | null {
  if (payload.schemaVersion !== 2 || !payload.changes || typeof payload.changes !== 'object') {
    return null;
  }
  const changes = payload.changes as Record<string, { before?: unknown; after?: unknown }>;
  const parts: string[] = [];
  for (const [field, change] of Object.entries(changes)) {
    if (!change || typeof change !== 'object' || !('before' in change) || !('after' in change)) {
      continue;
    }
    const label = CORRECTION_FIELD_LABELS[field] ?? field;
    parts.push(
      `${label} : ${displayCorrectionValue(field, change.before)} → ${displayCorrectionValue(field, change.after)}`
    );
  }
  if (parts.length === 0) return null;
  let detail = parts.join(' · ');
  if (typeof payload.decisionReason === 'string' && payload.decisionReason.trim() !== '') {
    detail += ` — Motif : ${payload.decisionReason.trim()}`;
  }
  return detail;
}

export function formatEventActor(event: WorkshopIncidentEvent): string {
  if (!event.first_name) return 'Systeme';
  const fullName = `${event.first_name} ${event.last_name ?? ''}`.trim();
  return event.role ? `${fullName} · ${event.role}` : fullName;
}

export function formatEventDetail(event: WorkshopIncidentEvent): string {
  if (!event.payload) return '';
  const payload = event.payload;

  // Corrections : restitution avant → après depuis le payload versionné. Un
  // événement antérieur (sans schemaVersion 2) ne permet pas de reconstruire le
  // détail : on l'annonce honnêtement plutôt que d'inventer des valeurs.
  if (CORRECTION_EVENT_TYPES.has(event.event_type)) {
    const versioned = formatVersionedCorrection(payload);
    if (versioned) return versioned;
    return 'Détail non enregistré pour cet événement antérieur.';
  }

  if (event.event_type === 'PRIORITY_CHANGED') {
    if (payload.value !== undefined) return payload.value ? 'Urgent' : 'Normal';
    if (payload.to !== undefined) return payload.to ? 'Urgent' : 'Normal';
  }
  if (
    event.event_type === 'ORDER_CHANGED' &&
    payload.from !== undefined &&
    payload.to !== undefined
  ) {
    return `position ${asString(payload.from)} → ${asString(payload.to)}`;
  }
  if (event.event_type === 'INCIDENT_UPDATED') {
    const fields = Array.isArray(payload.fields) ? payload.fields : payload.changedFields;
    if (Array.isArray(fields) && fields.length > 0)
      return `champs: ${(fields as string[]).join(', ')}`;
  }
  if (event.event_type === 'RESPONSIBLE_COMMENT_UPDATED') return 'consigne mise à jour';
  if (event.event_type === 'INCIDENT_INVALIDATED') {
    if (payload.reason) return asString(payload.reason);
    return 'retiré des statistiques et de la connaissance';
  }
  if (event.event_type === 'INCIDENT_SET_PENDING') {
    // Nouvelles traces : `waitingReason`. Anciennes traces (avant RC3 lot 7) :
    // `diagnostic`, réinterprété comme un motif de mise en attente historique
    // — jamais présenté comme un diagnostic.
    const reason = payload.waitingReason ?? payload.diagnostic;
    if (reason) return `motif de mise en attente: ${asString(reason).slice(0, 60)}`;
  }
  if (event.event_type === 'INCIDENT_RESUMED' && payload.waitingReason) {
    return `motif levé: ${asString(payload.waitingReason).slice(0, 60)}`;
  }
  if (event.event_type === 'INCIDENT_CLOSED' && payload.interventionNote) {
    return `note: ${asString(payload.interventionNote).slice(0, 60)}`;
  }
  if (event.event_type === 'CANCEL_REQUESTED' || event.event_type === 'DELETE_REQUESTED') {
    if (payload.reason) return asString(payload.reason).slice(0, 80);
  }
  return '';
}
