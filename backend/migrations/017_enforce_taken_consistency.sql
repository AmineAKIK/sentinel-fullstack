-- Enforce that is_taken, taken_by_user_id, and taken_at are always consistent.
-- A taken incident must have both taken_by_user_id and taken_at set.
-- An untaken incident must have both cleared.
ALTER TABLE workshop_incidents
  ADD CONSTRAINT chk_taken_consistency
    CHECK (
      (is_taken = false AND taken_by_user_id IS NULL AND taken_at IS NULL)
      OR
      (is_taken = true AND taken_by_user_id IS NOT NULL AND taken_at IS NOT NULL)
    );

-- A PENDING incident must always be taken (MAINTENANCE owns it).
ALTER TABLE workshop_incidents
  ADD CONSTRAINT chk_pending_must_be_taken
    CHECK (status != 'PENDING' OR is_taken = true);

-- Every audit event must have an actor — the system never logs anonymously.
ALTER TABLE workshop_incident_events
  ALTER COLUMN actor_user_id SET NOT NULL;

-- edit_request, when set, must be a JSON object containing at least one known field.
ALTER TABLE workshop_incidents
  ADD CONSTRAINT chk_edit_request_shape
    CHECK (
      edit_request IS NULL
      OR (
        jsonb_typeof(edit_request) = 'object'
        AND (
          edit_request ? 'state'
          OR edit_request ? 'shift'
          OR edit_request ? 'machineId'
          OR edit_request ? 'robotLabel'
          OR edit_request ? 'headNumber'
          OR edit_request ? 'comment'
          OR edit_request ? 'currentProduct'
        )
      )
    );

-- Existing databases can contain several active incidents for the same machine
-- slot from before this invariant existed. Keep the most recently updated one
-- active and cancel the older duplicates before creating the unique index.
WITH ranked_active_incidents AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY line_id, machine_id, robot_label, head_number
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS duplicate_rank
  FROM workshop_incidents
  WHERE status IN ('OPEN', 'PENDING')
)
UPDATE workshop_incidents wi
SET
  status = 'CANCELED',
  delete_request = false,
  delete_request_reason = NULL,
  edit_request = NULL,
  updated_at = NOW(),
  responsible_comment = CONCAT_WS(
    E'\n',
    NULLIF(wi.responsible_comment, ''),
    'Annulation technique automatique: doublon actif sur le meme emplacement machine avant verrouillage de coherence.'
  )
FROM ranked_active_incidents ranked
WHERE wi.id = ranked.id
  AND ranked.duplicate_rank > 1;

-- Only one active (OPEN or PENDING) incident per machine slot at a time.
CREATE UNIQUE INDEX idx_unique_active_incident_per_machine
  ON workshop_incidents (line_id, machine_id, robot_label, head_number)
  WHERE status IN ('OPEN', 'PENDING');
