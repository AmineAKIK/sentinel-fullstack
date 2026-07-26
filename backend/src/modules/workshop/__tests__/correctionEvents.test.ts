import {
  buildVersionedCorrectionChanges,
  CORRECTION_EVENT_SCHEMA_VERSION,
  type VersionedCorrectionChanges,
} from '../workshop.correctionEvents';

// Le contrat de traçabilité RC3 (§5.1) : le payload d'une correction est
// versionné et autoportant. Le snapshot AVANT est pris à la demande depuis la
// ligne courante (dans la transaction) ; l'APRÈS est la valeur demandée. On ne
// stocke que les champs réellement changés.

const currentRow = {
  line_id: 1,
  machine_id: 'M01',
  robot_label: 'Droite 4',
  head_number: 2,
  state: 'DEGRADEE',
  comment: 'ancien commentaire',
  current_product: 'TBM',
} as never;

describe('buildVersionedCorrectionChanges (lot 4 RC3)', () => {
  it('produit un payload schemaVersion 2 avec before/after par champ changé', () => {
    const requested = { state: 'INDISPONIBLE', currentProduct: 'E365' };
    const payload: VersionedCorrectionChanges = buildVersionedCorrectionChanges(
      requested,
      currentRow
    );

    expect(payload.schemaVersion).toBe(CORRECTION_EVENT_SCHEMA_VERSION);
    expect(payload.schemaVersion).toBe(2);
    expect(payload.changes).toEqual({
      state: { before: 'DEGRADEE', after: 'INDISPONIBLE' },
      currentProduct: { before: 'TBM', after: 'E365' },
    });
  });

  it('capture le before depuis la ligne courante, pas depuis la valeur demandée', () => {
    const requested = { headNumber: 5 };
    const payload = buildVersionedCorrectionChanges(requested, currentRow);
    expect(payload.changes.headNumber).toEqual({ before: 2, after: 5 });
  });

  it('n’inclut que les champs présents dans la demande', () => {
    const requested = { comment: 'nouveau' };
    const payload = buildVersionedCorrectionChanges(requested, currentRow);
    expect(Object.keys(payload.changes)).toEqual(['comment']);
    expect(payload.changes.comment).toEqual({ before: 'ancien commentaire', after: 'nouveau' });
  });

  it('mappe lineId/machineId/etc. vers les bonnes colonnes de la ligne courante', () => {
    const requested = { lineId: 9, machineId: 'M99', robotLabel: 'Gauche 1' };
    const payload = buildVersionedCorrectionChanges(requested, currentRow);
    expect(payload.changes.lineId).toEqual({ before: 1, after: 9 });
    expect(payload.changes.machineId).toEqual({ before: 'M01', after: 'M99' });
    expect(payload.changes.robotLabel).toEqual({ before: 'Droite 4', after: 'Gauche 1' });
  });
});
