-- Model every incident event actor explicitly and freeze line identities.

ALTER TABLE workshop_incident_events
  ALTER COLUMN actor_user_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS actor_kind VARCHAR NOT NULL DEFAULT 'WORKSHOP_USER',
  ADD COLUMN IF NOT EXISTS actor_admin_id INTEGER REFERENCES admin_accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS actor_display_name VARCHAR;

UPDATE workshop_incident_events
SET actor_kind = 'WORKSHOP_USER',
    actor_display_name = COALESCE(
      actor_display_name,
      NULLIF(CONCAT_WS(' ', actor_first_name, actor_last_name), ''),
      actor_badge_number,
      CONCAT('Utilisateur #', actor_user_id)
    )
WHERE actor_user_id IS NOT NULL;

ALTER TABLE workshop_incident_events
  DROP CONSTRAINT IF EXISTS chk_workshop_incident_event_actor,
  ADD CONSTRAINT chk_workshop_incident_event_actor CHECK (
    (actor_kind = 'WORKSHOP_USER' AND actor_user_id IS NOT NULL AND actor_admin_id IS NULL)
    OR (actor_kind = 'ADMIN' AND actor_user_id IS NULL AND actor_admin_id IS NOT NULL)
    OR (actor_kind = 'SYSTEM' AND actor_user_id IS NULL AND actor_admin_id IS NULL)
  ),
  ADD CONSTRAINT chk_workshop_incident_event_actor_kind
    CHECK (actor_kind IN ('WORKSHOP_USER', 'ADMIN', 'SYSTEM'));

CREATE INDEX IF NOT EXISTS idx_workshop_incident_events_admin_created
  ON workshop_incident_events (actor_admin_id, created_at DESC)
  WHERE actor_admin_id IS NOT NULL;

UPDATE line_audit_events le
SET target_line_number = COALESCE(
  (SELECT pl.line_number FROM production_lines pl WHERE pl.id = le.target_line_id),
  CASE WHEN le.target_line_id IS NOT NULL THEN CONCAT('ID-', le.target_line_id) END,
  'INCONNUE'
)
WHERE le.target_line_number IS NULL;

ALTER TABLE line_audit_events
  ALTER COLUMN target_line_number SET NOT NULL;
