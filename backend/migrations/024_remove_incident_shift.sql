-- Retrait du champ "shift" (poste) des incidents atelier.
-- Le poste était une donnée saisie manuellement, jamais utilisée pour
-- l'analyse ni le filtrage ; la date/heure de création couvre le besoin
-- temporel de façon fiable et automatique.

-- 1. Retirer la contrainte CHECK sur les valeurs de shift (créée en 015).
ALTER TABLE workshop_incidents
  DROP CONSTRAINT IF EXISTS chk_workshop_incidents_shift;

-- 2. Supprimer la colonne.
ALTER TABLE workshop_incidents
  DROP COLUMN IF EXISTS shift;

-- 3. Recréer la contrainte de forme des demandes de correction sans 'shift'.
ALTER TABLE workshop_incidents
  DROP CONSTRAINT IF EXISTS chk_edit_request_shape,
  ADD CONSTRAINT chk_edit_request_shape
    CHECK (
      edit_request IS NULL
      OR (
        jsonb_typeof(edit_request) = 'object'
        AND (
          edit_request ? 'lineId'
          OR edit_request ? 'state'
          OR edit_request ? 'machineId'
          OR edit_request ? 'robotLabel'
          OR edit_request ? 'headNumber'
          OR edit_request ? 'comment'
          OR edit_request ? 'currentProduct'
        )
      )
    );
