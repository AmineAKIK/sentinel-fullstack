-- RC3 lot 7 (C-05) : la mise en attente doit être un concept métier à part
-- entière — un « motif de mise en attente » — et non un « diagnostic ».
--
-- Jusqu'ici la suspension écrivait le motif dans workshop_incidents.diagnostic,
-- alors que ce champ est affiché comme un diagnostic (dossier, base de
-- connaissances). On introduit une colonne waiting_reason dédiée.
--
-- Backfill : les incidents ACTUELLEMENT en attente portent, dans diagnostic,
-- un motif de mise en attente (jamais un vrai diagnostic). On recopie donc
-- cette valeur vers waiting_reason PUIS on efface diagnostic pour ces seules
-- lignes, afin qu'elle ne soit plus jamais présentée comme un diagnostic.
-- Les incidents non PENDING ne sont pas touchés. Les anciennes traces
-- d'événements INCIDENT_SET_PENDING restent lisibles telles quelles (leur
-- payload conserve `diagnostic`, réinterprété à la lecture comme un motif de
-- mise en attente historique).

ALTER TABLE workshop_incidents
  ADD COLUMN IF NOT EXISTS waiting_reason TEXT;

UPDATE workshop_incidents
SET waiting_reason = diagnostic,
    diagnostic = NULL
WHERE status = 'PENDING'
  AND diagnostic IS NOT NULL
  AND waiting_reason IS NULL;

COMMENT ON COLUMN workshop_incidents.waiting_reason IS
  'Motif de mise en attente courant (RC3 lot 7). Renseigné à la suspension, effacé à la reprise ; l''historique du motif est conservé dans les événements INCIDENT_SET_PENDING.';
