ALTER TABLE workshop_incidents
  ADD COLUMN IF NOT EXISTS cancel_request BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cancel_request_reason TEXT;

UPDATE workshop_incidents
SET
  cancel_request = delete_request,
  cancel_request_reason = delete_request_reason
WHERE delete_request = TRUE
  AND cancel_request = FALSE;

ALTER TABLE workshop_incidents
  DROP CONSTRAINT IF EXISTS chk_workshop_incidents_status;

ALTER TABLE workshop_incidents
  ADD CONSTRAINT chk_workshop_incidents_status
  CHECK (status IN ('OPEN', 'PENDING', 'CLOSED', 'CANCELED', 'INVALIDATED'));

ALTER TABLE workshop_incident_followers
  DROP CONSTRAINT IF EXISTS workshop_incident_followers_incident_id_fkey,
  DROP CONSTRAINT IF EXISTS workshop_incident_followers_user_id_fkey;

ALTER TABLE workshop_incident_followers
  ADD CONSTRAINT workshop_incident_followers_incident_id_fkey
    FOREIGN KEY (incident_id) REFERENCES workshop_incidents(id) ON DELETE RESTRICT,
  ADD CONSTRAINT workshop_incident_followers_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES sentinel_users(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_workshop_incidents_cancel_request_active
  ON workshop_incidents (cancel_request, updated_at DESC)
  WHERE cancel_request = TRUE AND status IN ('OPEN', 'PENDING');
