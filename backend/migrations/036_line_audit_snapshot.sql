-- Fige le numéro de ligne dans chaque événement d'audit de ligne.
--
-- Problème symétrique à la migration 025 pour les utilisateurs : une fois
-- qu'une ligne est archivée (is_deleted = TRUE), la jointure live sur
-- production_lines ne retrouve plus son line_number — il apparaît NULL dans
-- le journal. Le journal devient illisible rétroactivement.
--
-- Solution : snapshot de target_line_number au moment de chaque événement.

ALTER TABLE line_audit_events
  ADD COLUMN IF NOT EXISTS target_line_number VARCHAR;

-- Backfill des events existants depuis l'état courant de production_lines.
-- Les lignes déjà archivées conserveront leur line_number car la colonne
-- n'est pas effacée à l'archivage (soft-delete).
UPDATE line_audit_events le
SET target_line_number = pl.line_number
FROM production_lines pl
WHERE pl.id = le.target_line_id
  AND le.target_line_number IS NULL;
