/**
 * Payload versionné et autoportant des événements de correction (RC3, §5.1).
 *
 * Une demande de correction enregistre, pour chaque champ réellement modifié, un
 * couple { before, after }. Le `before` est le snapshot pris AU MOMENT DE LA
 * DEMANDE depuis la ligne courante (dans la transaction) — il ne doit jamais
 * être recalculé plus tard depuis l'incident devenu mutable. L'application et le
 * refus réutilisent exactement ce diff (référencé par requestEventId), de sorte
 * que l'Historique et le Journal disent qui a demandé quoi, sur quelles valeurs,
 * et quelle décision a été prise.
 */

export const CORRECTION_EVENT_SCHEMA_VERSION = 2 as const;

// Champs corrigibles (côté demande) et leur colonne dans la ligne d'incident.
// Doit rester aligné avec EDIT_FIELD_KEYS du service d'édition.
export const CORRECTION_FIELD_TO_INCIDENT_COLUMN = {
  lineId: 'line_id',
  machineId: 'machine_id',
  robotLabel: 'robot_label',
  headNumber: 'head_number',
  state: 'state',
  comment: 'comment',
  currentProduct: 'current_product',
} as const;

export type CorrectionField = keyof typeof CORRECTION_FIELD_TO_INCIDENT_COLUMN;

export interface CorrectionChange {
  before: unknown;
  after: unknown;
}

export interface VersionedCorrectionChanges {
  schemaVersion: typeof CORRECTION_EVENT_SCHEMA_VERSION;
  changes: Partial<Record<CorrectionField, CorrectionChange>>;
}

/**
 * Construit le diff versionné à partir des changements demandés (`{ field: after }`,
 * déjà réduits aux champs réellement modifiés) et de la ligne courante lue dans
 * la transaction. Le `before` provient exclusivement de `currentRow`.
 */
export function buildVersionedCorrectionChanges(
  requestedChanges: Record<string, unknown>,
  currentRow: Record<string, unknown>
): VersionedCorrectionChanges {
  const changes: Partial<Record<CorrectionField, CorrectionChange>> = {};

  for (const field of Object.keys(requestedChanges) as CorrectionField[]) {
    const column = CORRECTION_FIELD_TO_INCIDENT_COLUMN[field];
    if (!column) continue; // ignore tout champ hors périmètre de correction
    changes[field] = {
      before: currentRow[column] ?? null,
      after: requestedChanges[field] ?? null,
    };
  }

  return { schemaVersion: CORRECTION_EVENT_SCHEMA_VERSION, changes };
}

/**
 * Vrai si un payload d'événement est au format versionné RC3 (schemaVersion 2
 * avec un bloc `changes` avant/après). Les événements historiques (payload
 * ancien, sans schemaVersion) renverront false : l'interface affichera alors une
 * formulation honnête plutôt que d'inventer un avant/après.
 */
export function isVersionedCorrectionPayload(
  payload: unknown
): payload is VersionedCorrectionChanges {
  if (!payload || typeof payload !== 'object') return false;
  const record = payload as Record<string, unknown>;
  return (
    record.schemaVersion === CORRECTION_EVENT_SCHEMA_VERSION && typeof record.changes === 'object'
  );
}
